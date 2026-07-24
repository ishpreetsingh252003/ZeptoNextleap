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

  it("deduplicates identical text and retains the first document", () => {
    const first = { externalId: "first", normalizedText: "Identical review" };
    const second = { externalId: "second", normalizedText: "Identical review" };

    expect(dedupeDocuments([first, second])).toEqual({
      unique: [first],
      duplicateCount: 1
    });
  });

  it("keeps punctuation differences", () => {
    const withoutPunctuation = { normalizedText: "Would buy again" };
    const withPunctuation = { normalizedText: "Would buy again!" };

    expect(dedupeDocuments([withoutPunctuation, withPunctuation])).toEqual({
      unique: [withoutPunctuation, withPunctuation],
      duplicateCount: 0
    });
  });

  it("deduplicates matching text across different sources", () => {
    const googlePlay = { sourceType: "google_play", normalizedText: "Delivery was quick" };
    const publicUrl = { sourceType: "public_url", normalizedText: "Delivery was quick" };

    expect(dedupeDocuments([googlePlay, publicUrl])).toEqual({
      unique: [googlePlay],
      duplicateCount: 1
    });
  });

  it("does not use URLs or external IDs as matching criteria", () => {
    const sameUrl = [
      { externalId: "one", url: "https://example.com/review", normalizedText: "First review" },
      { externalId: "two", url: "https://example.com/review", normalizedText: "Second review" }
    ];
    const sameExternalId = [
      { externalId: "shared", url: "https://example.com/one", normalizedText: "Third review" },
      { externalId: "shared", url: "https://example.com/two", normalizedText: "Fourth review" }
    ];

    expect(dedupeDocuments(sameUrl)).toEqual({ unique: sameUrl, duplicateCount: 0 });
    expect(dedupeDocuments(sameExternalId)).toEqual({ unique: sameExternalId, duplicateCount: 0 });
  });

  it("treats empty and whitespace-only text as matching", () => {
    const empty = { normalizedText: "" };
    const whitespace = { normalizedText: " \t\r\n " };

    expect(dedupeDocuments([empty, whitespace])).toEqual({
      unique: [empty],
      duplicateCount: 1
    });
  });

  it("preserves first-occurrence ordering", () => {
    const first = { id: "first", normalizedText: "Alpha" };
    const second = { id: "second", normalizedText: "Beta" };
    const duplicateFirst = { id: "duplicate-first", normalizedText: " alpha " };
    const third = { id: "third", normalizedText: "Gamma" };

    expect(dedupeDocuments([first, second, duplicateFirst, third])).toEqual({
      unique: [first, second, third],
      duplicateCount: 1
    });
  });
});
