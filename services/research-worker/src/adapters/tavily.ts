import type { PublicDocument, SourceAdapter } from "@zepto/research-contracts";
import type { ServerEnv } from "@zepto/shared-config";
import { SourceCollectionError } from "./errors.js";
import { PublicUrlAdapter } from "./public-url.js";

export class TavilyAdapter implements SourceAdapter {
  readonly type = "tavily_query" as const;
  constructor(private readonly env: ServerEnv) {}
  async collect(input: Parameters<SourceAdapter["collect"]>[0], context: Parameters<SourceAdapter["collect"]>[1]): Promise<PublicDocument[]> {
    if (!this.env.TAVILY_API_KEY) throw new SourceCollectionError("TAVILY_NOT_CONFIGURED", "Tavily discovery is unavailable until TAVILY_API_KEY is configured.");
    if (!input.urlOrQuery) throw new SourceCollectionError("MISSING_QUERY", "A Tavily query is required.");
    const response = await fetch("https://api.tavily.com/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ api_key: this.env.TAVILY_API_KEY, query: input.urlOrQuery, max_results: context.maxRecords, search_depth: "basic" }), signal: context.signal ?? null });
    if (!response.ok) throw new SourceCollectionError(`TAVILY_HTTP_${response.status}`, `Tavily returned HTTP ${response.status}.`, response.status >= 500 || response.status === 429);
    const payload = await response.json() as { results?: Array<{ url?: string }> };
    const urls = (payload.results ?? []).map((result) => result.url).filter((url): url is string => Boolean(url)).slice(0, context.maxRecords);
    const adapter = new PublicUrlAdapter(this.env);
    const settled = await Promise.allSettled(urls.map((url) => adapter.collect({ ...input, sourceType: "public_url", urlOrQuery: url }, { ...context, maxRecords: 1 })));
    const documents = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    if (documents.length === 0) throw new SourceCollectionError("NO_VERIFIABLE_TAVILY_RESULTS", "Discovery returned no underlying public pages that passed policy and context checks.");
    return documents.map((document) => ({ ...document, sourceType: "tavily_query" as const, sourceName: `Tavily: ${document.sourceName}`, accessMethod: "public_search_api" as const, policyNote: `${document.policyNote} Discovered through Tavily; the underlying public page was fetched and verified.` }));
  }
}
