import { load } from "cheerio";
import type { PublicDocument, SourceAdapter } from "@zepto/research-contracts";
import type { ServerEnv } from "@zepto/shared-config";
import { normalizeText } from "../lib/text.js";
import { SourceCollectionError } from "./errors.js";
import { fetchPermittedPage } from "./fetch-public.js";

export class PublicUrlAdapter implements SourceAdapter {
  readonly type = "public_url" as const;
  constructor(private readonly env: ServerEnv) {}

  async collect(input: Parameters<SourceAdapter["collect"]>[0], context: Parameters<SourceAdapter["collect"]>[1]): Promise<PublicDocument[]> {
    if (!input.urlOrQuery) throw new SourceCollectionError("MISSING_URL", "A public URL is required.");
    const { url, html } = await fetchPermittedPage(input.urlOrQuery, this.env.SOURCE_FETCH_USER_AGENT, this.env.MAX_SOURCE_BYTES, context.signal);
    const $ = load(html);
    $("script,style,noscript,svg,nav,footer,header,form").remove();
    const title = normalizeText($("title").first().text()).slice(0, 500) || null;
    const content = normalizeText($("main,article").first().text() || $("body").text()).slice(0, this.env.MAX_NORMALIZED_CHARACTERS);
    if (content.length < 80) throw new SourceCollectionError("INSUFFICIENT_PUBLIC_CONTEXT", "The public page did not expose enough readable context. Use manual text import if policy permits.");
    return [{
      externalId: url.href,
      url: url.href,
      canonicalUrl: url.href,
      sourceType: this.type,
      sourceName: url.hostname.replace(/^www\./, ""),
      platform: url.hostname.replace(/^www\./, ""),
      title,
      publicationDate: null,
      capturedAt: new Date().toISOString(),
      normalizedText: content,
      accessMethod: "public_page",
      policyNote: "Fetched without authentication after public-address, robots, content-type, and size checks."
    }];
  }
}
