import { describe, expect, it } from "vitest";
import { assertThemeTraceability } from "./traceability.js";
import type { ThemeSynthesisOutput } from "./index.js";

const known = "11111111-1111-4111-8111-111111111111";
const unknown = "22222222-2222-4222-8222-222222222222";
const output = (id: string): ThemeSynthesisOutput => ({ themes: [{
  title: "Trust uncertainty changes channel choice",
  summary: "A bounded summary.",
  behavioralMechanism: "The shopper seeks another channel before purchasing.",
  evidenceIds: [id], opposingEvidenceIds: [], boundaryEvidenceIds: [],
  applicability: "Zepto-direct", transferRationale: "The source directly names Zepto.",
  evidenceStrength: "Weak", strengthRationale: "One case only.", limitations: "No prevalence claim.",
  basis: { claimStatus: "inferred", rationale: "Synthesized from one evidence item." }
}] });

describe("assertThemeTraceability", () => {
  it("accepts persisted evidence references", () => expect(() => assertThemeTraceability(output(known), new Set([known]))).not.toThrow());
  it("rejects invented references", () => expect(() => assertThemeTraceability(output(unknown), new Set([known]))).toThrow(/unknown evidence IDs/));
});
