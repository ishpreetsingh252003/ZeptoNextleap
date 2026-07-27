import { createHash } from "node:crypto";
import { z } from "zod";
import {
  documentEvidenceExtractionSchema,
  insightGenerationOutputSchema,
  publicDocumentSchema,
  themeClusteringOutputSchema,
  type Evidence,
  type Insight,
  type PublicDocument,
  type Theme
} from "@zepto/research-contracts";
import type { ServerEnv } from "@zepto/shared-config";
import { extractEvidence } from "./evidence-extractor.js";
import { generateInsights } from "./insight-generation.js";
import { dedupeDocuments } from "./lib/text.js";
import {
  clusterEvidence,
  evidenceIdFor,
  themeBatchFingerprint,
  ThemeCompletenessRepairError,
  type ThemeClusteringMetrics
} from "./theme-clustering.js";
import { AiProviderError } from "./ai/errors.js";
import {
  StructuredValidationError,
  type StructuredAttemptDiagnostic,
  type StructuredFailureCategory
} from "./ai/failure-diagnostics.js";
import type { AiProvider, AiStageRequest, AiStageResult } from "./ai/types.js";

const TOKEN_CHARACTER_RATIO = 4;
const BATCH_OVERHEAD_TOKENS = 256;

export type BatchLimits = {
  maxItems: number;
  maxEstimatedPromptTokens: number;
};

export type AnalysisScaleConfig = {
  evidence: BatchLimits;
  themes: BatchLimits;
  themeMerge: BatchLimits;
  insights: BatchLimits;
  maxAiRequests?: number;
};

export type CorpusMeasurement = {
  documentCount: number;
  totalCharacters: number;
  minimumDocumentLength: number;
  maximumDocumentLength: number;
  averageDocumentLength: number;
  medianDocumentLength: number;
  estimatedPromptTokens: number;
  exactDuplicateCount: number;
  normalizedEmptyCount: number;
};

export type CompletedAnalysisBatch = {
  stage: ScaleAnalysisStage;
  batchIndex: number;
  itemCount: number;
  documentIds: string[];
};

export type AnalysisScaleMetrics = CorpusMeasurement & {
  eligibleDocumentCount: number;
  evidenceBatchCount: number;
  estimatedMaximumEvidenceBatchPromptTokens: number;
  elapsedMillisecondsByStage: Record<ScaleAnalysisStage, number>;
  totalAiRequests: number;
  failedBatchCount: number;
  successfullyAnalyzedDocumentCount: number;
  completedBatches: CompletedAnalysisBatch[];
  themeBatchMetrics: ThemeBatchProcessingMetric[];
};

export type ThemeBatchProcessingMetric = ThemeClusteringMetrics & {
  batchIndex: number;
  estimatedPromptTokens: number;
};

export type ScaledAnalysisResult = {
  evidence: Evidence[];
  themes: Theme[];
  insights: Insight[];
  metrics: AnalysisScaleMetrics;
};

export type InsightAggregationFailureDiagnostics = {
  failureType: "insight_aggregation";
  evidenceCount: number;
  themeCount: number;
  mergedInsightCount: number;
  providerRequestCount: number;
  retryCount: number;
  stageTimings: Record<ScaleAnalysisStage, number>;
};

export type EvidenceBatchFailureDiagnostics = {
  failureType: "evidence_batch";
  batchIndex: number;
  attemptCount: number;
  providerAttempts: readonly StructuredAttemptDiagnostic[];
  documentCount: number;
  estimatedPromptTokens: number;
  documentIds: string[];
  validationCategories: StructuredFailureCategory[];
  stageTimingMilliseconds: number;
  stageTimings: Record<ScaleAnalysisStage, number>;
  failureLocation: StructuredAttemptDiagnostic["failureLocation"];
  retryChangedFailureCategory: boolean;
};

export type ThemeBatchFailureDiagnostics = {
  failureType: "theme_batch";
  batchIndex: number;
  attemptCount: number;
  providerAttempts: readonly StructuredAttemptDiagnostic[];
  evidenceCount: number;
  estimatedPromptTokens: number;
  evidenceIds: string[];
  validationCategories: StructuredFailureCategory[];
  stageTimingMilliseconds: number;
  stageTimings: Record<ScaleAnalysisStage, number>;
  failureLocation: StructuredAttemptDiagnostic["failureLocation"];
  retryChangedFailureCategory: boolean;
  batchFingerprint: string;
  repairMetrics?: ThemeBatchProcessingMetric;
};

