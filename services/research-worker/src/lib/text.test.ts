import { describe, expect, it } from "vitest";
import { contentHash, dedupeDocuments, normalizeText } from "./text.js";

describe("normalization and deduplication", () => {
  it("normalizes whitespace and line endings deterministically", () => {
    expect(normalizeText("  First\r\n\r\n\r\n Second\u00a0line  ")).toBe("First\n\n Second line");
  });

  it("deduplicates casing and whitespace variants", () => {
    const first = { normalizedText: "Needed more detail before buying" };
    const second = { normalizedText: " needed   MORE detail before buying " };
    expect(contentHash(first.normalizedText)).toBe(contentHash(second.normalizedText));
    expect(dedupeDocuments([first, second])).toEqual({ unique: [first], duplicateCount: 1 });
  });
});
