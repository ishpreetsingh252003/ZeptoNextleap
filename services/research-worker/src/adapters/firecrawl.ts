import { publicDocumentSchema, type PublicDocument, type SourceAdapter } from "@zepto/research-contracts";
import type { ServerEnv } from "@zepto/shared-config";
import { z } from "zod";
import { normalizeText } from "../lib/text.js";
import { SourceCollectionError } from "./errors.js";
import { assertSafePublicUrl } from "./fetch-public.js";

const FIRECRAWL_SCRAPE_URL = "https://api.firecrawl.dev/v2/scrape";
const PUBLIC_DOCUMENT_MAX_CHARACTERS = 20_000;

const firecrawlResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    markdown: z.string().min(1),
    metadata: z.object({
      title: z.string().nullish()
    }).passthrough().optional()
  })
});

const firecrawlErrorResponseSchema = z.object({
  success: z.literal(false),
  code: z.string().optional(),
  error: z.string().optional()
});

export class FirecrawlAdapter implements SourceAdapter {
  readonly type = "firecrawl" as const;

  constructor(private readonly env: ServerEnv) {}

  async collect(input: Parameters<SourceAdapter["collect"]>[0], context: Parameters<SourceAdapter["collect"]>[1]): Promise<PublicDocument[]> {
    if (!this.env.FIRECRAWL_API_KEY) {
      throw new SourceCollectionError("FIRECRAWL_NOT_CONFIGURED", "Firecrawl is unavailable until FIRECRAWL_API_KEY is configured.");
    }
    if (!this.env.FIRECRAWL_TIMEOUT_MS) {
      throw new SourceCollectionError("FIRECRAWL_NOT_CONFIGURED", "Firecrawl is unavailable until FIRECRAWL_TIMEOUT_MS is configured.");
    }
    if (!input.urlOrQuery) throw new SourceCollectionError("MISSING_URL", "A public URL is required.");

    const url = await assertSafePublicUrl(input.urlOrQuery);
    const timeoutSignal = AbortSignal.timeout(this.env.FIRECRAWL_TIMEOUT_MS);
    const signal = context.signal ? AbortSignal.any([context.signal, timeoutSignal]) : timeoutSignal;

    let response: Response;
    try {
      response = await fetch(FIRECRAWL_SCRAPE_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.env.FIRECRAWL_API_KEY}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          url: url.href,
          formats: ["markdown"],
          onlyMainContent: true,
          maxAge: 0,
          storeInCache: false,
          timeout: this.env.FIRECRAWL_TIMEOUT_MS
        }),
        signal
      });
    } catch (error) {
      if (context.signal?.aborted) {
        throw new SourceCollectionError("FIRECRAWL_REQUEST_ABORTED", "The Firecrawl request was cancelled.");
      }
      if (error instanceof DOMException && ["AbortError", "TimeoutError"].includes(error.name)) {
        throw new SourceCollectionError("FIRECRAWL_TIMEOUT", "The Firecrawl request timed out before a document was returned.", true);
      }
      throw new SourceCollectionError("FIRECRAWL_UNAVAILABLE", "The Firecrawl API could not be reached.", true);
    }

    if (!response.ok) {
      if (response.status === 408) {
        throw new SourceCollectionError("FIRECRAWL_TIMEOUT", "Firecrawl timed out while accessing the public page.", true);
      }
      if (response.status === 404) {
        throw new SourceCollectionError("FIRECRAWL_PAGE_INACCESSIBLE", "Firecrawl could not access the requested public page.");
      }
      throw new SourceCollectionError(
        `FIRECRAWL_HTTP_${response.status}`,
        `Firecrawl returned HTTP ${response.status}.`,
        response.status === 429 || response.status >= 500
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new SourceCollectionError("FIRECRAWL_INVALID_RESPONSE", "Firecrawl returned a malformed response.");
    }

    if (firecrawlErrorResponseSchema.safeParse(payload).success) {
      throw new SourceCollectionError("FIRECRAWL_API_ERROR", "Firecrawl reported that the scrape did not succeed.");
    }
    const parsed = firecrawlResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new SourceCollectionError("FIRECRAWL_INVALID_RESPONSE", "Firecrawl returned a malformed response.");
    }

    const text = normalizeText(parsed.data.data.markdown).slice(
      0,
      Math.min(this.env.MAX_NORMALIZED_CHARACTERS, PUBLIC_DOCUMENT_MAX_CHARACTERS)
    );
    if (!text) throw new SourceCollectionError("FIRECRAWL_INVALID_RESPONSE", "Firecrawl returned no usable page content.");
    const metadata = parsed.data.data.metadata;
    const document = publicDocumentSchema.parse({
      externalId: url.href,
      url: url.href,
      canonicalUrl: url.href,
      sourceType: this.type,
      sourceName: url.hostname.replace(/^www\./, ""),
      platform: url.hostname.replace(/^www\./, ""),
      title: normalizeText(metadata?.title ?? "").slice(0, 500) || null,
      publicationDate: null,
      capturedAt: new Date().toISOString(),
      normalizedText: text,
      accessMethod: "public_page",
      policyNote: "Fetched from a caller-confirmed public URL through the Firecrawl scrape API; no authenticated page context was supplied."
    });

    return [document];
  }
}