export type AnalysisFailureDiagnostics =
  | InsightAggregationFailureDiagnostics
  | EvidenceBatchFailureDiagnostics
  | ThemeBatchFailureDiagnostics;

export type ScaleAnalysisStage =
  | "evidence_extraction"
  | "theme_clustering"
  | "theme_consolidation"
  | "insight_generation"
  | "insight_aggregation";

export const defaultAnalysisScaleConfig: AnalysisScaleConfig = {
  evidence: { maxItems: 50, maxEstimatedPromptTokens: 32_000 },
  themes: { maxItems: 100, maxEstimatedPromptTokens: 32_000 },
  themeMerge: { maxItems: 40, maxEstimatedPromptTokens: 32_000 },
  insights: { maxItems: 100, maxEstimatedPromptTokens: 32_000 }
};

export class AnalysisBatchError extends Error {
  readonly code: string;
  readonly restartBehavior = "full_run_required" as const;

  constructor(
    message: string,
    readonly failedStage: ScaleAnalysisStage,
    readonly failedBatchIndex: number,
    readonly documentIds: string[],
    readonly completedBatches: CompletedAnalysisBatch[],
    readonly totalAiRequests: number,
    cause: unknown,
    readonly diagnostics?: AnalysisFailureDiagnostics,
    readonly themeBatchMetrics: ThemeBatchProcessingMetric[] = []
  ) {
    super(message, { cause });
    this.name = "AnalysisBatchError";
    this.code = errorCode(cause);
  }
}

export function completedDocumentCountForStage(
  batches: readonly CompletedAnalysisBatch[],
  stage: ScaleAnalysisStage
): number {
  return new Set(
    batches
      .filter((batch) => batch.stage === stage)
      .flatMap((batch) => batch.documentIds)
  ).size;
}

type ProvisionalTheme = {
  internalId: string;
  finalId?: string;
  title: string;
  description: string;
  evidenceIds: string[];
  dominantSentiment: Theme["dominantSentiment"];
};

const provisionalThemeMergeSchema = z.object({
  themes: z.array(z.object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(1_200),
    provisionalThemeIds: z.array(z.string().min(1)).min(1),
    dominantSentiment: z.enum(["positive", "negative", "neutral", "mixed"])
  })).min(1)
}).superRefine((output, context) => {
  const titles = new Set<string>();
  for (const [index, theme] of output.themes.entries()) {
    const title = theme.title.toLocaleLowerCase("en");
    if (titles.has(title)) {
      context.addIssue({
        code: "custom",
        path: ["themes", index, "title"],
        message: "Duplicate provisional theme titles are not allowed."
      });
    }
    titles.add(title);
  }
});

export function estimatePromptTokens(value: string): number {
  return Math.ceil(value.length / TOKEN_CHARACTER_RATIO);
}

export function analysisScaleConfigFromEnv(env: ServerEnv): AnalysisScaleConfig {
  return {
    evidence: {
      maxItems: env.ANALYSIS_EVIDENCE_MAX_DOCUMENTS_PER_BATCH,
      maxEstimatedPromptTokens: env.ANALYSIS_EVIDENCE_MAX_ESTIMATED_PROMPT_TOKENS_PER_BATCH
    },
    themes: {
      maxItems: env.ANALYSIS_THEME_MAX_EVIDENCE_PER_BATCH,
      maxEstimatedPromptTokens: env.ANALYSIS_THEME_MAX_ESTIMATED_PROMPT_TOKENS_PER_BATCH
    },
    themeMerge: {
      maxItems: env.ANALYSIS_THEME_MAX_PROVISIONAL_PER_BATCH,
      maxEstimatedPromptTokens: env.ANALYSIS_THEME_MAX_ESTIMATED_PROMPT_TOKENS_PER_BATCH
    },
    insights: {
      maxItems: env.ANALYSIS_INSIGHT_MAX_EVIDENCE_PER_BATCH,
      maxEstimatedPromptTokens: env.ANALYSIS_INSIGHT_MAX_ESTIMATED_PROMPT_TOKENS_PER_BATCH
    }
  };
}

