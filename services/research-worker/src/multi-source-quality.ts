import { createHash } from "node:crypto";
import type { PublicDocument } from "@zepto/research-contracts";
import { contentHash, normalizeText } from "./lib/text.js";

export type NearDuplicateCandidate = {
  documentIds: [string, string];
  sourceNames: [string, string];
  similarity: number;
};

export type SourceDistribution = {
  sourceName: string;
  recordCount: number;
  percentageContribution: number;
  ratingDistribution: Record<"one" | "two" | "three" | "four" | "five" | "unknown", number>;
  earliestDate: string | null;
  latestDate: string | null;
  averageTextLength: number;
  exactDuplicatesRemoved: number;
  duplicateRate: number;
  missingMetadataRate: number;
};

export type MultiSourceQualityReport = {
  inputCount: number;
  exactDuplicatesRemoved: number;
  exactDuplicatesBySource: Record<string, number>;
  crossSourceExactDuplicates: number;
  nearDuplicateCandidates: NearDuplicateCandidate[];
  retainedCountBySource: Record<string, number>;
  capRemovedBySource: Record<string, number>;
  selectedDocuments: PublicDocument[];
  sourceDistribution: SourceDistribution[];
};

export const defaultSourceCaps: Readonly<Record<string, number>> = {
  "Google Play": 200,
  "Apple App Store": 100,
  Reddit: 50,
  "Curated public URL": 25,
  "CSV import": 100
};

function stableDocumentKey(document: PublicDocument): string {
  return createHash("sha256")
    .update(JSON.stringify([
      document.sourceName,
      document.sourceType,
      document.externalId,
      document.normalizedText
    ]))
    .digest("hex");
}

function tokens(text: string): Set<string> {
  return new Set(
    normalizeText(text)
      .toLocaleLowerCase("en")
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length > 2)
  );
}

function jaccard(first: Set<string>, second: Set<string>): number {
  if (first.size < 8 || second.size < 8) return 0;
  let intersection = 0;
  for (const value of first) if (second.has(value)) intersection += 1;
  return intersection / (first.size + second.size - intersection);
}

function ratingDistribution(documents: readonly PublicDocument[]) {
  const result = { one: 0, two: 0, three: 0, four: 0, five: 0, unknown: 0 };
  for (const document of documents) {
    const rating = document.sourceMetadata?.rating;
    if (rating === undefined) result.unknown += 1;
    else if (rating === 1) result.one += 1;
    else if (rating === 2) result.two += 1;
    else if (rating === 3) result.three += 1;
    else if (rating === 4) result.four += 1;
    else result.five += 1;
  }
  return result;
}

