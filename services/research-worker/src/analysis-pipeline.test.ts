import { describe, expect, it } from "vitest";
import type {
  AnalysisStage,
  Evidence,
  PublicDocument,
  Theme
} from "@zepto/research-contracts";
import { executeStructuredRequest } from "./ai/execute.js";
import type { AiProvider, AiStageRequest, AiStageResult } from "./ai/types.js";
import { runAnalysisPipeline } from "./analysis-pipeline.js";
import { finalInsightIdFor } from "./analysis-scale.js";
import { evidenceIdFor } from "./theme-clustering.js";

type StageResponses = Partial<Record<AnalysisStage, string[]>>;

class ScriptedProvider implements AiProvider {
  readonly provider = "gemini" as const;
  readonly model = "test-model";
  readonly stages: AnalysisStage[] = [];

  constructor(private readonly responses: StageResponses) {}

  generateStructured<T>(request: AiStageRequest<T>): Promise<AiStageResult<T>> {
    this.stages.push(request.stage);
    const stageResponses = this.responses[request.stage] ?? [""];
    let responseIndex = 0;
    return executeStructuredRequest({
      provider: this.provider,
      model: this.model,
      request,
      invoke: async () => {
        const response = stageResponses[Math.min(responseIndex, stageResponses.length - 1)];
        responseIndex += 1;
        return response ?? "";
      }
    });
  }
}

function document(): PublicDocument {
  return {
    externalId: "doc-1",
    sourceType: "manual_text",
    sourceName: "Manual import",
    url: "https://example.com/doc-1",
    canonicalUrl: "https://example.com/doc-1",
    platform: "Test source",
    title: null,
    publicationDate: null,
    capturedAt: "2026-07-24T00:00:00.000Z",
    normalizedText: "I needed more product information before buying baby care products.",
    accessMethod: "manual_import",
    policyNote: "Offline analysis-pipeline fixture."
  };
}

const evidence: Evidence = {
  documentId: "doc-1",
  sourceType: "manual_text",
  supportingQuote: "I needed more product information before buying baby care products",
  sentiment: "negative",
  category: "Baby care",
  confidence: 0.95
};
const evidenceId = evidenceIdFor(evidence);
const theme: Theme = {
  id: "theme-1",
  title: "Information needs",
  description: "Purchase consideration depends on sufficient product information.",
  evidenceIds: [evidenceId],
  dominantSentiment: "negative",
  evidenceCount: 1
};
const providerTheme = {
  ...theme,
  evidenceIds: ["E1"]
};
const insight = {
  id: "insight-1",
  title: "Missing detail delays category trial",
  summary: "The supplied evidence describes information needs before trying baby care products.",
  themeId: theme.id,
  evidenceIds: [evidenceId],
  sentiment: "negative",
  confidence: 0.9
};

function validResponses(): StageResponses {
  return {
    evidence_extraction: [JSON.stringify({ evidence: [evidence] })],
    theme_clustering: [JSON.stringify({ themes: [providerTheme] })],
    insight_generation: [JSON.stringify({ insights: [insight] })]
  };
}

describe("analysis pipeline integration", () => {
  it("executes all three stages and returns their validated outputs", async () => {
    const result = await runAnalysisPipeline([document()], new ScriptedProvider(validResponses()));

    expect(result).toEqual({
      evidence: [evidence],
      themes: [theme],
      insights: [{ ...insight, id: finalInsightIdFor(insight) }]
    });
  });

  it("executes stages in strict order", async () => {
    const provider = new ScriptedProvider(validResponses());

    await runAnalysisPipeline([document()], provider);

    expect(provider.stages).toEqual([
      "evidence_extraction",
      "theme_clustering",
      "insight_generation"
    ]);
  });

  it("returns an empty result without invoking AI for empty documents", async () => {
    const provider = new ScriptedProvider(validResponses());

    await expect(runAnalysisPipeline([], provider)).resolves.toEqual({
      evidence: [],
      themes: [],
      insights: []
    });
    expect(provider.stages).toEqual([]);
  });

  it("stops after evidence extraction fails", async () => {
    const provider = new ScriptedProvider({
      ...validResponses(),
      evidence_extraction: ["not JSON"]
    });

    await expect(runAnalysisPipeline([document()], provider)).rejects.toMatchObject({
      code: "AI_STAGE_FAILED",
      message: expect.stringContaining("evidence_extraction")
    });
    expect(provider.stages).toEqual(["evidence_extraction"]);
  });

  it("stops before insight generation when theme clustering fails", async () => {
    const provider = new ScriptedProvider({
      ...validResponses(),
      theme_clustering: ["not JSON"]
    });

    await expect(runAnalysisPipeline([document()], provider)).rejects.toMatchObject({
      code: "AI_STAGE_FAILED",
      message: expect.stringContaining("theme_clustering")
    });
    expect(provider.stages).toEqual(["evidence_extraction", "theme_clustering"]);
  });

  it("reports an insight-generation failure with its stage", async () => {
    const provider = new ScriptedProvider({
      ...validResponses(),
      insight_generation: ["not JSON"]
    });

    await expect(runAnalysisPipeline([document()], provider)).rejects.toMatchObject({
      code: "AI_STAGE_FAILED",
      message: expect.stringContaining("insight_generation")
    });
    expect(provider.stages).toEqual([
      "evidence_extraction",
      "theme_clustering",
      "insight_generation"
    ]);
  });

  it("preserves complete output traceability", async () => {
    const documents = [document()];
    const result = await runAnalysisPipeline(documents, new ScriptedProvider(validResponses()));
    const generatedEvidenceIds = new Set(result.evidence.map(evidenceIdFor));

    for (const generatedEvidence of result.evidence) {
      const sourceDocument = documents.find((candidate) =>
        candidate.externalId === generatedEvidence.documentId
        && candidate.sourceType === generatedEvidence.sourceType
      );
      expect(sourceDocument?.normalizedText.includes(generatedEvidence.supportingQuote)).toBe(true);
    }
    for (const generatedTheme of result.themes) {
      expect(generatedTheme.evidenceIds.every((id) => generatedEvidenceIds.has(id))).toBe(true);
    }
    for (const generatedInsight of result.insights) {
      const referencedTheme = result.themes.find(({ id }) => id === generatedInsight.themeId);
      expect(referencedTheme).toBeDefined();
      expect(generatedInsight.evidenceIds.every((id) => referencedTheme?.evidenceIds.includes(id))).toBe(true);
    }
  });

  it("does not mutate input documents", async () => {
    const inputDocument = document();
    const before = structuredClone(inputDocument);

    await runAnalysisPipeline([inputDocument], new ScriptedProvider(validResponses()));

    expect(inputDocument).toEqual(before);
  });

  it("is deterministic with the same mocked stage outputs", async () => {
    const first = await runAnalysisPipeline([document()], new ScriptedProvider(validResponses()));
    const second = await runAnalysisPipeline([document()], new ScriptedProvider(validResponses()));

    expect(second).toEqual(first);
  });
});
