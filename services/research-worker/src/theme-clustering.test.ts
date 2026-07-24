import { describe, expect, it } from "vitest";
import type { Evidence } from "@zepto/research-contracts";
import { executeStructuredRequest } from "./ai/execute.js";
import type { AiProvider, AiStageRequest, AiStageResult } from "./ai/types.js";
import { clusterEvidence, evidenceIdFor } from "./theme-clustering.js";

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

function theme(id: string, title: string, evidenceIds: string[], dominantSentiment: Evidence["sentiment"] = "neutral") {
  return {
    id,
    title,
    description: `Evidence grouped under ${title}.`,
    evidenceIds,
    dominantSentiment,
    evidenceCount: evidenceIds.length
  };
}

function response(themes: unknown[]): string {
  return JSON.stringify({ themes });
}

describe("theme clustering", () => {
  it("returns valid clustering with every evidence record assigned once", async () => {
    const first = evidence("doc-1", "I needed more detail before buying.");
    const second = evidence("doc-2", "The product information answered my questions.", "positive");
    const clusteredTheme = theme("theme-1", "Information needs", [
      evidenceIdFor(first),
      evidenceIdFor(second)
    ], "mixed");

    await expect(clusterEvidence([first, second], new RawResponseProvider([
      response([clusteredTheme])
    ]))).resolves.toEqual([clusteredTheme]);
  });

  it("returns immediately for an empty evidence list", async () => {
    const provider = new RawResponseProvider([response([])]);

    await expect(clusterEvidence([], provider)).resolves.toEqual([]);
    expect(provider.callCount).toBe(0);
  });

  it("rejects invalid JSON", async () => {
    await expect(clusterEvidence([
      evidence("doc-1", "I needed more detail before buying.")
    ], new RawResponseProvider(["not JSON"]))).rejects.toMatchObject({
      code: "AI_STAGE_FAILED",
      attemptCount: 2
    });
  });

  it("rejects an unknown evidence ID", async () => {
    await expect(clusterEvidence([
      evidence("doc-1", "I needed more detail before buying.")
    ], new RawResponseProvider([
      response([theme("theme-1", "Information needs", ["unknown-evidence"])])
    ]))).rejects.toMatchObject({ code: "AI_STAGE_FAILED" });
  });

  it("rejects duplicate evidence assignments", async () => {
    const item = evidence("doc-1", "I needed more detail before buying.");
    const evidenceId = evidenceIdFor(item);

    await expect(clusterEvidence([item], new RawResponseProvider([
      response([
        theme("theme-1", "Information needs", [evidenceId]),
        theme("theme-2", "Purchase uncertainty", [evidenceId])
      ])
    ]))).rejects.toMatchObject({ code: "AI_STAGE_FAILED" });
  });

  it("rejects duplicate theme titles", async () => {
    const first = evidence("doc-1", "I needed more detail before buying.");
    const second = evidence("doc-2", "I searched elsewhere for answers.");

    await expect(clusterEvidence([first, second], new RawResponseProvider([
      response([
        theme("theme-1", "Information needs", [evidenceIdFor(first)]),
        theme("theme-2", " information NEEDS ", [evidenceIdFor(second)])
      ])
    ]))).rejects.toMatchObject({ code: "AI_STAGE_FAILED" });
  });

  it("rejects duplicate theme IDs", async () => {
    const first = evidence("doc-1", "I needed more detail before buying.");
    const second = evidence("doc-2", "A discount encouraged me to try it.", "positive");

    await expect(clusterEvidence([first, second], new RawResponseProvider([
      response([
        theme("theme-1", "Information needs", [evidenceIdFor(first)]),
        theme("theme-1", "Trial incentives", [evidenceIdFor(second)], "positive")
      ])
    ]))).rejects.toMatchObject({ code: "AI_STAGE_FAILED" });
  });

  it("rejects an empty theme", async () => {
    await expect(clusterEvidence([
      evidence("doc-1", "I needed more detail before buying.")
    ], new RawResponseProvider([
      response([theme("theme-1", "Empty theme", [])])
    ]))).rejects.toMatchObject({ code: "AI_STAGE_FAILED" });
  });

  it("rejects an incorrect evidence count", async () => {
    const item = evidence("doc-1", "I needed more detail before buying.");
    const invalidTheme = {
      ...theme("theme-1", "Information needs", [evidenceIdFor(item)]),
      evidenceCount: 2
    };

    await expect(clusterEvidence([item], new RawResponseProvider([
      response([invalidTheme])
    ]))).rejects.toMatchObject({ code: "AI_STAGE_FAILED" });
  });

  it("accepts a single evidence record in one theme", async () => {
    const item = evidence("doc-1", "I trusted the detailed ingredient list.", "positive");
    const singleTheme = theme("theme-1", "Trust through detail", [evidenceIdFor(item)], "positive");

    await expect(clusterEvidence([item], new RawResponseProvider([
      response([singleTheme])
    ]))).resolves.toEqual([singleTheme]);
  });

  it("accepts multiple complete themes", async () => {
    const first = evidence("doc-1", "I needed more detail before buying.");
    const second = evidence("doc-2", "A discount encouraged me to try it.", "positive");
    const themes = [
      theme("theme-1", "Information needs", [evidenceIdFor(first)]),
      theme("theme-2", "Trial incentives", [evidenceIdFor(second)], "positive")
    ];

    await expect(clusterEvidence([first, second], new RawResponseProvider([
      response(themes)
    ]))).resolves.toEqual(themes);
  });

  it("rejects malformed theme responses", async () => {
    await expect(clusterEvidence([
      evidence("doc-1", "I needed more detail before buying.")
    ], new RawResponseProvider([
      JSON.stringify({ groups: [] })
    ]))).rejects.toMatchObject({ code: "AI_STAGE_FAILED" });
  });

  it("rejects clustering that leaves evidence unassigned", async () => {
    const first = evidence("doc-1", "I needed more detail before buying.");
    const second = evidence("doc-2", "A discount encouraged me to try it.", "positive");

    await expect(clusterEvidence([first, second], new RawResponseProvider([
      response([theme("theme-1", "Information needs", [evidenceIdFor(first)])])
    ]))).rejects.toMatchObject({ code: "AI_STAGE_FAILED" });
  });

  it("generates stable, identity-sensitive evidence IDs", () => {
    const item = evidence("doc-1", "I needed more detail before buying.");

    expect(evidenceIdFor({ ...item })).toBe(evidenceIdFor(item));
    expect(evidenceIdFor({ ...item, documentId: "doc-2" })).not.toBe(evidenceIdFor(item));
    expect(evidenceIdFor({ ...item, sourceType: "google_play" })).not.toBe(evidenceIdFor(item));
    expect(evidenceIdFor({ ...item, supportingQuote: "I found enough detail before buying." })).not.toBe(evidenceIdFor(item));
  });
});
