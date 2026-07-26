import { describe, expect, it } from "vitest";
import {
  classifyQuoteMismatch,
  minimumSubstringEditDistance,
  quoteMismatchCategories
} from "./quote-mismatch.js";

describe("sanitized quote mismatch analysis", () => {
  it.each([
    ["UNICODE_NORMALIZATION", "The café was useful.", "cafe\u0301"],
    ["WHITESPACE_NORMALIZATION", "Buy  baby care", "Buy baby care"],
    ["LINE_BREAK_DIFFERENCE", "Buy\nbaby care", "Buy baby care"],
    ["PUNCTUATION_DIFFERENCE", "Great—service", "Great-service"],
    ["CASE_DIFFERENCE", "Baby Care", "baby care"],
    ["ELLIPSIS_OR_TRUNCATION", "Buy baby products online", "Buy...online"],
    ["INSERTED_WORD", "Buy products online", "Buy safe products online"],
    ["MISSING_WORD", "Buy baby products online", "Buy products online"],
    ["REORDERED_TEXT", "Buy baby products", "Products buy baby"],
    ["NOT_PRESENT", "Delivery was fast", "Payment failed"],
    ["OTHER", "Question mark?", "!"]
  ] as const)("classifies %s", (category, source, quote) => {
    expect(classifyQuoteMismatch(source, quote).categories).toContain(category);
  });

  it("supports every declared category", () => {
    const cases = [
      ["The café was useful.", "cafe\u0301"],
      ["Buy  baby care", "Buy baby care"],
      ["Buy\nbaby care", "Buy baby care"],
      ["Great—service", "Great-service"],
      ["Baby Care", "baby care"],
      ["Buy baby products online", "Buy...online"],
      ["Buy products online", "Buy safe products online"],
      ["Buy baby products online", "Buy products online"],
      ["Buy baby products", "Products buy baby"],
      ["Delivery was fast", "Payment failed"],
      ["Question mark?", "!"]
    ] as const;
    const observed = new Set(cases.flatMap(([source, quote]) =>
      classifyQuoteMismatch(source, quote).categories
    ));

    expect([...quoteMismatchCategories].every((category) => observed.has(category))).toBe(true);
  });

  it("reports distance to the closest source substring", () => {
    expect(minimumSubstringEditDistance("prefix exact quote suffix", "exact quote")).toBe(0);
    expect(minimumSubstringEditDistance("prefix exact quote suffix", "exact quxte")).toBe(1);
  });

  it("returns only sanitized metrics", () => {
    const source = "PRIVATE_SOURCE_TEXT";
    const quote = "PRIVATE_GENERATED_QUOTE";
    const diagnostic = classifyQuoteMismatch(source, quote);

    expect(diagnostic).toEqual({
      categories: expect.any(Array),
      quoteLength: quote.length,
      sourceLength: source.length,
      editDistance: expect.any(Number),
      normalizationAloneMatched: false
    });
    expect(JSON.stringify(diagnostic)).not.toContain("PRIVATE");
  });
});
