import { createHash } from "node:crypto";
import { z } from "zod";
import {
  evidenceSentimentSchema,
  mvpAnalysisArtifactSchema,
  mvpBusinessNarrativeSchema,
  mvpEvidenceSchema,
  mvpThemeSchema,
  publicDocumentSchema,
  type MvpAnalysisArtifact,
  type MvpBusinessNarrative,
  type MvpEvidence,
  type MvpRepresentativeReview,
  type MvpTheme,
  type PublicDocument
} from "@zepto/research-contracts";
import { createBoundedBatches } from "./analysis-scale.js";
import { AiProviderError } from "./ai/errors.js";
import { StructuredValidationError } from "./ai/failure-diagnostics.js";
import type { AiProvider, AiStageRequest } from "./ai/types.js";

export const DEFAULT_MVP_EVIDENCE_TEXT_LIMIT = 2_000;
export const DEFAULT_MVP_CLASSIFICATION_BATCH_SIZE = 40;
export const DEFAULT_MVP_CLASSIFICATION_PROMPT_TOKEN_LIMIT = 32_000;
const TAXONOMY_SAMPLE_SIZE = 40;
const REPRESENTATIVE_REVIEWS_PER_THEME = 3;

const taxonomyThemeSchema = z.object({
  key: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(1_200),
  inclusionCriteria: z.string().trim().min(1).max(1_000),
  exclusionCriteria: z.string().trim().min(1).max(1_000),
  dominantIssueCategory: z.string().trim().min(1).max(120).nullable()
}).strict();

const mvpTaxonomyModelOutputSchema = z.object({
  themes: z.array(taxonomyThemeSchema).min(5).max(8)
}).strict().superRefine((output, context) => {
  const keys = new Set<string>();
  const titles = new Set<string>();
  for (const [index, theme] of output.themes.entries()) {
    const normalizedKey = theme.key.toLocaleLowerCase("en");
    const normalizedTitle = theme.title.toLocaleLowerCase("en");
    if (keys.has(normalizedKey)) {
      context.addIssue({
        code: "custom",
        path: ["themes", index, "key"],
        message: "Duplicate temporary Theme keys are not allowed."
      });
    }
    if (titles.has(normalizedTitle)) {
      context.addIssue({
        code: "custom",
        path: ["themes", index, "title"],
        message: "Duplicate Theme titles are not allowed."
      });
    }
    keys.add(normalizedKey);
    titles.add(normalizedTitle);
  }
});

const classificationOutputSchema = z.object({
  assignments: z.array(z.object({
    evidenceId: z.string().min(1),
    themeId: z.string().min(1)
  }).strict())
}).strict();

type MvpTaxonomyModelOutput = z.infer<typeof mvpTaxonomyModelOutputSchema>;
type ClassificationOutput = z.infer<typeof classificationOutputSchema>;
type TaxonomyTheme = z.infer<typeof taxonomyThemeSchema> & { id: string };

export type MvpCorpusContext = {
  sourceMode: "frozen_replay" | "multi_source_snapshot";
  corpusFingerprint: string;
  collectedReviewCount: number;
  eligibleCount: number;
  selectedReviewCount: number;
  duplicatesRemoved: number;
};

export type MvpAnalysisConfig = {
  maxEvidenceTextCharacters: number;
  classificationMaxRecordsPerBatch: number;
  classificationMaxEstimatedPromptTokensPerBatch: number;
  sourceConcentrationWarningThreshold: number;
};

export const defaultMvpAnalysisConfig: MvpAnalysisConfig = {
  maxEvidenceTextCharacters: DEFAULT_MVP_EVIDENCE_TEXT_LIMIT,
  classificationMaxRecordsPerBatch: DEFAULT_MVP_CLASSIFICATION_BATCH_SIZE,
  classificationMaxEstimatedPromptTokensPerBatch:
    DEFAULT_MVP_CLASSIFICATION_PROMPT_TOKEN_LIMIT,
  sourceConcentrationWarningThreshold: 0.6
};

export type MvpClassificationDiagnostic = {
  batchIndex: number;
  evidenceCount: number;
  providerAttempts: number;
  status: "classified" | "classified_with_fallback" | "provider_failure_fallback";
  duplicateConflictCount: number;
  missingAssignmentCount: number;
  providerFailureCount: number;
};