export function measureCorpus(
  documents: readonly { normalizedText: string }[]
): CorpusMeasurement {
  const lengths = documents.map(({ normalizedText }) => normalizedText.length).sort((a, b) => a - b);
  const totalCharacters = lengths.reduce((total, length) => total + length, 0);
  const middle = Math.floor(lengths.length / 2);
  const medianDocumentLength = lengths.length === 0
    ? 0
    : lengths.length % 2 === 0
      ? ((lengths[middle - 1] ?? 0) + (lengths[middle] ?? 0)) / 2
      : (lengths[middle] ?? 0);
  const { duplicateCount } = dedupeDocuments(
    documents.map(({ normalizedText }) => ({ normalizedText }))
  );

  return {
    documentCount: documents.length,
    totalCharacters,
    minimumDocumentLength: lengths[0] ?? 0,
    maximumDocumentLength: lengths[lengths.length - 1] ?? 0,
    averageDocumentLength: lengths.length === 0 ? 0 : totalCharacters / lengths.length,
    medianDocumentLength,
    estimatedPromptTokens: Math.ceil(totalCharacters / TOKEN_CHARACTER_RATIO),
    exactDuplicateCount: duplicateCount,
    normalizedEmptyCount: documents.filter(({ normalizedText }) => normalizedText.trim().length === 0).length
  };
}

export function prepareCorpusForAnalysis(
  documents: readonly PublicDocument[]
): {
  measurement: CorpusMeasurement;
  eligibleDocuments: PublicDocument[];
  duplicateCount: number;
} {
  const measurement = measureCorpus(documents);
  const parsedDocuments = publicDocumentSchema.array().parse(documents);
  const { unique: eligibleDocuments, duplicateCount } = dedupeDocuments(parsedDocuments);
  return { measurement, eligibleDocuments, duplicateCount };
}

export function estimateAnalysisRequestCount(
  documentCount: number,
  evidenceBatchCount: number,
  config: AnalysisScaleConfig
): number {
  if (documentCount === 0) return 0;
  const themeBatches = Math.ceil(documentCount / config.themes.maxItems);
  let provisionalThemes = themeBatches;
  let mergeRequests = 0;
  while (provisionalThemes > config.themeMerge.maxItems) {
    provisionalThemes = Math.ceil(provisionalThemes / config.themeMerge.maxItems);
    mergeRequests += provisionalThemes;
  }
  if (provisionalThemes > 1) mergeRequests += 1;
  const insightBatches = Math.ceil(documentCount / config.insights.maxItems);
  return evidenceBatchCount + themeBatches + mergeRequests + insightBatches;
}

