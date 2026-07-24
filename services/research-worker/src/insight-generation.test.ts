import { describe, expect, it } from "vitest";
import { insightSchema, type Evidence, type Theme } from "@zepto/research-contracts";
import { executeStructuredRequest } from "./ai/execute.js";
import type { AiProvider, AiStageRequest, AiStageResult } from "./ai/types.js";
import { generateInsights } from "./insight-generation.js";
import { evidenceIdFor } from "./theme-clustering.js";

class RawResponseProvider implements AiProvider {
  readonly provider = "gemini" as const;
  readonly model = "test-model";
  callCount = 0;

  constructor(private readonly responses: string[]) {}

  generateStructured<T>(request: AiStageRequest<T>): Promise<AiStageResult<T>> {
    return executeStructuredRequest({
      provider: this.provider,
      model: this.model,
      request,
      invoke: async () => {
        const response = this.responses[Math.min(this.callCount, this.responses.length - 1)];
        this.callCount += 1;
        return response ?? "";
      }
    });
  }
}

function evidence(documentId: string, quote: string, sentiment: Evidence["sentiment"] = "neutral"): Evidence {
  return {
    documentId,
    sourceType: "manual_text",
    supportingQuote: quote,
    sentiment,
    category: "Baby care",
    confidence: 0.9
  };
}

function theme(id: string, title: string, evidenceIds: string[], dominantSentiment: Theme["dominantSentiment"] = "neutral"): Theme {
  return {
    id,
    title,
    description: `Evidence grouped under ${title}.`,
    evidenceIds,
    dominantSentiment,
    evidenceCount: evidenceIds.length
  };
}

function insight(id: string, title: string, themeId: string, evidenceIds: string[], confidence = 0.9) {
  return {
    id,
    title,
    summary: `Evidence-supported summary for ${title}.`,
    themeId,
    evidenceIds,
    sentiment: "neutral",
    confidence
  };
}

function response(insights: unknown[]): string {
  return JSON.stringify({ insights });
}

