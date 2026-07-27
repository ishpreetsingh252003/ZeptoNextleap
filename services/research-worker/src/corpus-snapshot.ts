import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { publicDocumentSchema, type PublicDocument } from "@zepto/research-contracts";
import { z } from "zod";
import {
  createBoundedBatches,
  estimatePromptTokens,
  type BatchLimits
} from "./analysis-scale.js";

const SNAPSHOT_VERSION = "frozen-corpus-v1";
const NORMALIZATION_VERSION = "normalizeText-nfkc-v1+sha256-dedupe-v1";
const BATCH_OVERHEAD_TOKENS = 256;

export const frozenCorpusRecordSchema = z.object({
  documentId: z.string().min(1),
  sourceType: z.literal("google_play"),
  normalizedText: z.string().min(1).max(20_000),
  createdDate: z.string().datetime().nullable(),
  rating: z.number().int().min(1).max(5),
  locale: z.string().min(1),
  packageId: z.string().min(1)
}).strict();

export const frozenCorpusSnapshotSchema = z.object({
  schemaVersion: z.literal(SNAPSHOT_VERSION),
  sourceMode: z.literal("google_play_snapshot"),
  collectionTimestamp: z.string().datetime(),
  requestedCount: z.number().int().positive(),
  collectedCount: z.number().int().nonnegative(),
  eligibleCount: z.number().int().nonnegative(),
  paginationDepth: z.number().int().nonnegative(),
  normalizationDeduplicationVersion: z.literal(NORMALIZATION_VERSION),
  reconciliation: z.object({
    invalid: z.number().int().nonnegative(),
    normalizedEmpty: z.number().int().nonnegative(),
    exactDuplicates: z.number().int().nonnegative()
  }).strict(),
  fingerprint: z.object({
    algorithm: z.literal("sha256"),
    value: z.string().regex(/^[a-f0-9]{64}$/)
  }).strict(),
  records: z.array(frozenCorpusRecordSchema)
}).strict().superRefine((snapshot, context) => {
  if (snapshot.records.length !== snapshot.eligibleCount) {
    context.addIssue({ code: "custom", path: ["eligibleCount"], message: "Eligible count does not match records." });
  }
  if (
    snapshot.collectedCount
      - snapshot.reconciliation.invalid
      - snapshot.reconciliation.normalizedEmpty
      - snapshot.reconciliation.exactDuplicates
    !== snapshot.eligibleCount
  ) {
    context.addIssue({ code: "custom", path: ["reconciliation"], message: "Reconciliation does not balance." });
  }
  const ids = new Set<string>();
  for (const [index, record] of snapshot.records.entries()) {
    if (ids.has(record.documentId)) {
      context.addIssue({ code: "custom", path: ["records", index, "documentId"], message: "Duplicate document ID." });
    }
    ids.add(record.documentId);
  }
});

export type FrozenCorpusRecord = z.infer<typeof frozenCorpusRecordSchema>;
export type FrozenCorpusSnapshot = z.infer<typeof frozenCorpusSnapshotSchema>;

function canonicalRecord(record: FrozenCorpusRecord): string {
  return JSON.stringify({
    documentId: record.documentId,
    sourceType: record.sourceType,
    normalizedText: record.normalizedText,
    createdDate: record.createdDate,
    rating: record.rating,
    locale: record.locale,
    packageId: record.packageId
  });
}

