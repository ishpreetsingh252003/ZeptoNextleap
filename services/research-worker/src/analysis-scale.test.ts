import { describe, expect, it } from "vitest";
import type {
  AiProviderName,
  ServerEnv
} from "@zepto/shared-config";
import type {
  AnalysisStage,
  Insight,
  PublicDocument
} from "@zepto/research-contracts";
import type {
  AiProvider,
  AiStageRequest,
  AiStageResult
} from "./ai/types.js";
import { executeStructuredRequest } from "./ai/execute.js";
import {
  AnalysisBatchError,
  analysisScaleConfigFromEnv,
  completedDocumentCountForStage,
  createBoundedBatches,
  estimateAnalysisRequestCount,
  estimatePromptTokens,
  finalInsightIdFor,
  finalizeInsightIds,
  measureCorpus,
  prepareCorpusForAnalysis,
  runScaledAnalysisPipeline,
  type AnalysisScaleConfig
} from "./analysis-scale.js";

type PromptRecord = {
  stage: AnalysisStage;
  input: Record<string, unknown>;
};

class SyntheticProvider implements AiProvider {
  readonly provider: AiProviderName = "gemini";
  readonly model = "offline-synthetic";
  readonly prompts: PromptRecord[] = [];
  private callsByStage = new Map<AnalysisStage, number>();

  constructor(
    private readonly failAt?: { stage: AnalysisStage; call: number },
    private readonly duplicateInsightTitles = false,
    private readonly fixedLocalInsightIds = false
  ) {}

  async generateStructured<T>(request: AiStageRequest<T>): Promise<AiStageResult<T>> {
    const call = (this.callsByStage.get(request.stage) ?? 0) + 1;
    this.callsByStage.set(request.stage, call);
    if (this.failAt?.stage === request.stage && this.failAt.call === call) {
      throw Object.assign(new Error(`Synthetic ${request.stage} failure.`), {
        code: "AI_STAGE_FAILED",
        attemptCount: 1
      });
    }

    const input = JSON.parse(request.userPrompt.split("\n\n")[0] ?? "{}") as Record<string, unknown>;
    this.prompts.push({ stage: request.stage, input });
    let payload: unknown;

    if (request.stage === "evidence_extraction") {
      const documents = input.documents as Array<{
        documentId: string;
        sourceType: PublicDocument["sourceType"];
        text: string;
      }>;
      payload = {
        evidence: documents.map((document) => ({
          documentId: document.documentId,
          sourceType: document.sourceType,
          supportingQuote: document.text,
          sentiment: "neutral",
          category: "Test category",
          confidence: 1
        }))
      };
    } else if (request.stage === "theme_clustering" && Array.isArray(input.evidence)) {
      const evidence = input.evidence as Array<{ evidenceId: string }>;
      payload = {
        themes: [{
          id: `theme-${call}`,
          title: `Theme ${call}`,
          description: "Synthetic evidence grouping.",
          evidenceIds: evidence.map(({ evidenceId }) => evidenceId),
          dominantSentiment: "neutral",
          evidenceCount: evidence.length
        }]
      };
    } else if (request.stage === "theme_clustering") {
      const themes = input.provisionalThemes as Array<{ provisionalThemeId: string }>;
      payload = {
        themes: [{
          title: `Consolidated theme ${call}`,
          description: "Synthetic consolidated grouping.",
          provisionalThemeIds: themes.map(({ provisionalThemeId }) => provisionalThemeId),
          dominantSentiment: "neutral"
        }]
      };
    } else {
      const themes = input.themes as Array<{ id: string; title: string; evidenceIds: string[] }>;
      payload = {
        insights: themes.map((theme, index) => ({
          id: this.fixedLocalInsightIds ? "local-insight" : `insight-${call}-${index}`,
          title: this.duplicateInsightTitles
            ? "Duplicate generated title"
            : `Insight for ${theme.title} ${theme.evidenceIds[0]}`,
          summary: "Synthetic evidence-supported insight.",
          themeId: theme.id,
          evidenceIds: theme.evidenceIds,
          sentiment: "neutral",
          confidence: 1
        }))
      };
    }

    return {
      data: request.validate(payload),
      provider: this.provider,
      model: this.model,
      attemptCount: 1
    };
  }
}

