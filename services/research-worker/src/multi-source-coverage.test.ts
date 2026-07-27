import { describe, expect, it } from "vitest";
import {
  createCollectionRunSchema,
  publicDocumentSchema,
  type PublicDocument
} from "@zepto/research-contracts";
import type { ServerEnv } from "@zepto/shared-config";
import {
  CsvImportAdapter,
  CsvImportValidationError,
  parseCsvDocuments
} from "./adapters/csv-import.js";
import { CuratedPublicUrlAdapter } from "./adapters/curated-public-url.js";
import { SourceCollectionError } from "./adapters/errors.js";
import { getAdapter } from "./adapters/index.js";
import { analyzeMultiSourceQuality } from "./multi-source-quality.js";
import {
  createMultiSourceSnapshot,
  parseMultiSourceSnapshot
} from "./multi-source-snapshot.js";

const env = {
  DATABASE_URL: "postgresql://placeholder.invalid/db",
  AI_PROVIDER: "gemini",
  API_PORT: 4000,
  CORS_ORIGIN: "http://localhost:3000",
  WORKER_POLL_INTERVAL_MS: 3000,
  SOURCE_FETCH_USER_AGENT: "ZeptoNextLeapResearch/0.1",
  MAX_SOURCE_BYTES: 1_000_000,
  MAX_NORMALIZED_CHARACTERS: 60_000,
  ANALYSIS_EVIDENCE_MAX_DOCUMENTS_PER_BATCH: 50,
  ANALYSIS_EVIDENCE_MAX_ESTIMATED_PROMPT_TOKENS_PER_BATCH: 32_000,
  ANALYSIS_THEME_MAX_EVIDENCE_PER_BATCH: 100,
  ANALYSIS_THEME_MAX_ESTIMATED_PROMPT_TOKENS_PER_BATCH: 32_000,
  ANALYSIS_THEME_MAX_PROVISIONAL_PER_BATCH: 40,
  ANALYSIS_INSIGHT_MAX_EVIDENCE_PER_BATCH: 100,
  ANALYSIS_INSIGHT_MAX_ESTIMATED_PROMPT_TOKENS_PER_BATCH: 32_000,
  MVP_SOURCE_CONCENTRATION_WARNING_THRESHOLD: 0.6,
  RESEARCH_READINESS_MIN_RELEVANT_RECORDS: 100,
  RESEARCH_READINESS_MIN_SOURCES: 3,
  RESEARCH_READINESS_MAX_SOURCE_CONCENTRATION: 0.75,
  RESEARCH_READINESS_MIN_CATEGORIES: 3,
  RESEARCH_READINESS_MAX_CATEGORY_CONCENTRATION: 0.75,
  RESEARCH_READINESS_MIN_BARRIERS_OR_RISKS: 20,
  RESEARCH_READINESS_MIN_TRIGGERS_OR_TRUST_SIGNALS: 10,
  RESEARCH_READINESS_MIN_ABANDONMENT_OR_WORKAROUNDS: 10
} satisfies ServerEnv;

function csvInput(csvText: string, maxRecords = 20) {
  return createCollectionRunSchema.parse({
    projectId: "11111111-1111-4111-8111-111111111111",
    sourceType: "csv_import",
    csvText,
    policyConfirmed: true,
    maxRecords
  });
}

function document(
  externalId: string,
  sourceName: string,
  text: string,
  rating?: number
): PublicDocument {
  return publicDocumentSchema.parse({
    externalId,
    url: `https://example.com/${externalId}`,
    canonicalUrl: `https://example.com/${externalId}`,
    sourceType: sourceName === "Google Play" ? "google_play" : "csv_import",
    sourceName,
    platform: sourceName,
    title: null,
    publicationDate: "2026-01-01T00:00:00.000Z",
    capturedAt: "2026-02-01T00:00:00.000Z",
    normalizedText: text,
    accessMethod: "manual_import",
    policyNote: "Synthetic policy-compliant fixture.",
    sourceMetadata: {
      ...(rating === undefined ? {} : { rating }),
      sourceUrlAvailable: true
    }
  });
}