export type MvpThemeResult = {
  themes: MvpTheme[];
  taxonomyThemeCount: number;
  taxonomyProviderRequestCount: number;
  classificationBatchCount: number;
  classificationProviderRequestCount: number;
  categorizedCount: number;
  uncategorizedCount: number;
  duplicateConflictFallbackCount: number;
  missingAssignmentFallbackCount: number;
  providerFailureFallbackCount: number;
  classificationDiagnostics: MvpClassificationDiagnostic[];
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function deterministicExcerpt(text: string, limit: number): string {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("MVP Evidence text limit must be a positive integer.");
  }
  if (text.length <= limit) return text;
  const prefix = text.slice(0, limit);
  const finalWhitespace = prefix.search(/\s+\S*$/);
  return (finalWhitespace > 0 ? prefix.slice(0, finalWhitespace) : prefix).trimEnd();
}

export function mvpEvidenceIdFor(document: PublicDocument): string {
  return `mvp_evidence_${sha256(JSON.stringify([
    document.sourceType,
    document.externalId,
    document.normalizedText
  ]))}`;
}

export function createLocalMvpEvidence(
  documents: readonly PublicDocument[],
  config: Pick<MvpAnalysisConfig, "maxEvidenceTextCharacters"> = defaultMvpAnalysisConfig
): MvpEvidence[] {
  const parsed = publicDocumentSchema.array().parse(documents);
  const evidence = parsed.map((document): MvpEvidence => mvpEvidenceSchema.parse({
    id: mvpEvidenceIdFor(document),
    documentId: document.externalId,
    canonicalText: deterministicExcerpt(
      document.normalizedText,
      config.maxEvidenceTextCharacters
    ),
    sourceType: document.sourceType,
    sourceName: document.sourceName,
    sourceUrl: document.canonicalUrl,
    rating: document.sourceMetadata?.rating ?? null,
    reviewDate: document.publicationDate
  }));
  if (new Set(evidence.map(({ id }) => id)).size !== evidence.length) {
    throw new Error("Duplicate local MVP Evidence IDs are not allowed.");
  }
  return evidence;
}

function localTaxonomyThemeId(theme: z.infer<typeof taxonomyThemeSchema>): string {
  return `mvp_theme_${sha256(JSON.stringify([
    theme.title.trim().toLocaleLowerCase("en"),
    theme.description.trim(),
    theme.inclusionCriteria.trim(),
    theme.exclusionCriteria.trim(),
    theme.dominantIssueCategory?.trim().toLocaleLowerCase("en") ?? null
  ]))}`;
}

function taxonomySample(evidence: readonly MvpEvidence[]): MvpEvidence[] {
  return [...evidence]
    .sort((first, second) => first.id.localeCompare(second.id))
    .slice(0, TAXONOMY_SAMPLE_SIZE);
}

function ratingDistribution(evidence: readonly MvpEvidence[]): MvpTheme["ratingDistribution"] {
  const distribution = { one: 0, two: 0, three: 0, four: 0, five: 0, unknown: 0 };
  for (const { rating } of evidence) {
    if (rating === null) distribution.unknown += 1;
    else if (rating === 1) distribution.one += 1;
    else if (rating === 2) distribution.two += 1;
    else if (rating === 3) distribution.three += 1;
    else if (rating === 4) distribution.four += 1;
    else distribution.five += 1;
  }
  return distribution;
}

function localSentimentDistribution(evidence: readonly MvpEvidence[]): {
  positive: number;
  negative: number;
  neutral: number;
  unknown: number;
} {
  const distribution = { positive: 0, negative: 0, neutral: 0, unknown: 0 };
  for (const { rating } of evidence) {
    if (rating === null) distribution.unknown += 1;
    else if (rating >= 4) distribution.positive += 1;
    else if (rating <= 2) distribution.negative += 1;
    else distribution.neutral += 1;
  }
  return distribution;
}