class RetryingEvidenceFailureProvider implements AiProvider {
  readonly provider = "gemini" as const;
  readonly model = "offline-diagnostics";
  private callCount = 0;

  generateStructured<T>(request: AiStageRequest<T>): Promise<AiStageResult<T>> {
    const responses = [
      "{\"evidence\":[",
      JSON.stringify({
        evidence: [{
          documentId: "doc-0",
          sourceType: "google_play",
          supportingQuote: "PRIVATE_MODEL_QUOTE",
          sentiment: "unsupported-enum",
          category: "Test"
        }]
      })
    ];
    return executeStructuredRequest({
      provider: this.provider,
      model: this.model,
      request,
      invoke: async () => responses[this.callCount++] ?? ""
    });
  }
}

class RetryingThemeFailureProvider implements AiProvider {
  readonly provider = "gemini" as const;
  readonly model = "offline-theme-diagnostics";
  private readonly base = new SyntheticProvider();
  private themeAttempt = 0;

  generateStructured<T>(request: AiStageRequest<T>): Promise<AiStageResult<T>> {
    if (request.stage !== "theme_clustering") {
      return this.base.generateStructured(request);
    }
    const responses = [
      JSON.stringify({
        themes: [{
          id: "theme-local",
          title: "Private title",
          description: "PRIVATE_GENERATED_THEME_DESCRIPTION",
          evidenceIds: ["unknown-evidence"],
          dominantSentiment: "neutral",
          evidenceCount: 1
        }]
      }),
      JSON.stringify({ themes: [] })
    ];
    return executeStructuredRequest({
      provider: this.provider,
      model: this.model,
      request,
      invoke: async () => responses[this.themeAttempt++] ?? ""
    });
  }
}

const config: AnalysisScaleConfig = {
  evidence: { maxItems: 50, maxEstimatedPromptTokens: 8_000 },
  themes: { maxItems: 100, maxEstimatedPromptTokens: 8_000 },
  themeMerge: { maxItems: 10, maxEstimatedPromptTokens: 8_000 },
  insights: { maxItems: 5, maxEstimatedPromptTokens: 8_000 }
};

function documents(count: number, textLength = 80): PublicDocument[] {
  return Array.from({ length: count }, (_, index) => {
    const prefix = `Review ${index}: `;
    const normalizedText = `${prefix}${"x".repeat(Math.max(1, textLength - prefix.length))}`;
    return {
      externalId: `doc-${index}`,
      url: `https://example.com/${index}`,
      canonicalUrl: `https://example.com/${index}`,
      sourceType: "manual_text",
      platform: "Synthetic test",
      title: null,
      publicationDate: null,
      capturedAt: "2026-07-24T00:00:00.000Z",
      normalizedText,
      accessMethod: "manual_import",
      policyNote: "Generated offline scale fixture."
    };
  });
}

