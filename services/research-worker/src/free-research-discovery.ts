import { createHash } from "node:crypto";
import { dirname, relative, resolve } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import {
  publicDocumentSchema,
  type PublicDocument
} from "@zepto/research-contracts";
import {
  findRepositoryRoot,
  type TinyFishEnv
} from "@zepto/shared-config";
import { createCollectionProgressReport } from "./category-evidence-intake.js";
import { normalizeText } from "./lib/text.js";
import { withProvenanceLevel } from "./research-provenance.js";
import type {
  TinyFishClient,
  TinyFishFetchResult
} from "./tinyfish-client.js";

type QueryRow = {
  category: string;
  source_type: string;
  query: string;
  research_question: string;
  behavior_stage: string;
  expected_evidence_type: string;
  notes: string;
};

type ApprovalRow = {
  query_id: string;
  category: string;
  url: string;
  source_name: string;
  approved: string;
  approval_note: string;
};

export type DiscoveryCandidate = {
  queryId: string;
  category: string;
  query: string;
  sourceType: string;
  url: string;
  title: string;
  snippet: string;
  sourceName: string | null;
};

export type DiscoveryResult = {
  status: "disabled" | "completed";
  queriesAvailable: number;
  queriesExecuted: number;
  candidates: DiscoveryCandidate[];
  duplicatesRemoved: number;
  invalidUrlsRejected: number;
  outputPath: string | null;
};

export type ApprovedFetchResult = {
  status: "disabled" | "completed";
  approvedRows: number;
  urlsRequested: number;
  documents: PublicDocument[];
  rejected: Array<{ queryId: string; code: string }>;
  progress: ReturnType<typeof createCollectionProgressReport>;
  outputPath: string | null;
};

type SearchClient = Pick<TinyFishClient, "search">;
type FetchClient = Pick<TinyFishClient, "fetchUrls">;

const privateIpv4 = [
  /^127\./u,
  /^10\./u,
  /^192\.168\./u,
  /^169\.254\./u,
  /^172\.(1[6-9]|2\d|3[01])\./u
];

export function normalizePublicResearchUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("INVALID_URL");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("INVALID_URL");
  }
  const hostname = url.hostname.toLocaleLowerCase("en");
  if (
    hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
    || hostname === "0.0.0.0"
    || hostname === "::1"
    || hostname === "[::1]"
    || (hostname.includes(":") && (
      hostname.startsWith("fc")
      || hostname.startsWith("fd")
      || hostname.startsWith("fe80:")
    ))
    || privateIpv4.some((pattern) => pattern.test(hostname))
  ) {
    throw new Error("PRIVATE_OR_LOCAL_URL");
  }
  url.hostname = hostname;
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (
      key.toLocaleLowerCase("en").startsWith("utm_")
      || ["fbclid", "gclid"].includes(key.toLocaleLowerCase("en"))
    ) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  return url.href;
}

function queryId(row: QueryRow, index: number): string {
  const hash = createHash("sha256")
    .update(`${row.category}\0${row.query}`, "utf8")
    .digest("hex")
    .slice(0, 10);
  return `query_${String(index + 1).padStart(2, "0")}_${hash}`;
}

