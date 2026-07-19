import { describe, expect, it } from "vitest";
import { evidenceExtractionOutputSchema, relevanceOutputSchema } from "./index.js";

describe("AI output contracts", () => {
  it("rejects an unsupported applicability label", () => {
    const result = evidenceExtractionOutputSchema.safeParse({ items: [{
      sourceExternalId: "public-source-1",
      neutralParaphrase: "A bounded observation.",
      minimalExcerpt: "bounded excerpt",
      categoryGroup: "Baby care",
      shoppingMission: "Routine replenishment",
      interpretationCertainty: "explicit",
      outcome: null,
      applicability: "Zepto user by assumption",
      transferRationale: "No valid transfer rationale.",
      evidenceValence: "confirming",
      limitations: "One public statement.",
      basis: { claimStatus: "observed", rationale: "Present in source text." }
    }] });
    expect(result.success).toBe(false);
  });

  it("requires reasoning status and rationale", () => {
    expect(relevanceOutputSchema.safeParse({ relevant: true, categoryExpansionConnection: "Connected to category consideration.", exclusionReason: null }).success).toBe(false);
  });
});
