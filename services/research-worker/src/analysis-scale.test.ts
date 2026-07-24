import { describe, expect, it } from "vitest";
import type {
  AiProviderName,
  ServerEnv
} from "@zepto/shared-config";
import type {
  AnalysisStage,
  PublicDocument
} from "@zepto/research-contracts";
import type {
  AiProvider,
  AiStageRequest,
  AiStageResult
} from "./ai/types.js";
import {
  AnalysisBatchError,
  analysisScaleConfigFromEnv,
  completedDocumentCountForStage,
  createBoundedBatches,
  estimatePromptTokens,
  measureCorpus,
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
    private readonly failAt?: { stage: AnalysisStage; call: number }
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
          id: `insight-${call}-${index}`,
          title: `Insight for ${theme.title} ${theme.evidenceIds[0]}`,
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