export function analyzeMultiSourceQuality(
  documents: readonly PublicDocument[],
  options: {
    sourceCaps?: Readonly<Record<string, number>> | null;
    defaultCap?: number | null;
    nearDuplicateThreshold?: number;
  } = {}
): MultiSourceQualityReport {
  const sourceCaps = options.sourceCaps === undefined ? defaultSourceCaps : options.sourceCaps;
  const defaultCap = options.defaultCap === undefined ? 100 : options.defaultCap;
  const nearDuplicateThreshold = options.nearDuplicateThreshold ?? 0.85;
  if (nearDuplicateThreshold <= 0 || nearDuplicateThreshold >= 1) {
    throw new Error("Near-duplicate threshold must be between 0 and 1.");
  }
  for (const cap of [
    ...(sourceCaps ? Object.values(sourceCaps) : []),
    ...(defaultCap === null ? [] : [defaultCap])
  ]) {
    if (!Number.isInteger(cap) || cap < 0) {
      throw new Error("Source caps must be non-negative integers.");
    }
  }

  const exactGroups = new Map<string, PublicDocument[]>();
  for (const document of documents) {
    const normalized = { ...document, normalizedText: normalizeText(document.normalizedText) };
    const hash = contentHash(normalized.normalizedText);
    exactGroups.set(hash, [...(exactGroups.get(hash) ?? []), normalized]);
  }

  const exactDuplicatesBySource: Record<string, number> = {};
  let crossSourceExactDuplicates = 0;
  const exactUnique: PublicDocument[] = [];
  for (const group of exactGroups.values()) {
    const ordered = [...group].sort((first, second) =>
      stableDocumentKey(first).localeCompare(stableDocumentKey(second))
    );
    exactUnique.push(ordered[0]!);
    const groupSources = new Set(ordered.map(({ sourceName }) => sourceName));
    for (const duplicate of ordered.slice(1)) {
      exactDuplicatesBySource[duplicate.sourceName] =
        (exactDuplicatesBySource[duplicate.sourceName] ?? 0) + 1;
      if (groupSources.size > 1) crossSourceExactDuplicates += 1;
    }
  }
  exactUnique.sort((first, second) =>
    stableDocumentKey(first).localeCompare(stableDocumentKey(second))
  );

  const nearDuplicateCandidates: NearDuplicateCandidate[] = [];
  const tokenSets = exactUnique.map((document) => tokens(document.normalizedText));
  for (let firstIndex = 0; firstIndex < exactUnique.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < exactUnique.length; secondIndex += 1) {
      const first = exactUnique[firstIndex]!;
      const second = exactUnique[secondIndex]!;
      const similarity = jaccard(tokenSets[firstIndex]!, tokenSets[secondIndex]!);
      if (similarity >= nearDuplicateThreshold) {
        nearDuplicateCandidates.push({
          documentIds: [first.externalId, second.externalId],
          sourceNames: [first.sourceName, second.sourceName],
          similarity
        });
      }
    }
  }

  const bySource = new Map<string, PublicDocument[]>();
  for (const document of exactUnique) {
    bySource.set(document.sourceName, [...(bySource.get(document.sourceName) ?? []), document]);
  }
  const capRemovedBySource: Record<string, number> = {};
  const selectedDocuments = [...bySource.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .flatMap(([sourceName, sourceDocuments]) => {
      const cap = sourceCaps === null
        ? Number.POSITIVE_INFINITY
        : sourceCaps[sourceName] ?? defaultCap ?? Number.POSITIVE_INFINITY;
      const ordered = [...sourceDocuments].sort((first, second) =>
        stableDocumentKey(first).localeCompare(stableDocumentKey(second))
      );
      capRemovedBySource[sourceName] = Math.max(0, ordered.length - cap);
      return ordered.slice(0, cap);
    });

  const retainedCountBySource = Object.fromEntries(
    [...new Set(selectedDocuments.map(({ sourceName }) => sourceName))]
      .sort()
      .map((sourceName) => [
        sourceName,
        selectedDocuments.filter((document) => document.sourceName === sourceName).length
      ])
  );
  const sourceDistribution = Object.entries(retainedCountBySource).map(
    ([sourceName, recordCount]): SourceDistribution => {
      const sourceDocuments = selectedDocuments.filter(
        (document) => document.sourceName === sourceName
      );
      const timestamps = sourceDocuments
        .map(({ publicationDate }) => publicationDate)
        .filter((value): value is string => value !== null)
        .sort();
      const originalCount = documents.filter(
        (document) => document.sourceName === sourceName
      ).length;
      const ratingExpected = new Set([
        "Google Play",
        "Apple App Store",
        "Trustpilot"
      ]).has(sourceName);
      const missingMetadata = sourceDocuments.filter((document) =>
        document.publicationDate === null
        || (ratingExpected && document.sourceMetadata?.rating === undefined)
        || document.sourceMetadata?.sourceUrlAvailable === false
      ).length;
      return {
        sourceName,
        recordCount,
        percentageContribution:
          selectedDocuments.length === 0 ? 0 : recordCount / selectedDocuments.length * 100,
        ratingDistribution: ratingDistribution(sourceDocuments),
        earliestDate: timestamps[0] ?? null,
        latestDate: timestamps.at(-1) ?? null,
        averageTextLength:
          sourceDocuments.reduce((total, item) => total + item.normalizedText.length, 0)
          / sourceDocuments.length,
        exactDuplicatesRemoved: exactDuplicatesBySource[sourceName] ?? 0,
        duplicateRate:
          originalCount === 0 ? 0 : (exactDuplicatesBySource[sourceName] ?? 0) / originalCount,
        missingMetadataRate:
          sourceDocuments.length === 0 ? 0 : missingMetadata / sourceDocuments.length
      };
    }
  );

  return {
    inputCount: documents.length,
    exactDuplicatesRemoved: documents.length - exactUnique.length,
    exactDuplicatesBySource,
    crossSourceExactDuplicates,
    nearDuplicateCandidates,
    retainedCountBySource,
    capRemovedBySource,
    selectedDocuments,
    sourceDistribution
  };
}
