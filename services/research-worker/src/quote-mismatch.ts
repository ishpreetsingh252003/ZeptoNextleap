export const quoteMismatchCategories = [
  "UNICODE_NORMALIZATION",
  "WHITESPACE_NORMALIZATION",
  "LINE_BREAK_DIFFERENCE",
  "PUNCTUATION_DIFFERENCE",
  "CASE_DIFFERENCE",
  "ELLIPSIS_OR_TRUNCATION",
  "INSERTED_WORD",
  "MISSING_WORD",
  "REORDERED_TEXT",
  "NOT_PRESENT",
  "OTHER"
] as const;

export type QuoteMismatchCategory = typeof quoteMismatchCategories[number];

export type QuoteMismatchDiagnostic = {
  categories: QuoteMismatchCategory[];
  quoteLength: number;
  sourceLength: number;
  editDistance: number;
  normalizationAloneMatched: boolean;
};

function normalizeUnicode(value: string): string {
  return value.normalize("NFKC");
}

function normalizeLineBreaks(value: string): string {
  return value.replace(/\r\n?|\n/g, " ");
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function normalizePunctuation(value: string): string {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, "\"")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\u2026/g, "...");
}

function removePunctuation(value: string): string {
  return value.replace(/[^\p{L}\p{N}\s]/gu, "");
}

function normalizeForComparison(value: string): string {
  return normalizeWhitespace(
    removePunctuation(
      normalizePunctuation(
        normalizeLineBreaks(
          normalizeUnicode(value)
        )
      )
    )
  ).toLocaleLowerCase("en");
}

function normalizedContains(
  source: string,
  quote: string,
  normalize: (value: string) => string
): boolean {
  const normalizedQuote = normalize(quote);
  return normalizedQuote.length > 0
    && normalize(source).includes(normalizedQuote);
}

function tokens(value: string): string[] {
  const normalized = normalizeForComparison(value);
  return normalized.length === 0 ? [] : normalized.split(" ");
}

function isContiguousSubsequence(source: readonly string[], quote: readonly string[]): boolean {
  if (quote.length === 0 || quote.length > source.length) return false;
  for (let start = 0; start <= source.length - quote.length; start += 1) {
    if (quote.every((token, index) => source[start + index] === token)) return true;
  }
  return false;
}

function isSubsequence(source: readonly string[], quote: readonly string[]): boolean {
  let quoteIndex = 0;
  for (const token of source) {
    if (token === quote[quoteIndex]) quoteIndex += 1;
    if (quoteIndex === quote.length) return true;
  }
  return quote.length === 0;
}

function longestCommonSubsequenceLength(
  source: readonly string[],
  quote: readonly string[]
): number {
  let previous = new Uint32Array(source.length + 1);
  for (const quoteToken of quote) {
    const current = new Uint32Array(source.length + 1);
    for (let sourceIndex = 1; sourceIndex <= source.length; sourceIndex += 1) {
      current[sourceIndex] = quoteToken === source[sourceIndex - 1]
        ? (previous[sourceIndex - 1] ?? 0) + 1
        : Math.max(
          previous[sourceIndex] ?? 0,
          current[sourceIndex - 1] ?? 0
        );
    }
    previous = current;
  }
  return previous[source.length] ?? 0;
}

function hasSameAvailableTokens(
  source: readonly string[],
  quote: readonly string[]
): boolean {
  const counts = new Map<string, number>();
  for (const token of source) counts.set(token, (counts.get(token) ?? 0) + 1);
  for (const token of quote) {
    const count = counts.get(token) ?? 0;
    if (count === 0) return false;
    counts.set(token, count - 1);
  }
  return true;
}

export function minimumSubstringEditDistance(source: string, quote: string): number {
  const sourceCharacters = Array.from(source);
  const quoteCharacters = Array.from(quote);
  if (quoteCharacters.length === 0) return 0;
  if (sourceCharacters.length === 0) return quoteCharacters.length;

  let previous = new Uint32Array(sourceCharacters.length + 1);
  for (let quoteIndex = 1; quoteIndex <= quoteCharacters.length; quoteIndex += 1) {
    const current = new Uint32Array(sourceCharacters.length + 1);
    current[0] = quoteIndex;
    for (let sourceIndex = 1; sourceIndex <= sourceCharacters.length; sourceIndex += 1) {
      const substitutionCost = quoteCharacters[quoteIndex - 1]
        === sourceCharacters[sourceIndex - 1] ? 0 : 1;
      current[sourceIndex] = Math.min(
        (previous[sourceIndex] ?? 0) + 1,
        (current[sourceIndex - 1] ?? 0) + 1,
        (previous[sourceIndex - 1] ?? 0) + substitutionCost
      );
    }
    previous = current;
  }
  return Math.min(...previous);
}

export function classifyQuoteMismatch(
  source: string,
  quote: string
): QuoteMismatchDiagnostic {
  const categories: QuoteMismatchCategory[] = [];
  const unicodeMatched = normalizedContains(source, quote, normalizeUnicode);
  const lineBreakMatched = normalizedContains(source, quote, (value) =>
    normalizeLineBreaks(value)
  );
  const whitespaceMatched = normalizedContains(source, quote, (value) =>
    normalizeWhitespace(normalizeLineBreaks(value))
  );
  const punctuationMatched = normalizedContains(source, quote, (value) =>
    normalizeWhitespace(removePunctuation(normalizePunctuation(value)))
  );
  const caseMatched = normalizedContains(source, quote, (value) =>
    value.toLocaleLowerCase("en")
  );
  const normalizationAloneMatched = normalizedContains(
    source,
    quote,
    normalizeForComparison
  );

  if (unicodeMatched) categories.push("UNICODE_NORMALIZATION");
  if (lineBreakMatched && /[\r\n]/u.test(source + quote)) {
    categories.push("LINE_BREAK_DIFFERENCE");
  }
  if (whitespaceMatched && !lineBreakMatched) categories.push("WHITESPACE_NORMALIZATION");
  if (punctuationMatched && !whitespaceMatched) categories.push("PUNCTUATION_DIFFERENCE");
  if (caseMatched) categories.push("CASE_DIFFERENCE");

  if (!normalizationAloneMatched) {
    const sourceTokens = tokens(source);
    const quoteTokens = tokens(quote);
    const commonLength = longestCommonSubsequenceLength(sourceTokens, quoteTokens);
    const contiguous = isContiguousSubsequence(sourceTokens, quoteTokens);
    const subsequence = isSubsequence(sourceTokens, quoteTokens);
    const explicitEllipsis = /(?:\u2026|\.{3})/u.test(quote);

    if (explicitEllipsis) categories.push("ELLIPSIS_OR_TRUNCATION");
    if (quoteTokens.length > 0) {
      if (commonLength === 0) {
        categories.push("NOT_PRESENT");
      } else {
        if (subsequence && !contiguous) categories.push("MISSING_WORD");
        if (commonLength < quoteTokens.length) categories.push("INSERTED_WORD");
        if (
          quoteTokens.length > 1
          && hasSameAvailableTokens(sourceTokens, quoteTokens)
          && !subsequence
        ) {
          categories.push("REORDERED_TEXT");
        }
      }
    }
  }

  if (categories.length === 0) categories.push("OTHER");
  return {
    categories: [...new Set(categories)],
    quoteLength: Array.from(quote).length,
    sourceLength: Array.from(source).length,
    editDistance: minimumSubstringEditDistance(source, quote),
    normalizationAloneMatched
  };
}