describe("analysis scale", () => {
  it.each([0, 1, 100, 1_000, 5_000])(
    "processes %i documents without loss or duplication",
    async (count) => {
      const provider = new SyntheticProvider();
      const result = await runScaledAnalysisPipeline(documents(count), provider, config);

      expect(result.evidence).toHaveLength(count);
      expect(new Set(result.evidence.map(({ documentId }) => documentId)).size).toBe(count);
      expect(result.metrics.successfullyAnalyzedDocumentCount).toBe(count);
      expect(result.metrics.failedBatchCount).toBe(0);
      const assigned = result.themes.flatMap(({ evidenceIds }) => evidenceIds);
      expect(new Set(assigned).size).toBe(count);
      expect(assigned).toHaveLength(count);
    },
    30_000
  );

  it("assigns each document to one deterministic, bounded evidence batch", async () => {
    const input = documents(137, 300);
    const provider = new SyntheticProvider();

    await runScaledAnalysisPipeline(input, provider, config);
    const extractionInputs = provider.prompts
      .filter(({ stage }) => stage === "evidence_extraction")
      .map(({ input: promptInput }) => promptInput.documents as Array<{ documentId: string; text: string }>);
    const assignedIds = extractionInputs.flatMap((batch) => batch.map(({ documentId }) => documentId));

    expect(assignedIds).toEqual(input.map(({ externalId }) => externalId));
    expect(new Set(assignedIds).size).toBe(input.length);
    for (const batch of extractionInputs) {
      const estimatedPromptTokens = 256 + batch.reduce(
        (total, document) => total + estimatePromptTokens(JSON.stringify({
          documentId: document.documentId,
          sourceType: "manual_text",
          text: document.text
        })),
        0
      );
      expect(batch.length).toBeLessThanOrEqual(config.evidence.maxItems);
      expect(estimatedPromptTokens).toBeLessThanOrEqual(
        config.evidence.maxEstimatedPromptTokens
      );
    }
  });

  it("rejects a single item that exceeds a hard batch limit", () => {
    expect(() => createBoundedBatches(
      [{ value: "x".repeat(4_000) }],
      { maxItems: 10, maxEstimatedPromptTokens: 500 },
      ({ value }) => value
    )).toThrow("exceeding the configured batch limit");
  });

  it("reports corpus distribution, normalized empties, and exact-normalized duplicates", () => {
    expect(measureCorpus([
      { normalizedText: "" },
      { normalizedText: "Alpha" },
      { normalizedText: " alpha " },
      { normalizedText: "Longer text" }
    ])).toMatchObject({
      documentCount: 4,
      totalCharacters: 23,
      minimumDocumentLength: 0,
      maximumDocumentLength: 11,
      averageDocumentLength: 5.75,
      medianDocumentLength: 6,
      exactDuplicateCount: 1,
      normalizedEmptyCount: 1
    });
  });

  it("preserves a complete evidence partition through hierarchical clustering", async () => {
    const result = await runScaledAnalysisPipeline(
      documents(1_000),
      new SyntheticProvider(),
      {
        ...config,
        evidence: { maxItems: 25, maxEstimatedPromptTokens: 8_000 },
        themes: { maxItems: 20, maxEstimatedPromptTokens: 8_000 },
        themeMerge: { maxItems: 4, maxEstimatedPromptTokens: 8_000 }
      }
    );
    const evidenceIds = new Set(result.themes.flatMap(({ evidenceIds }) => evidenceIds));

    expect(evidenceIds.size).toBe(result.evidence.length);
    expect(result.metrics.completedBatches.some(
      ({ stage }) => stage === "theme_consolidation"
    )).toBe(true);
  });

  it("keeps every final insight within its final theme and evidence partition", async () => {
    const result = await runScaledAnalysisPipeline(documents(250), new SyntheticProvider(), config);
    const themes = new Map(result.themes.map((theme) => [theme.id, theme]));

    for (const insight of result.insights) {
      const theme = themes.get(insight.themeId);
      expect(theme).toBeDefined();
      expect(insight.evidenceIds.every((id) => theme?.evidenceIds.includes(id))).toBe(true);
    }
  });

  it("replaces duplicate window-local IDs with globally unique final IDs", async () => {
    const result = await runScaledAnalysisPipeline(
      documents(10),
      new SyntheticProvider(undefined, false, true),
      config
    );

    expect(result.insights).toHaveLength(2);
    expect(new Set(result.insights.map(({ id }) => id)).size).toBe(2);
    expect(result.insights.every(({ id }) => id.startsWith("insight_"))).toBe(true);
  });

  it("derives final Insight IDs independently of wording, order, and batching", () => {
    const first: Insight = {
      id: "window-a",
      title: "First wording",
      summary: "First summary.",
      themeId: "final-theme",
      evidenceIds: ["evidence-b", "evidence-a"],
      sentiment: "negative",
      confidence: 0.8
    };
    const second: Insight = {
      ...first,
      id: "window-z",
      title: "Completely different wording",
      summary: "A different generated summary.",
      evidenceIds: ["evidence-a", "evidence-b"]
    };

    expect(finalInsightIdFor(first)).toBe(finalInsightIdFor(second));
    expect(finalizeInsightIds([first, second]).map(({ id }) => id)).toEqual([
      finalInsightIdFor(first),
      finalInsightIdFor(first)
    ]);
  });

  it("stops after evidence batch N fails and reports restart visibility", async () => {
    const provider = new SyntheticProvider({ stage: "evidence_extraction", call: 2 });
    const error = await runScaledAnalysisPipeline(
      documents(120),
      provider,
      config
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AnalysisBatchError);
    expect(error).toMatchObject({
      failedStage: "evidence_extraction",
      failedBatchIndex: 1,
      restartBehavior: "full_run_required"
    });
    expect((error as AnalysisBatchError).completedBatches).toHaveLength(1);
    expect(completedDocumentCountForStage(
      (error as AnalysisBatchError).completedBatches,
      "evidence_extraction"
    )).toBe(50);
    expect(completedDocumentCountForStage(
      (error as AnalysisBatchError).completedBatches,
      "insight_generation"
    )).toBe(0);
    expect(provider.prompts.every(({ stage }) => stage === "evidence_extraction")).toBe(true);
  });

  it("retains sanitized Evidence diagnostics across changed retry failures", async () => {
    const input = documents(1);
    input[0] = {
      ...input[0]!,
      normalizedText: "PRIVATE_REVIEW_TEXT_NEVER_RETAIN"
    };
    const error = await runScaledAnalysisPipeline(
      input,
      new RetryingEvidenceFailureProvider(),
      config
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AnalysisBatchError);
    expect(error).toMatchObject({
      failedStage: "evidence_extraction",
      failedBatchIndex: 0,
      totalAiRequests: 2,
      diagnostics: {
        failureType: "evidence_batch",
        batchIndex: 0,
        attemptCount: 2,
        documentCount: 1,
        documentIds: ["doc-0"],
        validationCategories: expect.arrayContaining([
          "INVALID_JSON",
          "SCHEMA_VALIDATION_FAILED",
          "MISSING_REQUIRED_FIELD",
          "INVALID_ENUM"
        ]),
        failureLocation: "schema_validation",
        retryChangedFailureCategory: true
      }
    });
    const diagnostics = (error as AnalysisBatchError).diagnostics;
    expect(diagnostics).toMatchObject({
      providerAttempts: [
        {
          attempt: 1,
          categories: ["INVALID_JSON"],
          jsonFailure: "unexpected_termination"
        },
        {
          attempt: 2,
          categories: expect.arrayContaining([
            "SCHEMA_VALIDATION_FAILED",
            "MISSING_REQUIRED_FIELD",
            "INVALID_ENUM"
          ]),
          validationIssues: expect.arrayContaining([
            {
              fieldPath: "evidence.0.confidence",
              validationRule: "invalid_type",
              expectedType: "number",
              actualType: "missing"
            },
            {
              fieldPath: "evidence.0.sentiment",
              validationRule: "invalid_value",
              expectedType: "enum",
              actualType: "string"
            }
          ])
        }
      ]
    });
    expect(JSON.stringify(diagnostics)).not.toContain("PRIVATE_REVIEW_TEXT_NEVER_RETAIN");
    expect(JSON.stringify(diagnostics)).not.toContain("PRIVATE_MODEL_QUOTE");
    expect(JSON.stringify(diagnostics)).not.toContain("PRIVATE_TRUNCATED");
  });

  it("retains only sanitized Theme diagnostics across changed retry failures", async () => {
    const input = documents(2);
    input[0] = { ...input[0]!, normalizedText: "PRIVATE_EVIDENCE_TEXT_ONE" };
    input[1] = { ...input[1]!, normalizedText: "PRIVATE_EVIDENCE_TEXT_TWO" };
    const error = await runScaledAnalysisPipeline(
      input,
      new RetryingThemeFailureProvider(),
      config
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AnalysisBatchError);
    expect(error).toMatchObject({
      failedStage: "theme_clustering",
      failedBatchIndex: 0,
      documentIds: [],
      diagnostics: {
        failureType: "theme_batch",
        batchIndex: 0,
        attemptCount: 2,
        evidenceCount: 2,
        validationCategories: expect.arrayContaining([
          "UNKNOWN_EVIDENCE_ID",
          "EMPTY_THEME"
        ]),
        failureLocation: "evidence_assignment",
        retryChangedFailureCategory: true,
        providerAttempts: [
          {
            attempt: 1,
            categories: ["UNKNOWN_EVIDENCE_ID"],
            validationIssues: []
          },
          {
            attempt: 2,
            categories: ["EMPTY_THEME"],
            validationIssues: []
          }
        ]
      }
    });
    const diagnostics = (error as AnalysisBatchError).diagnostics;
    expect(diagnostics).toMatchObject({
      evidenceIds: [
        expect.stringMatching(/^evidence_[a-f0-9]{64}$/),
        expect.stringMatching(/^evidence_[a-f0-9]{64}$/)
      ]
    });
    const serialized = JSON.stringify(diagnostics);
    expect(serialized).not.toContain("PRIVATE_EVIDENCE_TEXT");
    expect(serialized).not.toContain("PRIVATE_GENERATED_THEME_DESCRIPTION");
    expect(serialized).not.toContain("Private title");
  });

  it("retains diagnostic progress without treating a partial insight run as valid", async () => {
    const provider = new SyntheticProvider({ stage: "insight_generation", call: 2 });
    const error = await runScaledAnalysisPipeline(
      documents(120),
      provider,
      config
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AnalysisBatchError);
    expect(error).toMatchObject({
      failedStage: "insight_generation",
      failedBatchIndex: 1,
      restartBehavior: "full_run_required"
    });
    const completed = (error as AnalysisBatchError).completedBatches;
    expect(completedDocumentCountForStage(completed, "insight_generation")).toBe(5);
    expect(120 - completedDocumentCountForStage(completed, "insight_generation")).toBe(115);
  });

  it("retains full diagnostics when final Insight aggregation fails", async () => {
    const error = await runScaledAnalysisPipeline(
      documents(10),
      new SyntheticProvider(undefined, true, true),
      config
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AnalysisBatchError);
    expect(error).toMatchObject({
      failedStage: "insight_aggregation",
      failedBatchIndex: 0,
      diagnostics: {
        evidenceCount: 10,
        themeCount: 1,
        mergedInsightCount: 2,
        providerRequestCount: 4,
        retryCount: 0
      }
    });
    expect((error as AnalysisBatchError).diagnostics?.stageTimings)
      .toHaveProperty("insight_aggregation");
  });

  it("plans dry-run batches from eligible post-deduplication documents", () => {
    const input = documents(2);
    input.push({
      ...input[0]!,
      externalId: "duplicate-doc",
      url: "https://example.com/duplicate",
      canonicalUrl: "https://example.com/duplicate"
    });
    const prepared = prepareCorpusForAnalysis(input);
    const evidenceBatches = createBoundedBatches(
      prepared.eligibleDocuments,
      { maxItems: 1, maxEstimatedPromptTokens: 8_000 },
      (document) => document.normalizedText
    );
    const planningConfig: AnalysisScaleConfig = {
      ...config,
      evidence: { maxItems: 1, maxEstimatedPromptTokens: 8_000 }
    };

    expect(prepared.duplicateCount).toBe(1);
    expect(prepared.eligibleDocuments).toHaveLength(2);
    expect(evidenceBatches).toHaveLength(2);
    expect(estimateAnalysisRequestCount(
      prepared.eligibleDocuments.length,
      evidenceBatches.length,
      planningConfig
    )).toBe(4);
  });

  it("does not mutate its input array or documents", async () => {
    const input = documents(100);
    const before = structuredClone(input);

    await runScaledAnalysisPipeline(input, new SyntheticProvider(), config);

    expect(input).toEqual(before);
  });

  it("maps environment-backed limits without hidden overrides", () => {
    const env = {
      ANALYSIS_EVIDENCE_MAX_DOCUMENTS_PER_BATCH: 11,
      ANALYSIS_EVIDENCE_MAX_ESTIMATED_PROMPT_TOKENS_PER_BATCH: 12_000,
      ANALYSIS_THEME_MAX_EVIDENCE_PER_BATCH: 13,
      ANALYSIS_THEME_MAX_ESTIMATED_PROMPT_TOKENS_PER_BATCH: 14_000,
      ANALYSIS_THEME_MAX_PROVISIONAL_PER_BATCH: 15,
      ANALYSIS_INSIGHT_MAX_EVIDENCE_PER_BATCH: 16,
      ANALYSIS_INSIGHT_MAX_ESTIMATED_PROMPT_TOKENS_PER_BATCH: 17_000
    } as ServerEnv;

    expect(analysisScaleConfigFromEnv(env)).toEqual({
      evidence: { maxItems: 11, maxEstimatedPromptTokens: 12_000 },
      themes: { maxItems: 13, maxEstimatedPromptTokens: 14_000 },
      themeMerge: { maxItems: 15, maxEstimatedPromptTokens: 14_000 },
      insights: { maxItems: 16, maxEstimatedPromptTokens: 17_000 }
    });
  });
});
