import { load } from "cheerio";
import type { PublicDocument, SourceAdapter } from "@zepto/research-contracts";
import type { ServerEnv } from "@zepto/shared-config";
import { normalizeText } from "../lib/text.js";
import { SourceCollectionError } from "./errors.js";
import { fetchPermittedPage } from "./fetch-public.js";

const ZEPTO_PACKAGE = "com.zeptoconsumerapp";

export class GooglePlayAdapter implements SourceAdapter {
  readonly type = "google_play" as const;
  constructor(private readonly env: ServerEnv) {}

  async collect(input: Parameters<SourceAdapter["collect"]>[0], context: Parameters<SourceAdapter["collect"]>[1]): Promise<PublicDocument[]> {
    const candidate = input.urlOrQuery?.trim() || ZEPTO_PACKAGE;
    let packageId = candidate;
    if (candidate.startsWith("http")) packageId = new URL(candidate).searchParams.get("id") ?? "";
    if (!/^[A-Za-z0-9._]+$/.test(packageId)) throw new SourceCollectionError("INVALID_PACKAGE_ID", "Enter a valid Google Play URL or package ID.");
    const pageUrl = `https://play.google.com/store/apps/details?id=${encodeURIComponent(packageId)}&hl=en&gl=IN&showAllReviews=true`;
    // Google Play's public app shell is larger than an ordinary research page;
    // only visibly rendered review bodies are retained after parsing.
    const { html } = await fetchPermittedPage(pageUrl, this.env.SOURCE_FETCH_USER_AGENT, Math.max(this.env.MAX_SOURCE_BYTES, 8_000_000), context.signal);
    const $ = load(html);
    const documents: PublicDocument[] = [];
    $("div.RHo1pe").slice(0, context.maxRecords).each((index, element) => {
      const review = normalizeText($(element).find(".h3YV2d").text());
      if (!review) return;
      const visibleDate = normalizeText($(element).find(".bp9Aid").text());
      const parsedDate = Date.parse(visibleDate);
      const externalId = `${packageId}:visible-review:${index}:${visibleDate}`;
      documents.push({
        externalId,
        url: pageUrl,
        canonicalUrl: `https://play.google.com/store/apps/details?id=${encodeURIComponent(packageId)}`,
        sourceType: this.type,
        platform: "Google Play",
        title: `Public Google Play review for ${packageId}`,
        publicationDate: Number.isNaN(parsedDate) ? null : new Date(parsedDate).toISOString(),
        capturedAt: new Date().toISOString(),
        normalizedText: review.slice(0, this.env.MAX_NORMALIZED_CHARACTERS),
        accessMethod: "public_page",
        policyNote: `Only ${documents.length + 1} publicly rendered review bodies were read; author identifiers were not stored. Visible date: ${visibleDate || "not available"}.`
      });
    });
    if (documents.length === 0) throw new SourceCollectionError("SOURCE_STRUCTURE_UNSUPPORTED", "Google Play did not expose review text in the supported public page structure. No reviews were fabricated; use manual URL or text import.");
    return documents;
  }
}