function dominantSentimentFromRatings(evidence: readonly MvpEvidence[]): MvpTheme["dominantSentiment"] {
  const counts = localSentimentDistribution(evidence);
  const known = [
    ["positive", counts.positive],
    ["negative", counts.negative],
    ["neutral", counts.neutral]
  ] as const;
  const sorted = [...known].sort(
    ([firstName, firstCount], [secondName, secondCount]) =>
      secondCount - firstCount || firstName.localeCompare(secondName)
  );
  if (sorted.length > 1 && sorted[0]![1] === sorted[1]![1]) return "mixed";
  return sorted[0]![0];
}

function rankedEvidence(evidence: readonly MvpEvidence[]): MvpEvidence[] {
  return [...evidence]
    .sort((first, second) => {
      const ratingPriority = (item: MvpEvidence) =>
        item.rating !== null && item.rating <= 2 ? 0
          : item.rating === null || item.rating === 3 ? 1
            : 2;
      return ratingPriority(first) - ratingPriority(second)
        || second.canonicalText.length - first.canonicalText.length
        || (second.reviewDate ?? "").localeCompare(first.reviewDate ?? "")
        || first.id.localeCompare(second.id);
    });
}

function representativeIds(evidence: readonly MvpEvidence[]): string[] {
  const ranked = rankedEvidence(evidence);
  const selected: MvpEvidence[] = [];
  const selectedSources = new Set<string>();
  for (const item of ranked) {
    if (selectedSources.has(item.sourceName)) continue;
    selected.push(item);
    selectedSources.add(item.sourceName);
    if (selected.length === REPRESENTATIVE_REVIEWS_PER_THEME) break;
  }
  for (const item of ranked) {
    if (selected.length === REPRESENTATIVE_REVIEWS_PER_THEME) break;
    if (!selected.some(({ id }) => id === item.id)) selected.push(item);
  }
  return selected.map(({ id }) => id);
}

export async function generateMvpTaxonomy(
  evidence: readonly MvpEvidence[],
  provider: AiProvider
): Promise<{ themes: TaxonomyTheme[]; providerAttempts: number }> {
  const parsedEvidence = mvpEvidenceSchema.array().min(1).parse(evidence);
  const sample = taxonomySample(parsedEvidence);
  const result = await provider.generateStructured({
    stage: "theme_clustering",
    promptVersion: "mvp-theme-taxonomy-v1.0.0",
    schemaName: "mvp_theme_taxonomy",
    systemPrompt: `Create a bounded taxonomy of 5 to 8 distinct product-review Themes.
Return a temporary key, title, concise description, inclusion criteria, exclusion criteria, and a dominant issue category when supported.
Do not assign Evidence, return Evidence IDs, generate quotes, calculate counts, choose representative reviews, or make recommendations.
Return only the requested structured object.`,
    userPrompt: `${JSON.stringify({
      corpus: {
        evidenceCount: parsedEvidence.length,
        ratingDistribution: ratingDistribution(parsedEvidence),
      sourceTypes: [...new Set(parsedEvidence.map(({ sourceType }) => sourceType))].sort()
      },
      representativeSample: sample.map(({ canonicalText, rating, reviewDate, sourceType, sourceName }) => ({
        text: canonicalText,
        rating,
        reviewDate,
        sourceType,
        sourceName
      }))
    })}\n\nReturn only the requested structured object.`,
    jsonSchema: z.toJSONSchema(mvpTaxonomyModelOutputSchema, {
      target: "draft-7",
      unrepresentable: "any"
    }) as Record<string, unknown>,
    validate: (value): MvpTaxonomyModelOutput => mvpTaxonomyModelOutputSchema.parse(value)
  });
  const themes = result.data.themes.map((theme) => ({
    ...theme,
    id: localTaxonomyThemeId(theme)
  }));
  if (new Set(themes.map(({ id }) => id)).size !== themes.length) {
    throw new Error("Local taxonomy Theme IDs must be unique.");
  }
  return { themes, providerAttempts: result.attemptCount };
}

export function validateMvpClassificationOutput(
  value: unknown,
  evidenceIds: ReadonlySet<string>,
  themeIds: ReadonlySet<string>
): ClassificationOutput {
  const output = classificationOutputSchema.parse(value);
  for (const assignment of output.assignments) {
    if (!evidenceIds.has(assignment.evidenceId)) {
      throw new StructuredValidationError(["UNKNOWN_EVIDENCE_ID"], "evidence_assignment");
    }
    if (!themeIds.has(assignment.themeId)) {
      throw new StructuredValidationError(["UNKNOWN_THEME_REFERENCE"], "theme_reference");
    }
  }
  return output;
}

