import { eq, sql } from "drizzle-orm";
import {
  assertThemeTraceability,
  createCollectionRunSchema,
  type BehavioralCodingOutput,
  type ContradictionOutput,
  type EvidenceExtractionOutput,
  type RelevanceOutput,
  type ThemeSynthesisOutput
} from "@zepto/research-contracts";
import { collectionRuns, evidenceItems, getDb, sources, themeEvidence, themes } from "@zepto/research-database";
import { promptDefinitions } from "@zepto/research-prompts";
import type { ServerEnv } from "@zepto/shared-config";
import { AiConfigurationError, AiProviderError } from "./ai/errors.js";
import { createAiProvider } from "./ai/factory.js";
import { runStructuredStage } from "./ai/structured-stage.js";
import { getAdapter, SourceCollectionError } from "./adapters/index.js";
import { contentHash, dedupeDocuments, normalizeText } from "./lib/text.js";

type ClaimedRun = typeof collectionRuns.$inferSelect;

export async function claimNextRun(): Promise<ClaimedRun | null> {
  const db = getDb();
  const result = await db.execute(sql`
    with candidate as (
      select id from collection_runs
      where status = 'queued'
      order by created_at asc
      for update skip locked
      limit 1
    )
    update collection_runs
    set status = 'collecting', current_stage = 'collection', claimed_at = now(), started_at = coalesce(started_at, now()),
        attempt_count = attempt_count + 1, updated_at = now(), error_code = null, error_message = null
    where id = (select id from candidate)
    returning *
  `);
  return (result.rows[0] as ClaimedRun | undefined) ?? null;
}

async function setRun(runId: string, values: Partial<typeof collectionRuns.$inferInsert>): Promise<void> {
  await getDb().update(collectionRuns).set({ ...values, updatedAt: new Date() }).where(eq(collectionRuns.id, runId));
}

function validateExtractedExcerpts(output: EvidenceExtractionOutput, sourceText: string): void {
  for (const item of output.items) {
    if (!sourceText.includes(item.minimalExcerpt)) throw new Error("An extracted excerpt was not an exact substring of the public source text.");
  }
}

