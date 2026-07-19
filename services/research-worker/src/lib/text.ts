import { createHash } from "node:crypto";

export function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function contentHash(value: string): string {
  return createHash("sha256").update(normalizeText(value).toLocaleLowerCase("en")).digest("hex");
}

export function dedupeDocuments<T extends { normalizedText: string }>(documents: T[]): { unique: T[]; duplicateCount: number } {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const document of documents) {
    const hash = contentHash(document.normalizedText);
    if (seen.has(hash)) continue;
    seen.add(hash);
    unique.push(document);
  }
  return { unique, duplicateCount: documents.length - unique.length };
}