function classificationRequest(
  batch: readonly MvpEvidence[],
  taxonomy: readonly TaxonomyTheme[]
): AiStageRequest<ClassificationOutput> {
  const evidenceIds = new Set(batch.map(({ id }) => id));
  const themeIds = new Set(taxonomy.map(({ id }) => id));
  return {
    stage: "theme_clustering",
    promptVersion: "mvp-evidence-classification-v1.0.0",
    schemaName: "mvp_evidence_classification",
    systemPrompt: `Classify each supplied Evidence record into exactly one supplied Theme.
Return record-oriented assignments containing exactly one evidenceId and one themeId.
Copy both IDs exactly. Do not create Themes, quotes, summaries, counts, recommendations, or extra fields.`,
    userPrompt: `${JSON.stringify({
      taxonomy: taxonomy.map(({
        id,
        title,
        description,
        inclusionCriteria,
        exclusionCriteria,
        dominantIssueCategory
      }) => ({
        themeId: id,
        title,
        description,
        inclusionCriteria,
        exclusionCriteria,
        dominantIssueCategory
      })),
      evidence: batch.map(({ id, canonicalText, rating }) => ({
        evidenceId: id,
        text: canonicalText,
        rating
      }))
    })}\n\nReturn one assignment per supplied Evidence record and only the requested structured object.`,
    jsonSchema: z.toJSONSchema(classificationOutputSchema, {
      target: "draft-7",
      unrepresentable: "any"
    }) as Record<string, unknown>,
    validate: (value) => validateMvpClassificationOutput(value, evidenceIds, themeIds)
  };
}

function duplicateEvidenceIds(assignments: readonly ClassificationOutput["assignments"][number][]): Set<string> {
  const counts = new Map<string, number>();
  for (const { evidenceId } of assignments) {
    counts.set(evidenceId, (counts.get(evidenceId) ?? 0) + 1);
  }
  return new Set(
    [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([evidenceId]) => evidenceId)
  );
}

function errorProviderAttempts(error: unknown): number {
  return error instanceof AiProviderError ? error.attemptCount : 0;
}

async function classifyBatch(
  batch: readonly MvpEvidence[],
  taxonomy: readonly TaxonomyTheme[],
  provider: AiProvider,
  batchIndex: number
): Promise<{
  assignments: Map<string, string>;
  fallbackIds: Set<string>;
  diagnostic: MvpClassificationDiagnostic;
}> {
  let providerAttempts = 0;
  try {
    let result = await provider.generateStructured(classificationRequest(batch, taxonomy));
    providerAttempts += result.attemptCount;
    let conflicts = duplicateEvidenceIds(result.data.assignments);
    if (conflicts.size > 0) {
      result = await provider.generateStructured(classificationRequest(batch, taxonomy));
      providerAttempts += result.attemptCount;
      conflicts = duplicateEvidenceIds(result.data.assignments);
    }

    const assignments = new Map<string, string>();
    for (const { evidenceId, themeId } of result.data.assignments) {
      if (!conflicts.has(evidenceId)) assignments.set(evidenceId, themeId);
    }
    const fallbackIds = new Set(
      batch.map(({ id }) => id).filter((id) => !assignments.has(id))
    );
    const missingAssignmentCount = [...fallbackIds]
      .filter((id) => !conflicts.has(id)).length;
    return {
      assignments,
      fallbackIds,
      diagnostic: {
        batchIndex,
        evidenceCount: batch.length,
        providerAttempts,
        status: fallbackIds.size > 0 ? "classified_with_fallback" : "classified",
        duplicateConflictCount: conflicts.size,
        missingAssignmentCount,
        providerFailureCount: 0
      }
    };
  } catch (error) {
    providerAttempts += errorProviderAttempts(error);
    return {
      assignments: new Map(),
      fallbackIds: new Set(batch.map(({ id }) => id)),
      diagnostic: {
        batchIndex,
        evidenceCount: batch.length,
        providerAttempts,
        status: "provider_failure_fallback",
        duplicateConflictCount: 0,
        missingAssignmentCount: 0,
        providerFailureCount: batch.length
      }
    };
  }
}