export async function processRun(run: ClaimedRun, env: ServerEnv): Promise<void> {
  const db = getDb();
  try {
    const input = createCollectionRunSchema.parse(run.input);
    const adapter = getAdapter(input.sourceType, env);
    const collected = await adapter.collect(input, {
      maxRecords: input.maxRecords,
      ...(input.dateFrom ? { dateFrom: input.dateFrom } : {}),
      ...(input.dateTo ? { dateTo: input.dateTo } : {})
    });
    const normalized = collected.map((document) => ({ ...document, normalizedText: normalizeText(document.normalizedText).slice(0, env.MAX_NORMALIZED_CHARACTERS) }));
    const { unique, duplicateCount } = dedupeDocuments(normalized);
    await setRun(run.id, { status: "processing", currentStage: "normalization_and_deduplication", duplicateCount });

    const persistedSources: Array<typeof sources.$inferSelect> = [];
    for (const document of unique) {
      const [source] = await db.insert(sources).values({
        projectId: run.projectId,
        collectionRunId: run.id,
        externalId: document.externalId,
        sourceType: document.sourceType,
        platform: document.platform,
        url: document.url,
        canonicalUrl: document.canonicalUrl,
        title: document.title,
        publicationDate: document.publicationDate ? new Date(document.publicationDate) : null,
        capturedAt: new Date(document.capturedAt),
        normalizedContent: document.normalizedText,
        contentHash: contentHash(document.normalizedText),
        accessMethod: document.accessMethod,
        policyNote: document.policyNote
      }).onConflictDoNothing().returning();
      if (source) persistedSources.push(source);
    }
    await setRun(run.id, { sourceCount: persistedSources.length, duplicateCount: duplicateCount + unique.length - persistedSources.length });

    let provider;
    try {
      provider = createAiProvider(env);
    } catch (error) {
      if (!(error instanceof AiConfigurationError)) throw error;
      await setRun(run.id, { status: "partially_completed", currentStage: "analysis_not_configured", errorCode: error.code, errorMessage: `${error.message} Sources were retained; configure the selected provider and retry as a new run.`, completedAt: new Date() });
      return;
    }

    await setRun(run.id, { status: "analyzing", currentStage: "relevance" });
    for (const source of persistedSources) {
      if (!source.normalizedContent) continue;
      const relevance = await runStructuredStage<RelevanceOutput>({ collectionRunId: run.id, sourceId: source.id, provider, definition: promptDefinitions.relevance, input: { source: { externalId: source.externalId, url: source.url, platform: source.platform, text: source.normalizedContent } } });
      if (!relevance.output.relevant) continue;

      await setRun(run.id, { currentStage: "evidence_extraction" });
      const extraction = await runStructuredStage<EvidenceExtractionOutput>({ collectionRunId: run.id, sourceId: source.id, provider, definition: promptDefinitions.evidence_extraction, input: { source: { externalId: source.externalId, url: source.url, platform: source.platform, text: source.normalizedContent } }, postValidate: (output) => validateExtractedExcerpts(output, source.normalizedContent ?? "") });
      if (extraction.output.items.length === 0) continue;

      await setRun(run.id, { currentStage: "behavioral_coding" });
      const coding = await runStructuredStage<BehavioralCodingOutput>({ collectionRunId: run.id, sourceId: source.id, provider, definition: promptDefinitions.behavioral_coding, input: { evidenceItems: extraction.output.items.map((item, evidenceIndex) => ({ evidenceIndex, ...item })) }, postValidate: (output) => {
        const indexes = new Set(output.items.map((item) => item.evidenceIndex));
        if (output.items.length !== extraction.output.items.length || extraction.output.items.some((_, index) => !indexes.has(index))) throw new Error("Coding output did not map one-to-one to extracted evidence.");
      } });

      const codingByIndex = new Map(coding.output.items.map((item) => [item.evidenceIndex, item]));
      for (const [index, item] of extraction.output.items.entries()) {
        const code = codingByIndex.get(index);
        if (!code) continue;
        await db.insert(evidenceItems).values({ sourceId: source.id, analysisRunId: extraction.analysisRunId, neutralParaphrase: item.neutralParaphrase, minimalExcerpt: item.minimalExcerpt, categoryGroup: item.categoryGroup, shoppingMission: item.shoppingMission, behavioralCodes: code.codes, interpretationCertainty: item.interpretationCertainty, outcome: item.outcome, jtbd: code.jtbd, mentalModel: code.mentalModel, applicability: item.applicability, transferRationale: item.transferRationale, evidenceValence: item.evidenceValence, limitations: item.limitations });
      }
    }

    const evidence = await db.select({ item: evidenceItems, source: sources }).from(evidenceItems).innerJoin(sources, eq(evidenceItems.sourceId, sources.id)).where(eq(sources.collectionRunId, run.id));
    if (evidence.length === 0) {
      await setRun(run.id, { status: "completed", currentStage: "human_review", evidenceCount: 0, themeCount: 0, completedAt: new Date() });
      return;
    }

    await setRun(run.id, { currentStage: "contradiction_detection", evidenceCount: evidence.length });
    const contradiction = await runStructuredStage<ContradictionOutput>({ collectionRunId: run.id, provider, definition: promptDefinitions.contradiction_detection, input: { evidenceItems: evidence.map(({ item }, evidenceIndex) => ({ evidenceIndex, evidenceId: item.id, paraphrase: item.neutralParaphrase, applicability: item.applicability, currentValence: item.evidenceValence })) }, postValidate: (output) => {
      if (output.relationships.some((relationship) => relationship.evidenceIndex >= evidence.length)) throw new Error("Contradiction output referenced an unknown evidence index.");
    } });
    for (const relationship of contradiction.output.relationships) {
      const row = evidence[relationship.evidenceIndex];
      if (row) await db.update(evidenceItems).set({ evidenceValence: relationship.relationship, updatedAt: new Date() }).where(eq(evidenceItems.id, row.item.id));
    }

    const refreshedEvidence = await db.select({ item: evidenceItems, source: sources }).from(evidenceItems).innerJoin(sources, eq(evidenceItems.sourceId, sources.id)).where(eq(sources.collectionRunId, run.id));
    await setRun(run.id, { currentStage: "theme_synthesis" });
    const synthesis = await runStructuredStage<ThemeSynthesisOutput>({ collectionRunId: run.id, provider, definition: promptDefinitions.theme_synthesis, input: { evidenceItems: refreshedEvidence.map(({ item, source }) => ({ evidenceId: item.id, sourceUrl: source.url, paraphrase: item.neutralParaphrase, codes: item.behavioralCodes, applicability: item.applicability, transferRationale: item.transferRationale, valence: item.evidenceValence, limitations: item.limitations })) }, postValidate: (output) => assertThemeTraceability(output, new Set(refreshedEvidence.map(({ item }) => item.id))) });

    for (const theme of synthesis.output.themes) {
      const [persistedTheme] = await db.insert(themes).values({ projectId: run.projectId, collectionRunId: run.id, analysisRunId: synthesis.analysisRunId, title: theme.title, summary: theme.summary, behavioralMechanism: theme.behavioralMechanism, applicability: theme.applicability, transferRationale: theme.transferRationale, evidenceStrength: theme.evidenceStrength, strengthRationale: theme.strengthRationale, limitations: theme.limitations, claimStatus: theme.basis.claimStatus }).returning({ id: themes.id });
      if (!persistedTheme) continue;
      const relationships = [
        ...theme.evidenceIds.map((evidenceItemId) => ({ evidenceItemId, relationship: "supporting" })),
        ...theme.opposingEvidenceIds.map((evidenceItemId) => ({ evidenceItemId, relationship: "opposing" })),
        ...theme.boundaryEvidenceIds.map((evidenceItemId) => ({ evidenceItemId, relationship: "boundary" }))
      ];
      if (relationships.length > 0) await db.insert(themeEvidence).values(relationships.map((relationship) => ({ themeId: persistedTheme.id, ...relationship })));
    }
    await setRun(run.id, { status: "completed", currentStage: "human_review", themeCount: synthesis.output.themes.length, completedAt: new Date(), errorCode: null, errorMessage: null });
  } catch (error) {
    const code = error instanceof SourceCollectionError || error instanceof AiProviderError ? error.code : "PIPELINE_FAILED";
    const message = error instanceof SourceCollectionError || error instanceof AiProviderError ? error.message : "The research pipeline failed without exposing internal connection details.";
    await setRun(run.id, { status: "failed", currentStage: "failed", errorCode: code, errorMessage: message, completedAt: new Date() });
  }
}
