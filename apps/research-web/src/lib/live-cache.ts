import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { runtimeRoot } from "./data-paths";

export type LiveReviewDoc = {
  externalId: string;
  canonicalUrl: string;
  normalizedText: string;
  publicationDate: string | null;
  capturedAt: string;
  sourceMetadata?: { rating?: number };
};

export type LiveCollectionRequest = {
  dateFrom: string | null;
  dateTo: string | null;
};

export type LiveCollectionCache = {
  fetchedAt: string;
  request: LiveCollectionRequest;
  docs: LiveReviewDoc[];
};

const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_FILE = join("apps", "research-web", "data", "cache", "google-play-live.json");

function cachePath(): string {
  return join(runtimeRoot(), CACHE_FILE);
}

export function readLiveCollectionCache(request: LiveCollectionRequest): LiveCollectionCache | null {
  const file = cachePath();
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as LiveCollectionCache;
    if (!parsed || !Array.isArray(parsed.docs) || !parsed.fetchedAt) return null;
    if (Date.now() - Date.parse(parsed.fetchedAt) > CACHE_TTL_MS) return null;
    if (parsed.request.dateFrom !== request.dateFrom || parsed.request.dateTo !== request.dateTo) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeLiveCollectionCache(request: LiveCollectionRequest, docs: LiveReviewDoc[]): void {
  const file = cachePath();
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ fetchedAt: new Date().toISOString(), request, docs }, null, 2), "utf8");
  } catch {
    // best-effort: a missing cache simply triggers a fresh scrape on the next run
  }
}