describe("multi-source ingestion coverage", () => {
  it("normalizes CSV rows, handles missing optional fields, and produces stable IDs", async () => {
    const csv = [
      "source,external_id,title,text,rating,created_at,source_url,locale,country,version",
      "Reddit,,Delivery discussion,Delivery arrived late but support resolved it,2,2026-01-02,https://reddit.com/r/test/comments/1,en-IN,India,1.2.3",
      "Forum,forum-2,,Public forum text without rating or date,,,https://forum.example.com/thread/2,,,"
    ].join("\n");
    const first = parseCsvDocuments(csv, {
      capturedAt: "2026-02-01T00:00:00.000Z",
      maxRecords: 20
    });
    const second = parseCsvDocuments(csv, {
      capturedAt: "2026-02-01T00:00:00.000Z",
      maxRecords: 20
    });

    expect(first.diagnostics).toEqual([]);
    expect(first.documents).toEqual(second.documents);
    expect(first.documents).toHaveLength(2);
    expect(first.documents[0]).toMatchObject({
      sourceType: "csv_import",
      sourceName: "Reddit",
      publicationDate: "2026-01-02T00:00:00.000Z",
      sourceMetadata: {
        rating: 2,
        locale: "en-IN",
        country: "India",
        appVersion: "1.2.3",
        sourceUrlAvailable: true
      }
    });
    expect(first.documents[1]).toMatchObject({
      sourceName: "Forum",
      publicationDate: null
    });
    expect(first.documents[1]?.sourceMetadata?.rating).toBeUndefined();
    expect(first.documents[0]?.externalId).toBe(
      parseCsvDocuments([
        "source,external_id,title,text,rating,created_at,source_url,locale,country,version",
        "Reddit,,Delivery discussion,Delivery arrived late but support resolved it,2,2026-01-02,https://reddit.com/r/test/comments/1,en-IN,India,1.2.3"
      ].join("\n"), {
        capturedAt: "2026-02-01T00:00:00.000Z",
        maxRecords: 20
      }).documents[0]?.externalId
    );
  });

  it("returns row-level CSV failures and blocks spreadsheet formulas", async () => {
    const csv = [
      "source,text,rating,created_at,source_url",
      "Reddit,,2,2026-01-01,https://reddit.com/test",
      "Forum,Useful text,9,2026-01-01,https://forum.example.com",
      "Forum,Another useful text,3,not-a-date,https://forum.example.com",
      "Forum,=1+1,3,2026-01-01,https://forum.example.com"
    ].join("\n");
    const result = parseCsvDocuments(csv, { maxRecords: 20 });

    expect(result.documents).toEqual([]);
    expect(result.diagnostics.map(({ row, code }) => [row, code])).toEqual([
      [2, "MISSING_TEXT"],
      [3, "INVALID_RATING"],
      [4, "INVALID_DATE"],
      [5, "FORMULA_INJECTION"]
    ]);
    const error = await new CsvImportAdapter()
      .collect(csvInput(csv), { maxRecords: 20 })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CsvImportValidationError);
    expect(JSON.stringify(error)).not.toContain("=1+1");
  });

  it("rejects malformed CSV syntax without exposing its content", () => {
    expect(() => parseCsvDocuments(
      "source,text\nForum,\"unterminated",
      { maxRecords: 20 }
    )).toThrowError(expect.objectContaining({ code: "CSV_MALFORMED" }));
  });

  it("collects only explicitly supplied curated URLs up to the bound", async () => {
    const visited: string[] = [];
    const adapter = new CuratedPublicUrlAdapter(env, async (url) => {
      visited.push(url);
      return [document(url.at(-1)!, "underlying.example", `Readable public discussion for ${url}`)];
    });
    const input = createCollectionRunSchema.parse({
      projectId: "11111111-1111-4111-8111-111111111111",
      sourceType: "curated_public_url",
      urls: [
        "https://forum.example.com/1",
        "https://forum.example.com/2",
        "https://other.example.com/3"
      ],
      sourceLabel: "Curated forums",
      policyConfirmed: true,
      maxRecords: 2
    });
    const output = await adapter.collect(input, { maxRecords: 2 });

    expect(visited).toEqual([
      "https://forum.example.com/1",
      "https://forum.example.com/2"
    ]);
    expect(output).toHaveLength(2);
    expect(output.every(({ sourceName }) => sourceName === "Curated forums")).toBe(true);
  });

  it("deduplicates explicit URLs and preserves canonical URLs without crawling", async () => {
    const visited: string[] = [];
    const adapter = new CuratedPublicUrlAdapter(env, async (url) => {
      visited.push(url);
      return [publicDocumentSchema.parse({
        ...document("curated", "underlying.example", `Readable content from ${url}`),
        url,
        canonicalUrl: url
      })];
    });
    const input = createCollectionRunSchema.parse({
      projectId: "11111111-1111-4111-8111-111111111111",
      sourceType: "curated_public_url",
      urls: [
        "https://forum.example.com/thread#first",
        "https://forum.example.com/thread#second"
      ],
      sourceLabel: "Forum",
      policyConfirmed: true,
      maxRecords: 10
    });
    const output = await adapter.collect(input, { maxRecords: 10 });

    expect(visited).toEqual(["https://forum.example.com/thread"]);
    expect(output[0]?.canonicalUrl).toBe("https://forum.example.com/thread");
  });

  it("rejects unsupported protocols and obvious private URLs before collection", async () => {
    const adapter = new CuratedPublicUrlAdapter(env, async () => {
      throw new Error("Collector must not be reached.");
    });
    const base = {
      projectId: "11111111-1111-4111-8111-111111111111",
      sourceType: "curated_public_url" as const,
      sourceLabel: "Forum",
      policyConfirmed: true as const,
      maxRecords: 10
    };
    const unsupported = createCollectionRunSchema.parse({
      ...base,
      urls: ["ftp://example.com/thread"]
    });
    const privateUrl = createCollectionRunSchema.parse({
      ...base,
      urls: ["http://127.0.0.1/thread"]
    });

    await expect(adapter.collect(unsupported, { maxRecords: 10 }))
      .rejects.toMatchObject({ code: "UNSUPPORTED_PROTOCOL" });
    await expect(adapter.collect(privateUrl, { maxRecords: 10 }))
      .rejects.toMatchObject({ code: "PRIVATE_ADDRESS_BLOCKED" });
  });

  it("surfaces inaccessible curated pages without silently skipping them", async () => {
    const adapter = new CuratedPublicUrlAdapter(env, async () => {
      throw new SourceCollectionError("ROBOTS_DISALLOWED", "Collection is not permitted.");
    });
    const input = createCollectionRunSchema.parse({
      projectId: "11111111-1111-4111-8111-111111111111",
      sourceType: "curated_public_url",
      urls: ["https://forum.example.com/thread"],
      sourceLabel: "Forum",
      policyConfirmed: true,
      maxRecords: 1
    });

    await expect(adapter.collect(input, { maxRecords: 1 }))
      .rejects.toMatchObject({ code: "ROBOTS_DISALLOWED" });
  });

  it("fails conditional sources clearly without exposing configuration", () => {
    expect(() => getAdapter("app_store", env)).toThrowError(
      expect.objectContaining({ code: "APP_STORE_MANUAL_ONLY" })
    );
    expect(() => getAdapter("reddit", env)).toThrowError(
      expect.objectContaining({ code: "REDDIT_NOT_CONFIGURED" })
    );
    expect(() => getAdapter("quora", env)).toThrowError(
      expect.objectContaining({ code: "QUORA_MANUAL_ONLY" })
    );
    for (const source of ["app_store", "reddit", "quora"] as const) {
      expect(JSON.stringify(
        (() => {
          try { getAdapter(source, env); } catch (error) { return error; }
          return null;
        })()
      )).not.toContain(env.DATABASE_URL);
    }
  });

  it("removes exact duplicates deterministically and only reports near duplicates", () => {
    const first = document("a", "Google Play", "Delivery was very late and support did not respond.", 1);
    const exact = document("b", "Reddit", "Delivery was very late and support did not respond.");
    const near = document("c", "Forum", "Delivery was very late and support never responded.");
    const result = analyzeMultiSourceQuality([near, exact, first], {
      sourceCaps: { "Google Play": 10, Reddit: 10, Forum: 10 },
      nearDuplicateThreshold: 0.5
    });

    expect(result.exactDuplicatesRemoved).toBe(1);
    expect(result.crossSourceExactDuplicates).toBe(1);
    expect(result.selectedDocuments).toHaveLength(2);
    expect(result.nearDuplicateCandidates).toHaveLength(1);
    expect(result.selectedDocuments.some(({ externalId }) => externalId === "c")).toBe(true);
    expect(analyzeMultiSourceQuality([first, exact, near], {
      sourceCaps: { "Google Play": 10, Reddit: 10, Forum: 10 },
      nearDuplicateThreshold: 0.5
    }).selectedDocuments).toEqual(result.selectedDocuments);
  });

  it("reports exact duplicates within one source", () => {
    const result = analyzeMultiSourceQuality([
      document("same-1", "Reddit", "The same normalized discussion."),
      document("same-2", "Reddit", "The same normalized discussion.")
    ], { sourceCaps: null });

    expect(result.exactDuplicatesRemoved).toBe(1);
    expect(result.exactDuplicatesBySource).toEqual({ Reddit: 1 });
    expect(result.crossSourceExactDuplicates).toBe(0);
    expect(result.retainedCountBySource).toEqual({ Reddit: 1 });
  });

  it("applies source caps deterministically and reconciles the selected corpus", () => {
    const documents = [
      ...Array.from({ length: 5 }, (_, index) =>
        document(`g-${index}`, "Google Play", `Unique Google review ${index}.`, index % 5 + 1)
      ),
      ...Array.from({ length: 4 }, (_, index) =>
        document(`r-${index}`, "Reddit", `Unique Reddit discussion ${index}.`)
      )
    ];
    const first = analyzeMultiSourceQuality(documents, {
      sourceCaps: { "Google Play": 3, Reddit: 2 }
    });
    const second = analyzeMultiSourceQuality([...documents].reverse(), {
      sourceCaps: { "Google Play": 3, Reddit: 2 }
    });

    expect(first.selectedDocuments).toEqual(second.selectedDocuments);
    expect(first.retainedCountBySource).toEqual({ "Google Play": 3, Reddit: 2 });
    expect(first.capRemovedBySource).toEqual({ "Google Play": 2, Reddit: 2 });
    expect(first.selectedDocuments.length + Object.values(first.capRemovedBySource)
      .reduce((total, count) => total + count, 0)).toBe(documents.length);
    expect(first.sourceDistribution).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceName: "Google Play",
        recordCount: 3,
        ratingDistribution: expect.objectContaining({ unknown: 0 }),
        earliestDate: "2026-01-01T00:00:00.000Z",
        latestDate: "2026-01-01T00:00:00.000Z",
        missingMetadataRate: 0,
        percentageContribution: 60
      }),
      expect.objectContaining({
        sourceName: "Reddit",
        recordCount: 2,
        ratingDistribution: expect.objectContaining({ unknown: 2 }),
        percentageContribution: 40
      })
    ]));
  });

  it("supports an explicit uncapped reporting mode", () => {
    const documents = Array.from({ length: 120 }, (_, index) =>
      document(`uncapped-${index}`, "CSV import", `Unique uncapped record ${index}.`)
    );
    const result = analyzeMultiSourceQuality(documents, {
      sourceCaps: null,
      defaultCap: null
    });

    expect(result.selectedDocuments).toHaveLength(120);
    expect(result.capRemovedBySource).toEqual({ "CSV import": 0 });
  });

  it("creates a reconciled, tamper-evident multi-source snapshot", () => {
    const documents = [
      document("snapshot-1", "Google Play", "First genuine source record.", 5),
      document("snapshot-2", "Reddit", "Second imported source record.")
    ];
    const snapshot = createMultiSourceSnapshot({
      documents,
      inputCount: 3,
      exactDuplicatesRemoved: 1,
      capRemoved: 0,
      createdAt: "2026-07-27T00:00:00.000Z"
    });

    expect(snapshot.sourceComposition).toEqual({ "Google Play": 1, Reddit: 1 });
    expect(JSON.stringify(snapshot)).not.toContain(env.DATABASE_URL);
    expect(parseMultiSourceSnapshot(snapshot)).toEqual(snapshot);
    expect(() => parseMultiSourceSnapshot({
      ...snapshot,
      records: [{ ...snapshot.records[0], normalizedText: "tampered" }, snapshot.records[1]]
    })).toThrow("fingerprint");
  });

  it("rejects unbounded provider response metadata", () => {
    const base = document("bounded", "CSV import", "Bounded metadata record.");
    expect(publicDocumentSchema.safeParse({
      ...base,
      sourceMetadata: {
        providerResponse: { raw: "not allowed" }
      }
    }).success).toBe(false);
  });
});
