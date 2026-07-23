import { afterEach, describe, expect, it, vi } from "vitest";
import { publicDocumentSchema } from "@zepto/research-contracts";
import { getServerEnv } from "@zepto/shared-config";
import { FirecrawlAdapter } from "./firecrawl.js";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }])
}));

const input = {
  projectId: "11111111-1111-4111-8111-111111111111",
  sourceType: "firecrawl" as const,
  urlOrQuery: "https://example.com/research",
  policyConfirmed: true as const,
  maxRecords: 1
};

const env = getServerEnv({
  DATABASE_URL: "postgresql://local/test",
  FIRECRAWL_API_KEY: "test-key",
  FIRECRAWL_TIMEOUT_MS: "45000"
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FirecrawlAdapter", () => {
  it("maps a valid Firecrawl response to a validated PublicDocument", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: {
        markdown: "# Public research\n\nA shopper explains a category decision and its outcome.",
        metadata: {
          title: "Public research"
        }
      }
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const documents = await new FirecrawlAdapter(env).collect(input, { maxRecords: 1 });

    expect(publicDocumentSchema.array().parse(documents)).toEqual(documents);
    expect(documents[0]).toMatchObject({
      externalId: "https://example.com/research",
      sourceType: "firecrawl",
      platform: "example.com",
      title: "Public research",
      publicationDate: null,
      accessMethod: "public_page"
    });
    expect(fetchMock).toHaveBeenCalledWith("https://api.firecrawl.dev/v2/scrape", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ authorization: "Bearer test-key" })
    }));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      url: "https://example.com/research",
      formats: ["markdown"],
      onlyMainContent: true,
      maxAge: 0,
      storeInCache: false,
      timeout: 45_000
    });
  });

  it("rejects an invalid URL before calling Firecrawl", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(new FirecrawlAdapter(env).collect({ ...input, urlOrQuery: "not-a-url" }, { maxRecords: 1 }))
      .rejects.toMatchObject({ code: "INVALID_URL" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [404, "FIRECRAWL_PAGE_INACCESSIBLE"],
    [408, "FIRECRAWL_TIMEOUT"],
    [500, "FIRECRAWL_HTTP_500"]
  ])("reports HTTP %i truthfully", async (status, code) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status }));

    await expect(new FirecrawlAdapter(env).collect(input, { maxRecords: 1 }))
      .rejects.toMatchObject({ code });
  });

  it("reports a request timeout truthfully", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new DOMException("Timed out", "TimeoutError"));

    await expect(new FirecrawlAdapter(env).collect(input, { maxRecords: 1 }))
      .rejects.toMatchObject({ code: "FIRECRAWL_TIMEOUT", retryable: true });
  });

  it("rejects malformed Firecrawl output without fabricating a document", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: { markdown: "" }
    }), { status: 200 }));

    await expect(new FirecrawlAdapter(env).collect(input, { maxRecords: 1 }))
      .rejects.toMatchObject({ code: "FIRECRAWL_INVALID_RESPONSE" });
  });

  it("reports a Firecrawl-declared API failure truthfully", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      success: false,
      code: "UNKNOWN_ERROR",
      error: "The scrape failed."
    }), { status: 200 }));

    await expect(new FirecrawlAdapter(env).collect(input, { maxRecords: 1 }))
      .rejects.toMatchObject({ code: "FIRECRAWL_API_ERROR" });
  });

  it("requires the API key from the environment", async () => {
    const unconfigured = getServerEnv({ DATABASE_URL: "postgresql://local/test", FIRECRAWL_TIMEOUT_MS: "45000" });

    await expect(new FirecrawlAdapter(unconfigured).collect(input, { maxRecords: 1 }))
      .rejects.toMatchObject({ code: "FIRECRAWL_NOT_CONFIGURED" });
  });

  it("requires an environment-configured timeout", async () => {
    const unconfigured = getServerEnv({ DATABASE_URL: "postgresql://local/test", FIRECRAWL_API_KEY: "test-key" });

    await expect(new FirecrawlAdapter(unconfigured).collect(input, { maxRecords: 1 }))
      .rejects.toMatchObject({ code: "FIRECRAWL_NOT_CONFIGURED" });
  });
});