export async function createMvpThemes(
  evidence: readonly MvpEvidence[],
  provider: AiProvider,
  config: Pick<
    MvpAnalysisConfig,
    "classificationMaxRecordsPerBatch"
      | "classificationMaxEstimatedPromptTokensPerBatch"
      | "sourceConcentrationWarningThreshold"
  > = defaultMvpAnalysisConfig
): Promise<MvpThemeResult> {
  const parsedEvidence = mvpEvidenceSchema.array().min(1).parse(evidence);
  const taxonomyResult = await generateMvpTaxonomy(parsedEvidence, provider);
  const batches = createBoundedBatches(
    parsedEvidence,
    {
      maxItems: config.classificationMaxRecordsPerBatch,
      maxEstimatedPromptTokens: config.classificationMaxEstimatedPromptTokensPerBatch
    },
    (item) => JSON.stringify({ evidenceId: item.id, text: item.canonicalText, rating: item.rating })
  );
  const assignedThemeByEvidence = new Map<string, string>();
  const fallbackIds = new Set<string>();
  const diagnostics: MvpClassificationDiagnostic[] = [];

  for (const [batchIndex, batch] of batches.entries()) {
    const result = await classifyBatch(batch, taxonomyResult.themes, provider, batchIndex);
    diagnostics.push(result.diagnostic);
    for (const [evidenceId, themeId] of result.assignments) {
      if (assignedThemeByEvidence.has(evidenceId) || fallbackIds.has(evidenceId)) {
        throw new Error("Evidence batches must be disjoint; a cross-batch assignment was detected.");
      }
      assignedThemeByEvidence.set(evidenceId, themeId);
    }
    for (const evidenceId of result.fallbackIds) {
      if (assignedThemeByEvidence.has(evidenceId) || fallbackIds.has(evidenceId)) {
        throw new Error("Evidence batches must be disjoint; a cross-batch fallback was detected.");
      }
      fallbackIds.add(evidenceId);
    }
  }

  const evidenceById = new Map(parsedEvidence.map((item) => [item.id, item]));
  const membership = new Map(taxonomyResult.themes.map(({ id }) => [id, [] as MvpEvidence[]]));
  for (const [evidenceId, themeId] of assignedThemeByEvidence) {
    membership.get(themeId)!.push(evidenceById.get(evidenceId)!);
  }
  const toTheme = (
    definition: Pick<
      TaxonomyTheme,
      "id" | "title" | "description" | "inclusionCriteria" | "exclusionCriteria" | "dominantIssueCategory"
    >,
    members: readonly MvpEvidence[]
  ): MvpTheme => mvpThemeSchema.parse({
    ...definition,
    evidenceIds: members.map(({ id }) => id),
    evidenceCount: members.length,
    percentage: parsedEvidence.length === 0 ? 0 : members.length / parsedEvidence.length * 100,
    ratingDistribution: ratingDistribution(members),
    sourceCounts: Object.fromEntries(
      [...new Set(members.map(({ sourceName }) => sourceName))]
        .sort()
        .map((sourceName) => [
          sourceName,
          members.filter((item) => item.sourceName === sourceName).length
        ])
    ),
    sourceConcentrationWarning: (() => {
      if (members.length === 0) return null;
      const counts = new Map<string, number>();
      for (const { sourceName } of members) {
        counts.set(sourceName, (counts.get(sourceName) ?? 0) + 1);
      }
      const [sourceName, count] = [...counts.entries()]
        .sort(([firstName, firstCount], [secondName, secondCount]) =>
          secondCount - firstCount || firstName.localeCompare(secondName)
        )[0]!;
      const contribution = count / members.length;
      return contribution > config.sourceConcentrationWarningThreshold
        ? `${sourceName} contributes ${(contribution * 100).toFixed(1)}% of this Theme.`
        : null;
    })(),
    dominantSentiment: dominantSentimentFromRatings(members),
    representativeEvidenceIds: representativeIds(members)
  });
  const themes = taxonomyResult.themes
    .map(({
      id,
      title,
      description,
      inclusionCriteria,
      exclusionCriteria,
      dominantIssueCategory
    }) => toTheme({
      id,
      title,
      description,
      inclusionCriteria,
      exclusionCriteria,
      dominantIssueCategory
    }, membership.get(id)!))
    .sort((first, second) => first.title.localeCompare(second.title));

  if (fallbackIds.size > 0) {
    const members = parsedEvidence.filter(({ id }) => fallbackIds.has(id));
    themes.push(toTheme({
      id: "mvp_theme_uncategorized",
      title: "Uncategorized / Needs Review",
      description: "Evidence retained locally after incomplete or invalid classification.",
      inclusionCriteria: "Evidence not safely assigned to a generated Theme.",
      exclusionCriteria: "Evidence with one accepted assignment to a generated Theme.",
      dominantIssueCategory: null
    }, members));
  }

  const finalIds = themes.flatMap(({ evidenceIds }) => evidenceIds);
  if (
    finalIds.length !== parsedEvidence.length
    || new Set(finalIds).size !== parsedEvidence.length
    || parsedEvidence.some(({ id }) => !finalIds.includes(id))
  ) {
    throw new Error("MVP Themes must retain every local Evidence record exactly once.");
  }

  return {
    themes,
    taxonomyThemeCount: taxonomyResult.themes.length,
    taxonomyProviderRequestCount: taxonomyResult.providerAttempts,
    classificationBatchCount: batches.length,
    classificationProviderRequestCount: diagnostics.reduce(
      (total, diagnostic) => total + diagnostic.providerAttempts,
      0
    ),
    categorizedCount: assignedThemeByEvidence.size,
    uncategorizedCount: fallbackIds.size,
    duplicateConflictFallbackCount: diagnostics.reduce(
      (total, diagnostic) => total + diagnostic.duplicateConflictCount,
      0
    ),
    missingAssignmentFallbackCount: diagnostics.reduce(
      (total, diagnostic) => total + diagnostic.missingAssignmentCount,
      0
    ),
    providerFailureFallbackCount: diagnostics.reduce(
      (total, diagnostic) => total + diagnostic.providerFailureCount,
      0
    ),
    classificationDiagnostics: diagnostics
  };
}