export function corpusFingerprint(records: readonly FrozenCorpusRecord[]): string {
  const canonical = records.map(canonicalRecord).sort().join("\n");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function snapshotRecordFromDocument(document: PublicDocument): FrozenCorpusRecord {
  const metadata = document.sourceMetadata;
  if (
    document.sourceType !== "google_play"
    || metadata?.rating === undefined
    || !metadata.locale
    || !metadata.packageId
  ) {
    throw new Error(`Document ${document.externalId} lacks required Google Play snapshot metadata.`);
  }
  return frozenCorpusRecordSchema.parse({
    documentId: document.externalId,
    sourceType: document.sourceType,
    normalizedText: document.normalizedText,
    createdDate: document.publicationDate,
    rating: metadata.rating,
    locale: metadata.locale,
    packageId: metadata.packageId
  });
}

export function createFrozenCorpusSnapshot(input: {
  requestedCount: number;
  collectedCount: number;
  paginationDepth: number;
  invalid: number;
  normalizedEmpty: number;
  exactDuplicates: number;
  eligibleDocuments: readonly PublicDocument[];
  collectionTimestamp?: string;
}): FrozenCorpusSnapshot {
  const records = input.eligibleDocuments.map(snapshotRecordFromDocument);
  return frozenCorpusSnapshotSchema.parse({
    schemaVersion: SNAPSHOT_VERSION,
    sourceMode: "google_play_snapshot",
    collectionTimestamp: input.collectionTimestamp ?? new Date().toISOString(),
    requestedCount: input.requestedCount,
    collectedCount: input.collectedCount,
    eligibleCount: records.length,
    paginationDepth: input.paginationDepth,
    normalizationDeduplicationVersion: NORMALIZATION_VERSION,
    reconciliation: {
      invalid: input.invalid,
      normalizedEmpty: input.normalizedEmpty,
      exactDuplicates: input.exactDuplicates
    },
    fingerprint: { algorithm: "sha256", value: corpusFingerprint(records) },
    records
  });
}

export function parseFrozenCorpusSnapshot(value: unknown): FrozenCorpusSnapshot {
  const snapshot = frozenCorpusSnapshotSchema.parse(value);
  if (corpusFingerprint(snapshot.records) !== snapshot.fingerprint.value) {
    throw new Error("Frozen corpus fingerprint verification failed.");
  }
  return snapshot;
}

export async function writeFrozenCorpusSnapshot(
  path: string,
  snapshot: FrozenCorpusSnapshot
): Promise<void> {
  await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx"
  });
}

export async function loadFrozenCorpusSnapshot(path: string): Promise<FrozenCorpusSnapshot> {
  return parseFrozenCorpusSnapshot(JSON.parse(await readFile(path, "utf8")) as unknown);
}

export function documentsFromFrozenCorpus(snapshot: FrozenCorpusSnapshot): PublicDocument[] {
  return publicDocumentSchema.array().parse(snapshot.records.map((record): PublicDocument => {
    const canonicalUrl = `https://play.google.com/store/apps/details?id=${encodeURIComponent(record.packageId)}`;
    return {
      externalId: record.documentId,
      url: canonicalUrl,
      canonicalUrl,
      sourceType: record.sourceType,
      sourceName: "Google Play",
      platform: "Google Play",
      title: null,
      publicationDate: record.createdDate,
      capturedAt: snapshot.collectionTimestamp,
      normalizedText: record.normalizedText,
      accessMethod: "public_page",
      policyNote: "Replayed from a verified local frozen Google Play corpus snapshot.",
      sourceMetadata: {
        rating: record.rating,
        locale: record.locale,
        country: "India",
        packageId: record.packageId
      }
    };
  }));
}

export type EvidenceInputBatchDescriptor = {
  batchIndex: number;
  fingerprint: string;
  documentCount: number;
  estimatedPromptTokens: number;
};

export function evidenceInputBatchDescriptors(
  records: readonly FrozenCorpusRecord[],
  limits: BatchLimits
): EvidenceInputBatchDescriptor[] {
  const batches = createBoundedBatches(records, limits, (record) => JSON.stringify({
    documentId: record.documentId,
    sourceType: record.sourceType,
    text: record.normalizedText
  }));
  return batches.map((batch, batchIndex) => ({
    batchIndex,
    fingerprint: corpusFingerprint(batch),
    documentCount: batch.length,
    estimatedPromptTokens: BATCH_OVERHEAD_TOKENS + batch.reduce(
      (total, record) => total + estimatePromptTokens(JSON.stringify({
        documentId: record.documentId,
        sourceType: record.sourceType,
        text: record.normalizedText
      })),
      0
    )
  }));
}
