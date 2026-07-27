import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getTinyFishEnv } from "@zepto/shared-config";
import {
  normalizePublicResearchUrl,
  runApprovedResearchFetch,
  runResearchDiscovery
} from "./free-research-discovery.js";
import { TinyFishClient } from "./tinyfish-client.js";
import { parseCsvDocuments } from "./adapters/csv-import.js";

const temporaryDirectories: string[] = [];

async function temporaryFile(name: string, content: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "zepto-research-"));
  temporaryDirectories.push(directory);
  const path = join(directory, name);
  await writeFile(path, content, "utf8");
  return path;
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

const queryPack = [
  "category,source_type,query,research_question,behavior_stage,expected_evidence_type,notes",
  "pet care,Google search,query one,question,consideration,barrier,note",
  "baby care,public forums,query two,question,trial,trigger,note",
  "personal care,articles,query three,question,comparison,trust_signal,note"
].join("\n");

const approvalHeader =
  "query_id,category,url,source_name,approved,approval_note";

describe("optional free research discovery", () => {
  it("keeps TinyFish disabled and optional by default", async () => {
    const path = await temporaryFile("queries.csv", queryPack);
    const env = getTinyFishEnv({});
    const result = await runResearchDiscovery({
      queryPackPath: path,
      env,
      limitQueries: 8
    });
    expect(result).toMatchObject({
      status: "disabled",
      queriesExecuted: 0,
      outputPath: null
    });
  });

  it("does not affect manual CSV intake when no TinyFish key exists", () => {
    expect(getTinyFishEnv({}).TINYFISH_API_KEY).toBeUndefined();
    const parsed = parseCsvDocuments(
      "text,source_url,source,category\n"
        + "\"I bought pet food elsewhere due to quality concerns\",https://example.com/review,Manual research,pet care\n",
      {
        maxRecords: 1,
        capturedAt: "2026-07-27T00:00:00.000Z"
      }
    );
    expect(parsed.documents).toHaveLength(1);
    expect(parsed.diagnostics).toEqual([]);
  });

  it("fails clearly only when an enabled feature lacks a key", async () => {
    const path = await temporaryFile("queries.csv", queryPack);
    const env = getTinyFishEnv({ TINYFISH_SEARCH_ENABLED: "true" });
    await expect(runResearchDiscovery({
      queryPackPath: path,
      env,
      limitQueries: 1
    })).rejects.toThrow("TINYFISH_API_KEY");
  });

  it("caps search requests/results, normalizes duplicates, and rejects private URLs", async () => {
    const path = await temporaryFile("queries.csv", queryPack);
    const search = vi.fn()
      .mockResolvedValueOnce([
        {
          title: "One",
          snippet: "A",
          url: "https://example.com/page?utm_source=test&a=1",
          sourceName: "Example"
        },
        {
          title: "Duplicate",
          snippet: "B",
          url: "https://EXAMPLE.com/page?a=1#fragment",
          sourceName: "Example"
        },
        {
          title: "Private",
          snippet: "C",
          url: "http://127.0.0.1/private",
          sourceName: null
        },
        {
          title: "Beyond configured result cap",
          snippet: "Ignored",
          url: "https://ignored.example/result",
          sourceName: null
        }
      ])
      .mockResolvedValueOnce([
        {
          title: "Two",
          snippet: "D",
          url: "https://example.org/two",
          sourceName: null
        },
        {
          title: "Over result cap",
          snippet: "E",
          url: "https://example.org/three",
          sourceName: null
        }
      ]);
    const result = await runResearchDiscovery({
      queryPackPath: path,
      env: getTinyFishEnv({
        TINYFISH_API_KEY: "not-a-real-key",
        TINYFISH_SEARCH_ENABLED: "true",
        TINYFISH_SEARCH_MAX_RESULTS: "3",
        TINYFISH_MAX_SEARCH_REQUESTS_PER_RUN: "2"
      }),
      client: { search },
      limitQueries: 3
    });
    expect(search).toHaveBeenCalledTimes(2);
    expect(search).toHaveBeenNthCalledWith(1, "query one", 3);
    expect(result.candidates).toHaveLength(3);
    expect(result.duplicatesRemoved).toBe(1);
    expect(result.invalidUrlsRejected).toBe(1);
    expect(result.outputPath).toBeNull();
  });

  it("normalizes tracking variants and blocks local/private addresses", () => {
    expect(normalizePublicResearchUrl(
      "https://Example.com/path?utm_campaign=x&b=2&a=1#part"
    )).toBe("https://example.com/path?a=1&b=2");
    expect(() => normalizePublicResearchUrl("http://localhost/a"))
      .toThrow("PRIVATE_OR_LOCAL_URL");
    expect(() => normalizePublicResearchUrl("http://192.168.1.2/a"))
      .toThrow("PRIVATE_OR_LOCAL_URL");
  });

  it("Search calls only the Search endpoint and never Fetch", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      query: "x",
      results: []
    }), { status: 200 }));
    const client = new TinyFishClient({
      apiKey: "not-a-real-key",
      timeoutMs: 1_000,
      maxRetries: 0,
      fetchImpl
    });
    await client.search("x", 5);
    const requestUrl = String(fetchImpl.mock.calls[0]?.[0]);
    expect(requestUrl.startsWith("https://api.search.tinyfish.ai/")).toBe(true);
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ method: "GET" });
  });

  it("never exposes the API key in sanitized errors", async () => {
    const key = "not-a-real-secret";
    const client = new TinyFishClient({
      apiKey: key,
      timeoutMs: 1_000,
      maxRetries: 0,
      fetchImpl: vi.fn().mockResolvedValue(
        new Response("provider body", { status: 500 })
      )
    });
    let failure = "";
    try {
      await client.search("x", 1);
    } catch (error) {
      failure = JSON.stringify(error, Object.getOwnPropertyNames(error));
    }
    expect(failure).not.toContain(key);
    expect(failure).not.toContain("provider body");
  });

  it("performs at most one configured retry", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        query: "x",
        results: []
      }), { status: 200 }));
    const client = new TinyFishClient({
      apiKey: "not-a-real-key",
      timeoutMs: 1_000,
      maxRetries: 1,
      fetchImpl
    });
    await expect(client.search("x", 1)).resolves.toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("fetches only exact true approvals, applies the cap, and admits documents through intake", async () => {
    const inputPath = await temporaryFile("approval.csv", [
      approvalHeader,
      "q1,pet care,https://one.example/review,Forum,true,approved public page",
      "q2,baby care,https://two.example/review,Article,yes,not explicit true",
      "q3,personal care,https://three.example/review,Blog,true,approved public page"
    ].join("\n"));
    const fetchUrls = vi.fn().mockImplementation(async (urls: string[]) =>
      urls.map((url) => ({
        requestedUrl: url,
        finalUrl: url,
        title: "Category decision",
        text: "I did not trust the pet care quality and bought elsewhere."
      }))
    );
    const result = await runApprovedResearchFetch({
      inputPath,
      env: getTinyFishEnv({
        TINYFISH_API_KEY: "not-a-real-key",
        TINYFISH_FETCH_ENABLED: "true",
        TINYFISH_FETCH_MAX_URLS_PER_RUN: "1"
      }),
      client: { fetchUrls },
      capturedAt: "2026-07-27T00:00:00.000Z"
    });
    expect(fetchUrls).toHaveBeenCalledWith(["https://one.example/review"]);
    expect(result).toMatchObject({
      status: "completed",
      approvedRows: 2,
      urlsRequested: 1,
      outputPath: null
    });
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]?.sourceMetadata?.provenanceLevel)
      .toBe("PARTIAL");
    expect(result.progress.directlyRelevantCount).toBe(1);
  });

  it("does not recursively follow links in TinyFish Fetch requests", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [{
        url: "https://example.com/one",
        final_url: "https://example.com/one",
        title: "One",
        text: "Useful public context"
      }],
      errors: []
    }), { status: 200 }));
    const client = new TinyFishClient({
      apiKey: "not-a-real-key",
      timeoutMs: 30_000,
      maxRetries: 0,
      fetchImpl
    });
    await client.fetchUrls(["https://example.com/one"]);
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      urls: ["https://example.com/one"],
      format: "markdown",
      links: false,
      image_links: false
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("blocks disallowed automatic source access and never sends it to Fetch", async () => {
    const inputPath = await temporaryFile("approval.csv", [
      approvalHeader,
      "q1,pet care,https://www.reddit.com/r/test/comments/one,Reddit,true,approved candidate",
      "q2,baby care,https://apps.apple.com/in/app/example/id123,Apple,true,approved candidate"
    ].join("\n"));
    const fetchUrls = vi.fn();
    const result = await runApprovedResearchFetch({
      inputPath,
      env: getTinyFishEnv({
        TINYFISH_API_KEY: "not-a-real-key",
        TINYFISH_FETCH_ENABLED: "true"
      }),
      client: { fetchUrls }
    });
    expect(fetchUrls).not.toHaveBeenCalled();
    expect(result.rejected.map(({ code }) => code)).toEqual([
      "REDDIT_AUTOMATED_FETCH_NOT_APPROVED",
      "APP_STORE_MANUAL_ONLY"
    ]);
  });

  it("contains no Agent or Browser configuration or request fields", async () => {
    const root = join(import.meta.dirname, "../../..");
    const envExample = await readFile(join(root, ".env.example"), "utf8");
    const clientSource = await readFile(
      join(import.meta.dirname, "tinyfish-client.ts"),
      "utf8"
    );
    const gitignore = await readFile(join(root, ".gitignore"), "utf8");
    expect(envExample).not.toMatch(/TINYFISH_(AGENT|BROWSER)/u);
    expect(clientSource).not.toMatch(/\b(agent|browser)\b/iu);
    expect(gitignore).toContain("research/discovery-output/");
    expect(gitignore).toContain("research/intake-output/");
  });
});