export function createBoundedBatches<T>(
  items: readonly T[],
  limits: BatchLimits,
  serializedItem: (item: T) => string
): T[][] {
  if (!Number.isInteger(limits.maxItems) || limits.maxItems < 1) {
    throw new Error("Batch maxItems must be a positive integer.");
  }
  if (!Number.isInteger(limits.maxEstimatedPromptTokens) || limits.maxEstimatedPromptTokens < 1) {
    throw new Error("Batch maxEstimatedPromptTokens must be a positive integer.");
  }

  const batches: T[][] = [];
  let current: T[] = [];
  let currentTokens = BATCH_OVERHEAD_TOKENS;

  for (const item of items) {
    const itemTokens = estimatePromptTokens(serializedItem(item));
    if (itemTokens + BATCH_OVERHEAD_TOKENS > limits.maxEstimatedPromptTokens) {
      throw new Error(
        `One item requires an estimated ${itemTokens + BATCH_OVERHEAD_TOKENS} prompt tokens, exceeding the configured batch limit of ${limits.maxEstimatedPromptTokens}.`
      );
    }
    if (
      current.length > 0
      && (current.length >= limits.maxItems || currentTokens + itemTokens > limits.maxEstimatedPromptTokens)
    ) {
      batches.push(current);
      current = [];
      currentTokens = BATCH_OVERHEAD_TOKENS;
    }
    current.push(item);
    currentTokens += itemTokens;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

function errorCode(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const code = Reflect.get(error, "code");
    if (typeof code === "string") return code;
  }
  return "ANALYSIS_BATCH_FAILED";
}

function stableId(prefix: string, values: readonly string[]): string {
  const hash = createHash("sha256").update(JSON.stringify([...values].sort())).digest("hex");
  return `${prefix}_${hash}`;
}

export function finalInsightIdFor(
  insight: Pick<Insight, "themeId" | "evidenceIds">
): string {
  const identity = JSON.stringify({
    themeId: insight.themeId,
    evidenceIds: [...insight.evidenceIds].sort()
  });
  return `insight_${createHash("sha256").update(identity).digest("hex")}`;
}

export function finalizeInsightIds(insights: readonly Insight[]): Insight[] {
  return insights.map((insight) => ({
    ...insight,
    id: finalInsightIdFor(insight)
  }));
}

function documentIdsForEvidence(evidence: readonly Evidence[]): string[] {
  return [...new Set(evidence.map(({ documentId }) => documentId))];
}

function documentIdsForThemes(themes: readonly ProvisionalTheme[], evidenceById: Map<string, Evidence>): string[] {
  return [...new Set(themes.flatMap(({ evidenceIds }) =>
    evidenceIds.map((id) => evidenceById.get(id)?.documentId).filter((id): id is string => Boolean(id))
  ))];
}

class MeteredProvider implements AiProvider {
  readonly provider;
  readonly model;
  requestCount = 0;

  constructor(
    private readonly inner: AiProvider,
    private readonly maxRequests?: number
  ) {
    this.provider = inner.provider;
    this.model = inner.model;
  }

  async generateStructured<T>(request: AiStageRequest<T>): Promise<AiStageResult<T>> {
    if (this.maxRequests !== undefined && this.requestCount >= this.maxRequests) {
      throw new Error(`Configured AI request guard of ${this.maxRequests} requests was reached.`);
    }
    try {
      const result = await this.inner.generateStructured(request);
      this.requestCount += result.attemptCount;
      return result;
    } catch (error) {
      const attemptCount = typeof error === "object" && error !== null
        ? Reflect.get(error, "attemptCount")
        : null;
      this.requestCount += typeof attemptCount === "number" && Number.isFinite(attemptCount)
        ? attemptCount
        : 1;
      throw error;
    }
  }
}

function assertCompleteEvidencePartition(themes: readonly Theme[], evidence: readonly Evidence[]): void {
  const expected = new Set(evidence.map(evidenceIdFor));
  const assigned = new Set<string>();
  for (const theme of themes) {
    for (const evidenceId of theme.evidenceIds) {
      if (!expected.has(evidenceId)) throw new Error("Final theme referenced unknown evidence.");
      if (assigned.has(evidenceId)) throw new Error("Final themes assigned evidence more than once.");
      assigned.add(evidenceId);
    }
  }
  if (assigned.size !== expected.size) throw new Error("Final themes did not assign every evidence record.");
}

async function consolidateThemeBatch(
  themes: readonly ProvisionalTheme[],
  provider: AiProvider
): Promise<ProvisionalTheme[]> {
  if (themes.length === 1) return [{ ...themes[0]!, evidenceIds: [...themes[0]!.evidenceIds] }];
  const themesById = new Map(themes.map((theme) => [theme.internalId, theme]));
  if (themesById.size !== themes.length) throw new Error("Duplicate provisional theme IDs are not allowed.");

  const result = await provider.generateStructured({
    stage: "theme_clustering",
    promptVersion: "theme-consolidation-v1.0.0",
    schemaName: "provisional_theme_consolidation",
    systemPrompt: `Consolidate the supplied provisional themes into fewer descriptive themes.
Assign every provisionalThemeId exactly once. Merge the closest related patterns when necessary, while preserving uncertainty and sentiment.
Do not cite new evidence, recommend solutions, prioritize work, or expose provisional IDs as final product output.`,
    userPrompt: `${JSON.stringify({
      provisionalThemes: themes.map(({ internalId, title, description, dominantSentiment }) => ({
        provisionalThemeId: internalId,
        title,
        description,
        dominantSentiment
      }))
    })}\n\nReturn only the requested structured object.`,
    jsonSchema: z.toJSONSchema(provisionalThemeMergeSchema, {
      target: "draft-7",
      unrepresentable: "any"
    }) as Record<string, unknown>,
    validate: (value) => {
      const output = provisionalThemeMergeSchema.parse(value);
      const assigned = new Set<string>();
      for (const theme of output.themes) {
        for (const id of theme.provisionalThemeIds) {
          if (!themesById.has(id)) {
            throw new StructuredValidationError(
              ["UNKNOWN_THEME_REFERENCE"],
              "theme_reference"
            );
          }
          if (assigned.has(id)) throw new Error("A provisional theme cannot be assigned more than once.");
          assigned.add(id);
        }
      }
      if (assigned.size !== themes.length) throw new Error("Every provisional theme must be assigned.");
      if (output.themes.length >= themes.length) {
        throw new Error("Theme consolidation must reduce the number of provisional themes.");
      }
      return output;
    }
  });

  return result.data.themes.map((theme) => {
    const evidenceIds = theme.provisionalThemeIds.flatMap(
      (id) => themesById.get(id)?.evidenceIds ?? []
    );
    return {
      internalId: stableId("provisional_theme", evidenceIds),
      title: theme.title,
      description: theme.description,
      evidenceIds,
      dominantSentiment: theme.dominantSentiment
    };
  });
}

function elapsedSince(startedAt: number): number {
  return performance.now() - startedAt;
}

function estimatedDocumentBatchPromptTokens(
  documents: readonly PublicDocument[]
): number {
  return BATCH_OVERHEAD_TOKENS + documents.reduce(
    (total, document) => total + estimatePromptTokens(JSON.stringify({
      documentId: document.externalId,
      sourceType: document.sourceType,
      text: document.normalizedText
    })),
    0
  );
}

function evidenceFailureDiagnostics(
  error: unknown,
  batchIndex: number,
  batch: readonly PublicDocument[],
  stageTimingMilliseconds: number,
  stageTimings: Record<ScaleAnalysisStage, number>
): EvidenceBatchFailureDiagnostics {
  const providerAttempts = error instanceof AiProviderError
    ? [...error.attemptDiagnostics]
    : [];
  const validationCategories = [
    ...new Set(providerAttempts.flatMap(({ categories }) => categories))
  ];
  const categorySignatures = providerAttempts.map(({ categories }) =>
    JSON.stringify([...categories].sort())
  );
  const lastAttempt = providerAttempts.at(-1);
  return {
    failureType: "evidence_batch",
    batchIndex,
    attemptCount: error instanceof AiProviderError ? error.attemptCount : 1,
    providerAttempts,
    documentCount: batch.length,
    estimatedPromptTokens: estimatedDocumentBatchPromptTokens(batch),
    documentIds: batch.map(({ externalId }) => externalId),
    validationCategories: validationCategories.length > 0
      ? validationCategories
      : ["OTHER"],
    stageTimingMilliseconds,
    stageTimings: { ...stageTimings },
    failureLocation: lastAttempt?.failureLocation ?? "unknown",
    retryChangedFailureCategory: new Set(categorySignatures).size > 1
  };
}

function estimatedThemeBatchPromptTokens(evidence: readonly Evidence[]): number {
  return BATCH_OVERHEAD_TOKENS + evidence.reduce(
    (total, item) => total + estimatePromptTokens(JSON.stringify({
      evidenceId: evidenceIdFor(item),
      ...item
    })),
    0
  );
}

function evidenceIdsForProvisionalThemes(
  themes: readonly ProvisionalTheme[]
): string[] {
  return [...new Set(themes.flatMap(({ evidenceIds }) => evidenceIds))];
}

function referenceBatchFingerprint(ids: readonly string[]): string {
  return createHash("sha256").update([...ids].sort().join("\n")).digest("hex");
}

function estimatedThemeConsolidationPromptTokens(
  themes: readonly ProvisionalTheme[]
): number {
  return BATCH_OVERHEAD_TOKENS + themes.reduce(
    (total, { internalId, title, description, dominantSentiment }) =>
      total + estimatePromptTokens(JSON.stringify({
        provisionalThemeId: internalId,
        title,
        description,
        dominantSentiment
      })),
    0
  );
}

function themeFailureDiagnostics(
  error: unknown,
  batchIndex: number,
  evidenceIds: readonly string[],
  estimatedPromptTokens: number,
  stageTimingMilliseconds: number,
  stageTimings: Record<ScaleAnalysisStage, number>,
  batchFingerprint: string,
  repairMetrics?: ThemeBatchProcessingMetric
): ThemeBatchFailureDiagnostics {
  const providerError = error instanceof ThemeCompletenessRepairError
    ? error.cause
    : error;
  const providerAttempts = providerError instanceof AiProviderError
    ? [...providerError.attemptDiagnostics]
    : [];
  const validationCategories = [
    ...new Set(providerAttempts.flatMap(({ categories }) => categories))
  ];
  const categorySignatures = providerAttempts.map(({ categories }) =>
    JSON.stringify([...categories].sort())
  );
  const lastAttempt = providerAttempts.at(-1);
  return {
    failureType: "theme_batch",
    batchIndex,
    attemptCount: providerError instanceof AiProviderError ? providerError.attemptCount : 1,
    providerAttempts,
    evidenceCount: evidenceIds.length,
    estimatedPromptTokens,
    evidenceIds: [...evidenceIds],
    validationCategories: validationCategories.length > 0
      ? validationCategories
      : ["OTHER"],
    stageTimingMilliseconds,
    stageTimings: { ...stageTimings },
    failureLocation: lastAttempt?.failureLocation ?? "unknown",
    retryChangedFailureCategory: new Set(categorySignatures).size > 1,
    batchFingerprint,
    ...(repairMetrics ? { repairMetrics } : {})
  };
}

/** Experimental reliability pipeline. The primary NextLeap MVP path uses runMvpAnalysis. */
export async function runScaledAnalysisPipeline(
  documents: readonly PublicDocument[],
  provider: AiProvider,
  config: AnalysisScaleConfig
): Promise<ScaledAnalysisResult> {
  const {
    measurement,
    eligibleDocuments,
    duplicateCount
  } = prepareCorpusForAnalysis(documents);
  const meteredProvider = new MeteredProvider(provider, config.maxAiRequests);
  const timings: Record<ScaleAnalysisStage, number> = {
    evidence_extraction: 0,
    theme_clustering: 0,
    theme_consolidation: 0,
    insight_generation: 0,
    insight_aggregation: 0
  };
  const completedBatches: CompletedAnalysisBatch[] = [];
  const themeBatchMetrics: ThemeBatchProcessingMetric[] = [];

  const evidenceBatches = createBoundedBatches(
    eligibleDocuments,
    config.evidence,
    (document) => JSON.stringify({
      documentId: document.externalId,
      sourceType: document.sourceType,
      text: document.normalizedText
    })
  );
  const maximumEvidenceBatchTokens = evidenceBatches.reduce(
    (maximum, batch) => Math.max(
      maximum,
      BATCH_OVERHEAD_TOKENS + batch.reduce((total, document) =>
        total + estimatePromptTokens(JSON.stringify({
          documentId: document.externalId,
          sourceType: document.sourceType,
          text: document.normalizedText
        })), 0)
    ),
    0
  );

  const fail = (
    error: unknown,
    stage: ScaleAnalysisStage,
    batchIndex: number,
    documentIds: string[],
    diagnostics?: AnalysisFailureDiagnostics
  ): never => {
    throw new AnalysisBatchError(
      error instanceof Error ? error.message : "Structured analysis batch failed.",
      stage,
      batchIndex,
      documentIds,
      [...completedBatches],
      meteredProvider.requestCount,
      error,
      diagnostics,
      [...themeBatchMetrics]
    );
  };

  if (eligibleDocuments.length === 0) {
    return {
      evidence: [],
      themes: [],
      insights: [],
      metrics: {
        ...measurement,
        exactDuplicateCount: duplicateCount,
        eligibleDocumentCount: 0,
        evidenceBatchCount: 0,
        estimatedMaximumEvidenceBatchPromptTokens: 0,
        elapsedMillisecondsByStage: timings,
        totalAiRequests: 0,
        failedBatchCount: 0,
        successfullyAnalyzedDocumentCount: 0,
        completedBatches,
        themeBatchMetrics
      }
    };
  }

  const evidence: Evidence[] = [];
  for (const [batchIndex, batch] of evidenceBatches.entries()) {
    const startedAt = performance.now();
    try {
      evidence.push(...await extractEvidence(batch, meteredProvider));
      completedBatches.push({
        stage: "evidence_extraction",
        batchIndex,
        itemCount: batch.length,
        documentIds: batch.map(({ externalId }) => externalId)
      });
    } catch (error) {
      const stageTimingMilliseconds = elapsedSince(startedAt);
      timings.evidence_extraction += stageTimingMilliseconds;
      fail(
        error,
        "evidence_extraction",
        batchIndex,
        batch.map(({ externalId }) => externalId),
        evidenceFailureDiagnostics(
          error,
          batchIndex,
          batch,
          stageTimingMilliseconds,
          timings
        )
      );
    }
    timings.evidence_extraction += elapsedSince(startedAt);
  }
  documentEvidenceExtractionSchema.parse({ evidence });

  const evidenceById = new Map(evidence.map((item) => [evidenceIdFor(item), item]));
  const themeEvidenceBatches = createBoundedBatches(
    evidence,
    config.themes,
    (item) => JSON.stringify({ evidenceId: evidenceIdFor(item), ...item })
  );
  let provisionalThemes: ProvisionalTheme[] = [];
  for (const [batchIndex, batch] of themeEvidenceBatches.entries()) {
    const startedAt = performance.now();
    const batchFingerprint = themeBatchFingerprint(batch);
    const estimatedPromptTokens = estimatedThemeBatchPromptTokens(batch);
    let batchMetrics: ThemeBatchProcessingMetric | undefined;
    try {
      const clustered = await clusterEvidence(batch, meteredProvider, (metrics) => {
        batchMetrics = { ...metrics, batchIndex, estimatedPromptTokens };
      });
      if (batchMetrics) themeBatchMetrics.push(batchMetrics);
      provisionalThemes.push(...clustered.map((theme) => ({
        internalId: stableId("provisional_theme", theme.evidenceIds),
        finalId: theme.id,
        title: theme.title,
        description: theme.description,
        evidenceIds: [...theme.evidenceIds],
        dominantSentiment: theme.dominantSentiment
      })));
      completedBatches.push({
        stage: "theme_clustering",
        batchIndex,
        itemCount: batch.length,
        documentIds: documentIdsForEvidence(batch)
      });
    } catch (error) {
      if (batchMetrics) themeBatchMetrics.push(batchMetrics);
      const stageTimingMilliseconds = elapsedSince(startedAt);
      timings.theme_clustering += stageTimingMilliseconds;
      fail(
        error,
        "theme_clustering",
        batchIndex,
        [],
        themeFailureDiagnostics(
          error,
          batchIndex,
          batch.map(evidenceIdFor),
          estimatedPromptTokens,
          stageTimingMilliseconds,
          timings,
          batchFingerprint,
          batchMetrics
        )
      );
    }
    timings.theme_clustering += elapsedSince(startedAt);
  }

  let mergePass = 0;
  while (provisionalThemes.length > config.themeMerge.maxItems) {
    const mergeBatches = createBoundedBatches(
      provisionalThemes,
      config.themeMerge,
      ({ internalId, title, description, dominantSentiment }) => JSON.stringify({
        provisionalThemeId: internalId,
        title,
        description,
        dominantSentiment
      })
    );
    const nextThemes: ProvisionalTheme[] = [];
    for (const [batchIndex, batch] of mergeBatches.entries()) {
      const startedAt = performance.now();
      try {
        nextThemes.push(...await consolidateThemeBatch(batch, meteredProvider));
        completedBatches.push({
          stage: "theme_consolidation",
          batchIndex: mergePass * 1_000_000 + batchIndex,
          itemCount: batch.length,
          documentIds: documentIdsForThemes(batch, evidenceById)
        });
      } catch (error) {
        const stageTimingMilliseconds = elapsedSince(startedAt);
        timings.theme_consolidation += stageTimingMilliseconds;
        fail(
          error,
          "theme_consolidation",
          mergePass * 1_000_000 + batchIndex,
          [],
          themeFailureDiagnostics(
            error,
            mergePass * 1_000_000 + batchIndex,
            evidenceIdsForProvisionalThemes(batch),
            estimatedThemeConsolidationPromptTokens(batch),
            stageTimingMilliseconds,
            timings,
            referenceBatchFingerprint(evidenceIdsForProvisionalThemes(batch))
          )
        );
      }
      timings.theme_consolidation += elapsedSince(startedAt);
    }
    if (nextThemes.length >= provisionalThemes.length) {
      fail(
        new Error("Hierarchical theme consolidation made no progress."),
        "theme_consolidation",
        mergePass,
        documentIdsForThemes(provisionalThemes, evidenceById)
      );
    }
    provisionalThemes = nextThemes;
    mergePass += 1;
  }
  if (provisionalThemes.length > 1) {
    const startedAt = performance.now();
    const finalBatch = provisionalThemes;
    try {
      provisionalThemes = await consolidateThemeBatch(finalBatch, meteredProvider);
      completedBatches.push({
        stage: "theme_consolidation",
        batchIndex: mergePass * 1_000_000,
        itemCount: finalBatch.length,
        documentIds: documentIdsForThemes(finalBatch, evidenceById)
      });
    } catch (error) {
      const stageTimingMilliseconds = elapsedSince(startedAt);
      timings.theme_consolidation += stageTimingMilliseconds;
      fail(
        error,
        "theme_consolidation",
        mergePass * 1_000_000,
        [],
        themeFailureDiagnostics(
          error,
          mergePass * 1_000_000,
          evidenceIdsForProvisionalThemes(finalBatch),
          estimatedThemeConsolidationPromptTokens(finalBatch),
          stageTimingMilliseconds,
          timings,
          referenceBatchFingerprint(evidenceIdsForProvisionalThemes(finalBatch))
        )
      );
    }
    timings.theme_consolidation += elapsedSince(startedAt);
  }

  const themes = themeClusteringOutputSchema.parse({
    themes: provisionalThemes.map((theme) => ({
      id: theme.finalId ?? stableId("theme", theme.evidenceIds),
      title: theme.title,
      description: theme.description,
      evidenceIds: theme.evidenceIds,
      dominantSentiment: theme.dominantSentiment,
      evidenceCount: theme.evidenceIds.length
    }))
  }).themes;
  assertCompleteEvidencePartition(themes, evidence);

  const evidenceForTheme = new Map<string, Evidence[]>();
  for (const theme of themes) {
    evidenceForTheme.set(
      theme.id,
      theme.evidenceIds.map((id) => {
        const item = evidenceById.get(id);
        if (!item) throw new Error("Final theme referenced missing evidence.");
        return item;
      })
    );
  }
  const insights: Insight[] = [];
  let insightBatchIndex = 0;
  for (const theme of themes) {
    const themeEvidence = evidenceForTheme.get(theme.id) ?? [];
    const evidenceBatches = createBoundedBatches(
      themeEvidence,
      config.insights,
      (item) => JSON.stringify({ evidenceId: evidenceIdFor(item), ...item })
    );
    for (const batchEvidence of evidenceBatches) {
      const batchEvidenceIds = batchEvidence.map(evidenceIdFor);
      const boundedTheme: Theme = {
        ...theme,
        evidenceIds: batchEvidenceIds,
        evidenceCount: batchEvidenceIds.length
      };
      const startedAt = performance.now();
      try {
        const generated = await generateInsights(
          [boundedTheme],
          batchEvidence,
          meteredProvider
        );
        insights.push(...generated);
        completedBatches.push({
          stage: "insight_generation",
          batchIndex: insightBatchIndex,
          itemCount: batchEvidence.length,
          documentIds: documentIdsForEvidence(batchEvidence)
        });
      } catch (error) {
        timings.insight_generation += elapsedSince(startedAt);
        fail(
          error,
          "insight_generation",
          insightBatchIndex,
          documentIdsForEvidence(batchEvidence)
        );
      }
      timings.insight_generation += elapsedSince(startedAt);
      insightBatchIndex += 1;
    }
  }
  const aggregationStartedAt = performance.now();
  let validatedInsights: Insight[] = [];
  try {
    validatedInsights = insightGenerationOutputSchema.parse({
      insights: finalizeInsightIds(insights)
    }).insights;
    timings.insight_aggregation += elapsedSince(aggregationStartedAt);
  } catch (error) {
    timings.insight_aggregation += elapsedSince(aggregationStartedAt);
    const providerRequestCount = meteredProvider.requestCount;
    fail(
      error,
      "insight_aggregation",
      0,
      eligibleDocuments.map(({ externalId }) => externalId),
      {
        failureType: "insight_aggregation",
        evidenceCount: evidence.length,
        themeCount: themes.length,
        mergedInsightCount: insights.length,
        providerRequestCount,
        retryCount: Math.max(0, providerRequestCount - completedBatches.length),
        stageTimings: { ...timings }
      }
    );
  }

  return {
    evidence,
    themes,
    insights: validatedInsights,
    metrics: {
      ...measurement,
      exactDuplicateCount: duplicateCount,
      eligibleDocumentCount: eligibleDocuments.length,
      evidenceBatchCount: evidenceBatches.length,
      estimatedMaximumEvidenceBatchPromptTokens: maximumEvidenceBatchTokens,
      elapsedMillisecondsByStage: timings,
      totalAiRequests: meteredProvider.requestCount,
          failedBatchCount: 0,
          successfullyAnalyzedDocumentCount: eligibleDocuments.length,
          completedBatches,
          themeBatchMetrics
    }
  };
}