async function generateBusinessNarrative(
  themes: readonly MvpTheme[],
  sentimentDistribution: ReturnType<typeof localSentimentDistribution>,
  evidence: readonly MvpEvidence[],
  provider: AiProvider
): Promise<{ narrative: MvpBusinessNarrative; providerRequestCount: number }> {
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const result = await provider.generateStructured({
    stage: "insight_generation",
    promptVersion: "mvp-business-analysis-v1.1.0",
    schemaName: "mvp_business_analysis",
    systemPrompt: `Produce one concise product-management analysis from final application-owned Themes and metrics.
Summarize observed user pain points, positive patterns, requested improvements, operational, delivery, payment, and application or UX issues, retention risks, and product opportunities.
State analysis limitations. Do not invent prevalence, causality, demographics, IDs, quotes, review text, membership, counts, or source metadata.
Do not reproduce canonical reviews. Return only the requested structured object.`,
    userPrompt: `${JSON.stringify({
      themes: themes.map(({
        id,
        title,
        description,
        evidenceCount,
        percentage,
        ratingDistribution,
        sourceCounts,
        sourceConcentrationWarning,
        dominantSentiment,
        representativeEvidenceIds
      }) => ({
        themeId: id,
        title,
        description,
        evidenceCount,
        percentage,
        ratingDistribution,
        sourceCounts,
        sourceConcentrationWarning,
        dominantSentiment,
        representativeEvidence: representativeEvidenceIds.map((evidenceId) => {
          const item = evidenceById.get(evidenceId)!;
          return {
            text: item.canonicalText,
            rating: item.rating,
            sourceName: item.sourceName
          };
        })
      })),
      sentimentDistribution
    })}\n\nReturn only the requested structured object.`,
    jsonSchema: z.toJSONSchema(mvpBusinessNarrativeSchema, {
      target: "draft-7",
      unrepresentable: "any"
    }) as Record<string, unknown>,
    validate: (value) => mvpBusinessNarrativeSchema.parse(value)
  });
  return { narrative: result.data, providerRequestCount: result.attemptCount };
}

