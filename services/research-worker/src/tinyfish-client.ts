import { z } from "zod";

const SEARCH_ENDPOINT = "https://api.search.tinyfish.ai/";
const FETCH_ENDPOINT = "https://api.fetch.tinyfish.ai/";
const MAX_RESPONSE_BYTES = 2_000_000;

const searchResponseSchema = z.object({
  results: z.array(z.object({
    title: z.string().default(""),
    snippet: z.string().default(""),
    url: z.string().url(),
    site_name: z.string().optional()
  }))
}).passthrough();

const fetchResponseSchema = z.object({
  results: z.array(z.object({
    url: z.string().url(),
    final_url: z.string().url().optional(),
    title: z.string().optional(),
    text: z.string().min(1)
  }).passthrough()).default([]),
  errors: z.array(z.unknown()).default([])
}).passthrough();

export type TinyFishSearchResult = {
  title: string;
  snippet: string;
  url: string;
  sourceName: string | null;
};

export type TinyFishFetchResult = {
  requestedUrl: string;
  finalUrl: string;
  title: string | null;
  text: string;
};

export class TinyFishClientError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "TinyFishClientError";
  }
}

export type TinyFishClientOptions = {
  apiKey: string;
  timeoutMs: number;
  maxRetries: number;
  fetchImpl?: typeof fetch;
};

function endpoint(url: string): URL {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new TinyFishClientError(
      "INSECURE_PROVIDER_ENDPOINT",
      "TinyFish provider endpoints must use HTTPS."
    );
  }
  return parsed;
}

function isRetryable(error: unknown): boolean {
  return error instanceof TinyFishClientError
    && ["PROVIDER_TIMEOUT", "PROVIDER_UNAVAILABLE"].includes(error.code);
}

export class TinyFishClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: TinyFishClientOptions) {
    if (!options.apiKey) {
      throw new TinyFishClientError(
        "MISSING_TINYFISH_API_KEY",
        "TinyFish is enabled but TINYFISH_API_KEY is not configured."
      );
    }
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request(url: URL, init: RequestInit): Promise<unknown> {
    for (let attempt = 0; attempt <= this.options.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.options.timeoutMs
      );
      try {
        const response = await this.fetchImpl(url, {
          ...init,
          headers: {
            ...init.headers,
            "X-API-Key": this.options.apiKey
          },
          signal: controller.signal
        });
        if (!response.ok) {
          throw new TinyFishClientError(
            response.status === 429 || response.status >= 500
              ? "PROVIDER_UNAVAILABLE"
              : "PROVIDER_REJECTED_REQUEST",
            `TinyFish request failed with HTTP ${response.status}.`
          );
        }
        const body = await response.text();
        if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) {
          throw new TinyFishClientError(
            "PROVIDER_RESPONSE_TOO_LARGE",
            "TinyFish response exceeded the permitted size."
          );
        }
        try {
          return JSON.parse(body);
        } catch {
          throw new TinyFishClientError(
            "MALFORMED_PROVIDER_RESPONSE",
            "TinyFish returned malformed JSON."
          );
        }
      } catch (error) {
        const sanitized =
          error instanceof TinyFishClientError
            ? error
            : new TinyFishClientError(
                error instanceof Error && error.name === "AbortError"
                  ? "PROVIDER_TIMEOUT"
                  : "PROVIDER_UNAVAILABLE",
                error instanceof Error && error.name === "AbortError"
                  ? "TinyFish request timed out."
                  : "TinyFish request failed."
              );
        if (attempt < this.options.maxRetries && isRetryable(sanitized)) {
          continue;
        }
        throw sanitized;
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new TinyFishClientError(
      "PROVIDER_UNAVAILABLE",
      "TinyFish request failed."
    );
  }

  async search(
    query: string,
    maxResults: number
  ): Promise<TinyFishSearchResult[]> {
    const url = endpoint(SEARCH_ENDPOINT);
    url.searchParams.set("query", query);
    const parsed = searchResponseSchema.safeParse(
      await this.request(url, { method: "GET" })
    );
    if (!parsed.success) {
      throw new TinyFishClientError(
        "MALFORMED_PROVIDER_RESPONSE",
        "TinyFish Search returned an invalid response shape."
      );
    }
    const response = parsed.data;
    return response.results.slice(0, maxResults).map((result) => ({
      title: result.title,
      snippet: result.snippet,
      url: result.url,
      sourceName: result.site_name ?? null
    }));
  }

  async fetchUrls(urls: readonly string[]): Promise<TinyFishFetchResult[]> {
    const parsed = fetchResponseSchema.safeParse(
      await this.request(endpoint(FETCH_ENDPOINT), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls,
          format: "markdown",
          links: false,
          image_links: false,
          per_url_timeout_ms: this.options.timeoutMs
        })
      })
    );
    if (!parsed.success) {
      throw new TinyFishClientError(
        "MALFORMED_PROVIDER_RESPONSE",
        "TinyFish Fetch returned an invalid response shape."
      );
    }
    const response = parsed.data;
    if (response.errors.length > 0) {
      throw new TinyFishClientError(
        "PROVIDER_FETCH_ERROR",
        "TinyFish could not fetch one or more approved URLs."
      );
    }
    return response.results.map((result) => ({
      requestedUrl: result.url,
      finalUrl: result.final_url ?? result.url,
      title: result.title ?? null,
      text: result.text
    }));
  }
}