function csvCell(value: string): string {
  return /[",\r\n]/u.test(value)
    ? `"${value.replaceAll("\"", "\"\"")}"`
    : value;
}

async function writeCsv(
  path: string,
  header: readonly string[],
  rows: readonly string[][]
): Promise<void> {
  await assertPermittedOutput(path, "research/discovery-output");
  await mkdir(dirname(path), { recursive: true });
  const content = [
    header.map(csvCell).join(","),
    ...rows.map((row) => row.map(csvCell).join(","))
  ].join("\n");
  await writeFile(path, `${content}\n`, { encoding: "utf8", flag: "wx" });
}

async function assertPermittedOutput(
  path: string,
  permittedDirectory: string
): Promise<void> {
  const root = findRepositoryRoot();
  if (!root) throw new Error("Repository root could not be resolved.");
  const relativePath = relative(root, resolve(path)).replaceAll("\\", "/");
  if (
    relativePath === ""
    || relativePath === ".."
    || relativePath.startsWith("../")
    || !relativePath.startsWith(`${permittedDirectory}/`)
  ) {
    throw new Error(
      `Output must be inside the Git-ignored ${permittedDirectory}/ directory.`
    );
  }
}

export async function runResearchDiscovery(options: {
  queryPackPath: string;
  env: TinyFishEnv;
  client?: SearchClient;
  limitQueries: number;
  outputPath?: string;
}): Promise<DiscoveryResult> {
  const rows = parse(await readFile(options.queryPackPath, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true
  }) as QueryRow[];
  if (!options.env.TINYFISH_SEARCH_ENABLED) {
    return {
      status: "disabled",
      queriesAvailable: rows.length,
      queriesExecuted: 0,
      candidates: [],
      duplicatesRemoved: 0,
      invalidUrlsRejected: 0,
      outputPath: null
    };
  }
  if (!options.env.TINYFISH_API_KEY || !options.client) {
    throw new Error(
      "TinyFish Search is enabled but TINYFISH_API_KEY or its client is unavailable."
    );
  }
  const requestLimit = Math.min(
    options.limitQueries,
    options.env.TINYFISH_MAX_SEARCH_REQUESTS_PER_RUN,
    rows.length
  );
  const candidates: DiscoveryCandidate[] = [];
  const seen = new Set<string>();
  let duplicatesRemoved = 0;
  let invalidUrlsRejected = 0;
  for (const [index, row] of rows.slice(0, requestLimit).entries()) {
    const results = await options.client.search(
      row.query,
      options.env.TINYFISH_SEARCH_MAX_RESULTS
    );
    for (const result of results.slice(
      0,
      options.env.TINYFISH_SEARCH_MAX_RESULTS
    )) {
      let url: string;
      try {
        url = normalizePublicResearchUrl(result.url);
      } catch {
        invalidUrlsRejected += 1;
        continue;
      }
      if (seen.has(url)) {
        duplicatesRemoved += 1;
        continue;
      }
      seen.add(url);
      candidates.push({
        queryId: queryId(row, index),
        category: row.category,
        query: row.query,
        sourceType: row.source_type,
        url,
        title: result.title,
        snippet: result.snippet,
        sourceName: result.sourceName
      });
    }
  }
  if (options.outputPath) {
    await writeCsv(
      options.outputPath,
      [
        "query_id",
        "category",
        "query",
        "source_type",
        "url",
        "title",
        "snippet",
        "source_name"
      ],
      candidates.map((candidate) => [
        candidate.queryId,
        candidate.category,
        candidate.query,
        candidate.sourceType,
        candidate.url,
        candidate.title,
        candidate.snippet,
        candidate.sourceName ?? ""
      ])
    );
  }
  return {
    status: "completed",
    queriesAvailable: rows.length,
    queriesExecuted: requestLimit,
    candidates,
    duplicatesRemoved,
    invalidUrlsRejected,
    outputPath: options.outputPath ?? null
  };
}

function autoFetchRestriction(url: string): string | null {
  const hostname = new URL(url).hostname.toLocaleLowerCase("en");
  if (hostname === "reddit.com" || hostname.endsWith(".reddit.com")) {
    return "REDDIT_AUTOMATED_FETCH_NOT_APPROVED";
  }
  if (hostname === "apps.apple.com") {
    return "APP_STORE_MANUAL_ONLY";
  }
  return null;
}

function fetchedDocument(
  result: TinyFishFetchResult,
  approval: ApprovalRow,
  capturedAt: string
): PublicDocument {
  const canonicalUrl = normalizePublicResearchUrl(result.finalUrl);
  const text = normalizeText(result.text).slice(0, 20_000);
  const sourceName = normalizeText(approval.source_name).slice(0, 120)
    || new URL(canonicalUrl).hostname.replace(/^www\./u, "");
  return withProvenanceLevel(publicDocumentSchema.parse({
    externalId: `tinyfish_${createHash("sha256")
      .update(canonicalUrl, "utf8")
      .digest("hex")}`,
    url: canonicalUrl,
    canonicalUrl,
    sourceType: "curated_public_url",
    sourceName,
    platform: sourceName,
    title: result.title ? normalizeText(result.title).slice(0, 500) : null,
    publicationDate: null,
    capturedAt,
    normalizedText: text,
    accessMethod: "public_page",
    policyNote:
      "Fetched from one explicitly human-approved public URL through TinyFish Fetch; no links were followed.",
    sourceMetadata: {
      category: normalizeText(approval.category).slice(0, 120),
      sourceLabel: sourceName,
      sourceUrlAvailable: true,
      provenanceNote:
        "Explicit URL approval retained in the local approval CSV; publication date was not supplied by the provider.",
      provenanceMethod: "automated_collection"
    }
  }));
}

export async function runApprovedResearchFetch(options: {
  inputPath: string;
  env: TinyFishEnv;
  client?: FetchClient;
  outputPath?: string;
  capturedAt?: string;
}): Promise<ApprovedFetchResult> {
  const rows = parse(await readFile(options.inputPath, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true
  }) as ApprovalRow[];
  const approved = rows.filter((row) => row.approved === "true");
  if (!options.env.TINYFISH_FETCH_ENABLED) {
    return {
      status: "disabled",
      approvedRows: approved.length,
      urlsRequested: 0,
      documents: [],
      rejected: [],
      progress: createCollectionProgressReport({
        documents: [],
        diagnostics: []
      }),
      outputPath: null
    };
  }
  if (!options.env.TINYFISH_API_KEY || !options.client) {
    throw new Error(
      "TinyFish Fetch is enabled but TINYFISH_API_KEY or its client is unavailable."
    );
  }
  const permitted: Array<{ row: ApprovalRow; url: string }> = [];
  const rejected: Array<{ queryId: string; code: string }> = [];
  for (const row of approved) {
    let url: string;
    try {
      url = normalizePublicResearchUrl(row.url);
    } catch (error) {
      rejected.push({
        queryId: row.query_id,
        code: error instanceof Error ? error.message : "INVALID_URL"
      });
      continue;
    }
    const restriction = autoFetchRestriction(url);
    if (restriction) {
      rejected.push({ queryId: row.query_id, code: restriction });
      continue;
    }
    permitted.push({ row, url });
  }
  const selected = permitted.slice(
    0,
    options.env.TINYFISH_FETCH_MAX_URLS_PER_RUN
  );
  const fetched = selected.length
    ? await options.client.fetchUrls(selected.map(({ url }) => url))
    : [];
  const approvals = new Map(
    selected.map(({ row, url }) => [url, row] as const)
  );
  const documents: PublicDocument[] = [];
  const capturedAt = options.capturedAt ?? new Date().toISOString();
  for (const result of fetched) {
    let requestedUrl: string;
    try {
      requestedUrl = normalizePublicResearchUrl(result.requestedUrl);
    } catch {
      rejected.push({ queryId: "unknown", code: "MALFORMED_FETCH_RESULT" });
      continue;
    }
    const approval = approvals.get(requestedUrl);
    if (!approval) {
      rejected.push({ queryId: "unknown", code: "UNAPPROVED_FETCH_RESULT" });
      continue;
    }
    try {
      documents.push(fetchedDocument(result, approval, capturedAt));
    } catch {
      rejected.push({
        queryId: approval.query_id,
        code: "INVALID_FETCHED_DOCUMENT"
      });
    }
  }
  const progress = createCollectionProgressReport({
    documents,
    diagnostics: rejected.map((item) => ({
      file: options.inputPath,
      row: null,
      code: item.code,
      field: "url",
      message: "The candidate was not admitted to research intake."
    }))
  });
  if (options.outputPath) {
    await assertPermittedOutput(options.outputPath, "research/intake-output");
    await mkdir(dirname(options.outputPath), { recursive: true });
    await writeFile(
      options.outputPath,
      `${JSON.stringify({
        schemaVersion: "tinyfish-approved-fetch-v1",
        createdAt: capturedAt,
        documents,
        progress
      }, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" }
    );
  }
  return {
    status: "completed",
    approvedRows: approved.length,
    urlsRequested: selected.length,
    documents,
    rejected,
    progress,
    outputPath: options.outputPath ?? null
  };
}
