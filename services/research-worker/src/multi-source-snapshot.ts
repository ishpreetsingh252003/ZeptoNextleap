import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import {
  publicDocumentSchema,
  type PublicDocument
} from "@zepto/research-contracts";
import { z } from "zod";

const MULTI_SOURCE_SNAPSHOT_VERSION = "multi-source-corpus-v1";

const sourceCountSchema = z.record(
  z.string().min(1),
  z.number().int().nonnegative()
);

export const multiSourceSnapshotSchema = z.object({
  schemaVersion: z.literal(MULTI_SOURCE_SNAPSHOT_VERSION),
  sourceMode: z.literal("multi_source_snapshot"),
  createdAt: z.string().datetime(),
  records: z.array(publicDocumentSchema),
  sourceComposition: sourceCountSchema,
  reconciliation: z.object({
    input: z.number().int().nonnegative(),
    exactDuplicatesRemoved: z.number().int().nonnegative(),
    capRemoved: z.number().int().nonnegative(),
    retained: z.number().int().nonnegative()
  }).strict(),
  fingerprint: z.object({
    algorithm: z.literal("sha256"),
    value: z.string().regex(/^[a-f0-9]{64}$/)
  }).strict()
}).strict().superRefine((snapshot, context) => {
  const compositionTotal = Object.values(snapshot.sourceComposition)
    .reduce((total, count) => total + count, 0);
  if (compositionTotal !== snapshot.records.length) {
    context.addIssue({
      code: "custom",
      path: ["sourceComposition"],
      message: "Source composition must reconcile to retained records."
    });
  }
  if (
    snapshot.reconciliation.input
      - snapshot.reconciliation.exactDuplicatesRemoved
      - snapshot.reconciliation.capRemoved
    !== snapshot.reconciliation.retained
    || snapshot.reconciliation.retained !== snapshot.records.length
  ) {
    context.addIssue({
      code: "custom",
      path: ["reconciliation"],
      message: "Multi-source snapshot reconciliation does not balance."
    });
  }
});

export type MultiSourceSnapshot = z.infer<typeof multiSourceSnapshotSchema>;

function canonicalDocument(document: PublicDocument): string {
  return JSON.stringify({
    externalId: document.externalId,
    sourceType: document.sourceType,
    sourceName: document.sourceName,
    canonicalUrl: document.canonicalUrl,
    title: document.title,
    publicationDate: document.publicationDate,
    normalizedText: document.normalizedText,
    sourceMetadata: document.sourceMetadata ?? null
  });
}

export function multiSourceFingerprint(documents: readonly PublicDocument[]): string {
  return createHash("sha256")
    .update(documents.map(canonicalDocument).sort().join("\n"), "utf8")
    .digest("hex");
}

export function createMultiSourceSnapshot(input: {
  documents: readonly PublicDocument[];
  inputCount: number;
  exactDuplicatesRemoved: number;
  capRemoved: number;
  createdAt?: string;
}): MultiSourceSnapshot {
  const records = publicDocumentSchema.array().parse(input.documents);
  const sourceComposition = Object.fromEntries(
    [...new Set(records.map(({ sourceName }) => sourceName))]
      .sort()
      .map((sourceName) => [
        sourceName,
        records.filter((record) => record.sourceName === sourceName).length
      ])
  );
  return multiSourceSnapshotSchema.parse({
    schemaVersion: MULTI_SOURCE_SNAPSHOT_VERSION,
    sourceMode: "multi_source_snapshot",
    createdAt: input.createdAt ?? new Date().toISOString(),
    records,
    sourceComposition,
    reconciliation: {
      input: input.inputCount,
      exactDuplicatesRemoved: input.exactDuplicatesRemoved,
      capRemoved: input.capRemoved,
      retained: records.length
    },
    fingerprint: {
      algorithm: "sha256",
      value: multiSourceFingerprint(records)
    }
  });
}

export function parseMultiSourceSnapshot(value: unknown): MultiSourceSnapshot {
  const parsed = multiSourceSnapshotSchema.parse(value);
  if (multiSourceFingerprint(parsed.records) !== parsed.fingerprint.value) {
    throw new Error("Multi-source snapshot fingerprint verification failed.");
  }
  return parsed;
}

export async function writeMultiSourceSnapshot(
  path: string,
  snapshot: MultiSourceSnapshot
): Promise<void> {
  await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx"
  });
}

export async function loadMultiSourceSnapshot(path: string): Promise<MultiSourceSnapshot> {
  return parseMultiSourceSnapshot(JSON.parse(await readFile(path, "utf8")) as unknown);
}
