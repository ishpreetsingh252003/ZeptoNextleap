import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  corpusFingerprint,
  createFrozenCorpusSnapshot,
  evidenceInputBatchDescriptors,
  loadFrozenCorpusSnapshot,
  parseFrozenCorpusSnapshot,
  writeFrozenCorpusSnapshot,
  type FrozenCorpusRecord
} from "./corpus-snapshot.js";

const first: FrozenCorpusRecord = {
  documentId: "app:r1",
  sourceType: "google_play",
  normalizedText: "Delivery was late.",
  createdDate: "2026-01-01T00:00:00.000Z",
  rating: 2,
  locale: "en-IN",
  packageId: "com.example.app"
};
const second: FrozenCorpusRecord = {
  ...first,
  documentId: "app:r2",
  normalizedText: "Checkout was easy.",
  rating: 5
};

function document(record: FrozenCorpusRecord) {
  const url = `https://play.google.com/store/apps/details?id=${record.packageId}`;
  return {
    externalId: record.documentId,
    url,
    canonicalUrl: url,
    sourceType: record.sourceType,
    sourceName: "Google Play",
    platform: "Google Play",
    title: null,
    publicationDate: record.createdDate,
    capturedAt: "2026-01-02T00:00:00.000Z",
    normalizedText: record.normalizedText,
    accessMethod: "public_page" as const,
    policyNote: "Public review.",
    sourceMetadata: {
      rating: record.rating,
      locale: record.locale,
      packageId: record.packageId
    }
  };
}

function snapshot() {
  return createFrozenCorpusSnapshot({
    requestedCount: 2,
    collectedCount: 2,
    paginationDepth: 1,
    invalid: 0,
    normalizedEmpty: 0,
    exactDuplicates: 0,
    eligibleDocuments: [document(first), document(second)],
    collectionTimestamp: "2026-01-02T00:00:00.000Z"
  });
}

describe("frozen corpus snapshots", () => {
  it("produces the same order-independent fingerprint", () => {
    expect(corpusFingerprint([first, second])).toBe(corpusFingerprint([second, first]));
    expect(corpusFingerprint([first, second])).toBe(corpusFingerprint([first, second]));
  });

  it("changes fingerprint for content changes, additions, and removals", () => {
    const baseline = corpusFingerprint([first, second]);
    expect(corpusFingerprint([{ ...first, normalizedText: "Changed" }, second])).not.toBe(baseline);
    expect(corpusFingerprint([first])).not.toBe(baseline);
    expect(corpusFingerprint([first, second, { ...second, documentId: "app:r3" }])).not.toBe(baseline);
  });

  it("rejects malformed and tampered snapshots", () => {
    const value = snapshot();
    expect(() => parseFrozenCorpusSnapshot({ ...value, credentials: "secret" })).toThrow();
    expect(() => parseFrozenCorpusSnapshot({
      ...value,
      records: [{ ...value.records[0], normalizedText: "tampered" }, value.records[1]]
    })).toThrow("fingerprint verification");
  });

  it("writes and loads only the allowlisted snapshot fields", async () => {
    const directory = await mkdtemp(join(tmpdir(), "zepto-corpus-"));
    const path = join(directory, "snapshot.json");
    await writeFrozenCorpusSnapshot(path, snapshot());
    const serialized = await readFile(path, "utf8");
    expect(serialized).not.toMatch(/credential|prompt|gemini|providerResponse/i);
    expect((await loadFrozenCorpusSnapshot(path)).fingerprint.value).toHaveLength(64);
    await writeFile(path, serialized.replace("Delivery was late.", "Tampered."), "utf8");
    await expect(loadFrozenCorpusSnapshot(path)).rejects.toThrow("fingerprint verification");
  });

  it("produces stable evidence-input batch fingerprints", () => {
    const limits = { maxItems: 1, maxEstimatedPromptTokens: 32_000 };
    expect(evidenceInputBatchDescriptors([first, second], limits))
      .toEqual(evidenceInputBatchDescriptors([first, second], limits));
  });
});