describe("insight generation", () => {
  it("returns valid traceable insights", async () => {
    const item = evidence("doc-1", "I needed more detail before buying.");
    const evidenceId = evidenceIdFor(item);
    const sourceTheme = theme("theme-1", "Information needs", [evidenceId]);
    const generatedInsight = insight("insight-1", "Missing detail delays purchase", sourceTheme.id, [evidenceId]);

    await expect(generateInsights([sourceTheme], [item], new RawResponseProvider([
      response([generatedInsight])
    ]))).resolves.toEqual([generatedInsight]);
  });

  it("returns immediately for empty themes", async () => {
    const provider = new RawResponseProvider([response([])]);

    await expect(generateInsights([], [
      evidence("doc-1", "This evidence is ignored because no themes were supplied.")
    ], provider)).resolves.toEqual([]);
    expect(provider.callCount).toBe(0);
  });

  it("rejects invalid JSON", async () => {
    const item = evidence("doc-1", "I needed more detail before buying.");
    const sourceTheme = theme("theme-1", "Information needs", [evidenceIdFor(item)]);

    await expect(generateInsights([sourceTheme], [item], new RawResponseProvider([
      "not JSON"
    ]))).rejects.toMatchObject({ code: "AI_STAGE_FAILED", attemptCount: 2 });
  });

  it("rejects an unknown theme", async () => {
    const item = evidence("doc-1", "I needed more detail before buying.");
    const evidenceId = evidenceIdFor(item);
    const sourceTheme = theme("theme-1", "Information needs", [evidenceId]);

    await expect(generateInsights([sourceTheme], [item], new RawResponseProvider([
      response([insight("insight-1", "Unknown theme insight", "unknown-theme", [evidenceId])])
    ]))).rejects.toMatchObject({ code: "AI_STAGE_FAILED" });
  });

  it("rejects unknown evidence", async () => {
    const item = evidence("doc-1", "I needed more detail before buying.");
    const sourceTheme = theme("theme-1", "Information needs", [evidenceIdFor(item)]);

    await expect(generateInsights([sourceTheme], [item], new RawResponseProvider([
      response([insight("insight-1", "Unknown evidence insight", sourceTheme.id, ["unknown-evidence"])])
    ]))).rejects.toMatchObject({ code: "AI_STAGE_FAILED" });
  });

  it("rejects evidence that does not belong to the referenced theme", async () => {
    const first = evidence("doc-1", "I needed more detail before buying.");
    const second = evidence("doc-2", "A discount encouraged me to try it.", "positive");
    const firstTheme = theme("theme-1", "Information needs", [evidenceIdFor(first)]);
    const secondTheme = theme("theme-2", "Trial incentives", [evidenceIdFor(second)], "positive");

    await expect(generateInsights([firstTheme, secondTheme], [first, second], new RawResponseProvider([
      response([insight("insight-1", "Mismatched evidence", firstTheme.id, [evidenceIdFor(second)])])
    ]))).rejects.toMatchObject({ code: "AI_STAGE_FAILED" });
  });

  it("rejects supplied evidence that is absent from the theme partition", async () => {
    const first = evidence("doc-1", "I needed more detail before buying.");
    const second = evidence("doc-2", "A discount encouraged me to try it.", "positive");
    const sourceTheme = theme("theme-1", "Information needs", [evidenceIdFor(first)]);

    await expect(generateInsights([sourceTheme], [first, second], new RawResponseProvider([
      response([])
    ]))).rejects.toThrow("Every supplied evidence record must belong to a theme.");
  });

  it("rejects evidence assigned to multiple supplied themes", async () => {
    const item = evidence("doc-1", "I needed more detail before buying.");
    const evidenceId = evidenceIdFor(item);
    const themes = [
      theme("theme-1", "Information needs", [evidenceId]),
      theme("theme-2", "Purchase uncertainty", [evidenceId])
    ];

    await expect(generateInsights(themes, [item], new RawResponseProvider([
      response([])
    ]))).rejects.toThrow("Evidence cannot belong to multiple supplied themes.");
  });

  it("rejects duplicate insight IDs", async () => {
    const item = evidence("doc-1", "I needed more detail before buying.");
    const evidenceId = evidenceIdFor(item);
    const sourceTheme = theme("theme-1", "Information needs", [evidenceId]);

    await expect(generateInsights([sourceTheme], [item], new RawResponseProvider([
      response([
        insight("insight-1", "First insight", sourceTheme.id, [evidenceId]),
        insight("insight-1", "Second insight", sourceTheme.id, [evidenceId])
      ])
    ]))).rejects.toMatchObject({ code: "AI_STAGE_FAILED" });
  });

  it("rejects duplicate titles case-insensitively", async () => {
    const item = evidence("doc-1", "I needed more detail before buying.");
    const evidenceId = evidenceIdFor(item);
    const sourceTheme = theme("theme-1", "Information needs", [evidenceId]);

    await expect(generateInsights([sourceTheme], [item], new RawResponseProvider([
      response([
        insight("insight-1", "Missing information", sourceTheme.id, [evidenceId]),
        insight("insight-2", " missing INFORMATION ", sourceTheme.id, [evidenceId])
      ])
    ]))).rejects.toMatchObject({ code: "AI_STAGE_FAILED" });
  });

  it.each([-0.01, 1.01])("rejects invalid confidence: %s", async (confidence) => {
    const item = evidence("doc-1", "I needed more detail before buying.");
    const evidenceId = evidenceIdFor(item);
    const sourceTheme = theme("theme-1", "Information needs", [evidenceId]);

    await expect(generateInsights([sourceTheme], [item], new RawResponseProvider([
      response([insight("insight-1", "Invalid confidence", sourceTheme.id, [evidenceId], confidence)])
    ]))).rejects.toMatchObject({ code: "AI_STAGE_FAILED" });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects non-finite confidence: %s",
    (confidence) => {
      expect(insightSchema.safeParse({
        ...insight("insight-1", "Invalid confidence", "theme-1", ["evidence-1"]),
        confidence
      }).success).toBe(false);
    }
  );

  it("rejects malformed responses", async () => {
    const item = evidence("doc-1", "I needed more detail before buying.");
    const sourceTheme = theme("theme-1", "Information needs", [evidenceIdFor(item)]);

    await expect(generateInsights([sourceTheme], [item], new RawResponseProvider([
      JSON.stringify({ observations: [] })
    ]))).rejects.toMatchObject({ code: "AI_STAGE_FAILED" });
  });
});