function attachRepresentativeReviews(
  themes: readonly MvpTheme[],
  evidence: readonly MvpEvidence[]
): MvpRepresentativeReview[] {
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  return themes.flatMap((theme) =>
    theme.representativeEvidenceIds.map((evidenceId): MvpRepresentativeReview => {
      const item = evidenceById.get(evidenceId);
      if (!item) throw new Error("Representative MVP Evidence is missing.");
      return {
        themeId: theme.id,
        evidenceId: item.id,
        documentId: item.documentId,
        canonicalText: item.canonicalText,
        sourceType: item.sourceType,
        sourceName: item.sourceName,
        sourceUrl: item.sourceUrl,
        rating: item.rating,
        reviewDate: item.reviewDate
      };
    })
  );
}

function businessInsightCount(narrative: MvpBusinessNarrative): number {
  const findings = [
    ...narrative.topUserPainPoints,
    ...narrative.positivePatterns,
    ...narrative.requestedImprovements,
    ...narrative.operationalIssues,
    ...narrative.deliveryIssues,
    ...narrative.paymentIssues,
    ...narrative.applicationUxIssues,
    ...narrative.retentionRisks,
    ...narrative.productOpportunities
  ];
  return new Set(findings.map((item) => item.toLocaleLowerCase("en"))).size;
}

export async function runMvpAnalysis(
  documents: readonly PublicDocument[],
  corpus: MvpCorpusContext,
  provider: AiProvider,
  config: MvpAnalysisConfig = defaultMvpAnalysisConfig
): Promise<MvpAnalysisArtifact> {
  const startedAt = performance.now();
  const evidence = createLocalMvpEvidence(documents, config);
  const sentimentDistribution = localSentimentDistribution(evidence);
  const themeResult = await createMvpThemes(evidence, provider, config);
  const businessResult = await generateBusinessNarrative(
    themeResult.themes,
    sentimentDistribution,
    evidence,
    provider
  );
  const artifact = {
    corpusStatus: themeResult.uncategorizedCount > 0
      ? "valid_with_uncategorized" as const
      : "valid" as const,
    sourceMode: corpus.sourceMode,
    corpusFingerprint: corpus.corpusFingerprint,
    collectedReviewCount: corpus.collectedReviewCount,
    eligibleCount: corpus.eligibleCount,
    selectedReviewCount: corpus.selectedReviewCount,
    duplicatesRemoved: corpus.duplicatesRemoved,
    evidenceCount: evidence.length,
    categorizedCount: themeResult.categorizedCount,
    uncategorizedCount: themeResult.uncategorizedCount,
    themeCount: themeResult.themes.length,
    insightCount: businessInsightCount(businessResult.narrative),
    providerRequestCount:
      themeResult.taxonomyProviderRequestCount
      + themeResult.classificationProviderRequestCount
      + businessResult.providerRequestCount,
    taxonomyProviderRequestCount: themeResult.taxonomyProviderRequestCount,
    classificationBatchCount: themeResult.classificationBatchCount,
    classificationProviderRequestCount: themeResult.classificationProviderRequestCount,
    businessSynthesisProviderRequestCount: businessResult.providerRequestCount,
    duplicateConflictFallbackCount: themeResult.duplicateConflictFallbackCount,
    missingAssignmentFallbackCount: themeResult.missingAssignmentFallbackCount,
    providerFailureFallbackCount: themeResult.providerFailureFallbackCount,
    classificationDiagnostics: themeResult.classificationDiagnostics,
    sentimentDistribution,
    themes: themeResult.themes,
    representativeReviews: attachRepresentativeReviews(themeResult.themes, evidence),
    businessAnalysis: businessResult.narrative,
    limitations: [
      corpus.sourceMode === "multi_source_snapshot"
        ? "The corpus combines a deterministic bounded Google Play subset with approved manually collected public evidence; it is not population-representative."
        : "The corpus is a deterministic subset of a bounded public Google Play collection, not all historical reviews.",
      "Sentiment distribution and Theme metrics are calculated locally and do not establish behavioral prevalence.",
      ...(themeResult.uncategorizedCount > 0
        ? [`${themeResult.uncategorizedCount} Evidence records require human review in Uncategorized.`]
        : []),
      ...businessResult.narrative.analysisLimitations
    ],
    runtimeMilliseconds: performance.now() - startedAt
  };
  return mvpAnalysisArtifactSchema.parse(artifact);
}
