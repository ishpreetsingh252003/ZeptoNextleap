import { describe, expect, it } from "vitest";
import { evidenceSchema, type PublicDocument } from "@zepto/research-contracts";
import { executeStructuredRequest } from "./ai/execute.js";
import type { AiProvider, AiStageRequest, AiStageResult } from "./ai/types.js";
import { extractEvidence } from "./evidence-extractor.js";

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

function document(externalId: string, normalizedText: string, sourceType: PublicDocument["sourceType"] = "manual_text"): PublicDocument {
  return {
    externalId,
    sourceType,
    url: `https://example.com/${externalId}`,
    canonicalUrl: `https://example.com/${externalId}`,
    platform: "Test source",
    title: null,
    publicationDate: null,
    capturedAt: "2026-07-24T00:00:00.000Z",
    normalizedText,
    accessMethod: "manual_import",
    policyNote: "Offline evidence-extraction fixture."
  };
}

function response(evidence: unknown[]): string {
  return JSON.stringify({ evidence });
}

const validEvidence = {
  documentId: "doc-1",
  sourceType: "manual_text",
  supportingQuote: "I tried baby care products for the first time",
  sentiment: "positive",
  category: "Baby care",
  confidence: 0.92
};

describe("document evidence extraction", () => {
  it("returns valid grounded evidence", async () => {
    const source = document("doc-1", "I tried baby care products for the first time and would buy them again.");

    await expect(extractEvidence([source], new RawResponseProvider([
      response([validEvidence])
    ]))).resolves.toEqual([validEvidence]);
  });

  it("rejects malformed JSON", async () => {
    await expect(extractEvidence([
      document("doc-1", "A sufficiently detailed public source statement.")
    ], new RawResponseProvider(["not JSON"]))).rejects.toMatchObject({
      code: "AI_STAGE_FAILED",
      attemptCount: 2
    });
  });

  it("rejects a hallucinated quote", async () => {
    const error = await extractEvidence([
      document("doc-1", "The available source says something else entirely.")
    ], new RawResponseProvider([
      response([validEvidence])
    ])).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: "AI_STAGE_FAILED",
      attemptDiagnostics: [
        {
          categories: ["QUOTE_NOT_EXACT"],
          failureLocation: "quote_validation",
          quoteMismatch: {
            categories: expect.any(Array),
            quoteLength: expect.any(Number),
            sourceLength: expect.any(Number),
            editDistance: expect.any(Number),
            normalizationAloneMatched: expect.any(Boolean)
          }
        },
        {
          categories: ["QUOTE_NOT_EXACT"],
          failureLocation: "quote_validation",
          quoteMismatch: {
            categories: expect.any(Array),
            quoteLength: expect.any(Number),
            sourceLength: expect.any(Number),
            editDistance: expect.any(Number),
            normalizationAloneMatched: expect.any(Boolean)
          }
        }
      ]
    });
    const attemptDiagnostics = (error as { attemptDiagnostics: unknown }).attemptDiagnostics;
    expect(JSON.stringify(attemptDiagnostics)).not.toContain(
      "The available source says something else entirely."
    );
    expect(JSON.stringify(attemptDiagnostics)).not.toContain(
      validEvidence.supportingQuote
    );
  });

  it("rejects evidence referencing an unknown document", async () => {
    const error = await extractEvidence([
      document("doc-1", "I tried baby care products for the first time.")
    ], new RawResponseProvider([
      response([{ ...validEvidence, documentId: "unknown" }])
    ])).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: "AI_STAGE_FAILED",
      attemptDiagnostics: [
        {
          categories: ["UNKNOWN_DOCUMENT", "UNKNOWN_EVIDENCE_REFERENCE"],
          failureLocation: "evidence_reference"
        },
        {
          categories: ["UNKNOWN_DOCUMENT", "UNKNOWN_EVIDENCE_REFERENCE"],
          failureLocation: "evidence_reference"
        }
      ]
    });
  });

  it("rejects evidence with a mismatched source type", async () => {
    await expect(extractEvidence([
      document("doc-1", "I tried baby care products for the first time.")
    ], new RawResponseProvider([
      response([{ ...validEvidence, sourceType: "google_play" }])
    ]))).rejects.toMatchObject({ code: "AI_STAGE_FAILED" });
  });

  it("rejects evidence without a supporting quote", async () => {
    const withoutQuote: Record<string, unknown> = { ...validEvidence };
    delete withoutQuote.supportingQuote;

    await expect(extractEvidence([
      document("doc-1", "I tried baby care products for the first time.")
    ], new RawResponseProvider([
      response([withoutQuote])
    ]))).rejects.toMatchObject({ code: "AI_STAGE_FAILED" });
  });

  it("rejects an empty document before calling the provider", async () => {
    const provider = new RawResponseProvider([response([])]);

    await expect(extractEvidence([
      document("empty", "")
    ], provider)).rejects.toBeDefined();
    expect(provider.callCount).toBe(0);
  });

  it("returns immediately for an empty document list", async () => {
    const provider = new RawResponseProvider([response([])]);

    await expect(extractEvidence([], provider)).resolves.toEqual([]);
    expect(provider.callCount).toBe(0);
  });

  it("extracts grounded evidence from multiple documents", async () => {
    const first = document("doc-1", "I tried baby care products for the first time.");
    const second = document("doc-2", "Pet food felt too risky to order online.", "google_play");
    const secondEvidence = {
      documentId: "doc-2",
      sourceType: "google_play",
      supportingQuote: "Pet food felt too risky to order online",
      sentiment: "negative",
      category: "Pet care",
      confidence: 0.88
    };

    await expect(extractEvidence([first, second], new RawResponseProvider([
      response([validEvidence, secondEvidence])
    ]))).resolves.toEqual([validEvidence, secondEvidence]);
  });

  it("rejects duplicate evidence", async () => {
    await expect(extractEvidence([
      document("doc-1", "I tried baby care products for the first time.")
    ], new RawResponseProvider([
      response([validEvidence, validEvidence])
    ]))).rejects.toMatchObject({ code: "AI_STAGE_FAILED" });
  });

  it("allows identical quotes from different documents", async () => {
    const quote = "I needed more information before buying";
    const firstEvidence = {
      ...validEvidence,
      documentId: "doc-1",
      supportingQuote: quote
    };
    const secondEvidence = {
      ...validEvidence,
      documentId: "doc-2",
      supportingQuote: quote
    };

    await expect(extractEvidence([
      document("doc-1", quote),
      document("doc-2", quote)
    ], new RawResponseProvider([
      response([firstEvidence, secondEvidence])
    ]))).resolves.toEqual([firstEvidence, secondEvidence]);
  });

  it.each([-0.01, 1.01])("rejects confidence outside bounds: %s", async (confidence) => {
    await expect(extractEvidence([
      document("doc-1", "I tried baby care products for the first time.")
    ], new RawResponseProvider([
      response([{ ...validEvidence, confidence }])
    ]))).rejects.toMatchObject({ code: "AI_STAGE_FAILED" });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects non-finite confidence: %s",
    (confidence) => {
      expect(evidenceSchema.safeParse({ ...validEvidence, confidence }).success).toBe(false);
    }
  );
});
