import gplay from "google-play-scraper";
import { publicDocumentSchema, type PublicDocument, type SourceAdapter } from "@zepto/research-contracts";
import type { ServerEnv } from "@zepto/shared-config";
import { z } from "zod";
import { normalizeText } from "../lib/text.js";
import { SourceCollectionError } from "./errors.js";

const PACKAGE_ID = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;
const NEWEST_REVIEWS = (gplay.sort as unknown as { NEWEST: number }).NEWEST;

const reviewsResultSchema = z.object({
  data: z.array(z.object({
    id: z.string().min(1),
    userName: z.string().nullish(),
    date: z.string().datetime().nullish(),
    score: z.number().int().min(1).max(5),
    title: z.string().nullish(),
    text: z.string().min(1)
  })),
  nextPaginationToken: z.string().min(1).nullish()
});

function packageIdFromInput(value: string | undefined): string {
  if (!value) throw new SourceCollectionError("MISSING_PACKAGE_ID", "A Google Play package ID is required.");
  const candidate = value.trim();
  if (!candidate.startsWith("http")) return candidate;

  try {
    const url = new URL(candidate);
    if (url.hostname !== "play.google.com") throw new Error("Unsupported host");
    return url.searchParams.get("id") ?? "";
  } catch {
    throw new SourceCollectionError("INVALID_PACKAGE_ID", "Enter a valid Google Play package ID or Play Store URL.");
  }
}

function errorProperty(error: unknown, property: string): unknown {
  return typeof error === "object" && error !== null ? Reflect.get(error, property) : undefined;
}

export class GooglePlayAdapter implements SourceAdapter {
  readonly type = "google_play" as const;

  constructor(private readonly env: ServerEnv) {}

  async collect(input: Parameters<SourceAdapter["collect"]>[0], context: Parameters<SourceAdapter["collect"]>[1]): Promise<PublicDocument[]> {
    const packageId = packageIdFromInput(input.urlOrQuery);
    if (!PACKAGE_ID.test(packageId)) {
      throw new SourceCollectionError("INVALID_PACKAGE_ID", "Enter a valid Google Play package ID or Play Store URL.");
    }
    if (!this.env.GOOGLE_PLAY_TIMEOUT_MS) {
      throw new SourceCollectionError("GOOGLE_PLAY_NOT_CONFIGURED", "Google Play collection is unavailable until GOOGLE_PLAY_TIMEOUT_MS is configured.");
    }

    const requestOptions = {
      timeout: { request: this.env.GOOGLE_PLAY_TIMEOUT_MS },
      retry: { limit: 0 },
      ...(context.signal ? { signal: context.signal } : {})
    };

    const dateFrom = context.dateFrom ? Date.parse(`${context.dateFrom}T00:00:00.000Z`) : null;
    const dateTo = context.dateTo ? Date.parse(`${context.dateTo}T23:59:59.999Z`) : null;
    const reviews: z.infer<typeof reviewsResultSchema>["data"] = [];
    const seenTokens = new Set<string>();
    let nextPaginationToken: string | undefined;
    let firstPage = true;
    let pageNumber = 0;

    while (firstPage || (nextPaginationToken && reviews.length < context.maxRecords)) {
      firstPage = false;
      let response: unknown;
      try {
        response = await gplay.reviews({
          appId: packageId,
          country: "in",
          lang: "en",
          sort: NEWEST_REVIEWS,
          paginate: true,
          ...(nextPaginationToken ? { nextPaginationToken } : {}),
          requestOptions
        } as Parameters<typeof gplay.reviews>[0]);
      } catch (error) {
        if (context.signal?.aborted) {
          throw new SourceCollectionError("GOOGLE_PLAY_REQUEST_ABORTED", "The Google Play review request was cancelled.");
        }
        if (errorProperty(error, "status") === 404) {
          throw new SourceCollectionError("GOOGLE_PLAY_APP_NOT_FOUND", "The requested app was not found on Google Play.");
        }
        if (errorProperty(error, "name") === "TimeoutError" || errorProperty(error, "code") === "ETIMEDOUT") {
          throw new SourceCollectionError("GOOGLE_PLAY_TIMEOUT", "The Google Play review request timed out.", true);
        }
        throw new SourceCollectionError("GOOGLE_PLAY_NETWORK_FAILURE", "Google Play reviews could not be retrieved.", true);
      }

      const parsed = reviewsResultSchema.safeParse(response);
      if (!parsed.success) {
        throw new SourceCollectionError("GOOGLE_PLAY_INVALID_RESPONSE", "google-play-scraper returned a malformed review response.");
      }
      pageNumber += 1;
      context.onPageCollected?.({
        pageNumber,
        recordCount: parsed.data.data.length
      });
      const pagePublicationTimes = parsed.data.data
        .map(({ date }) => date ? Date.parse(date) : null)
        .filter((value): value is number => value !== null && Number.isFinite(value));
      reviews.push(...parsed.data.data.filter((review) => {
        if (!review.date) return dateFrom === null && dateTo === null;
        const publicationTime = Date.parse(review.date);
        return (dateFrom === null || publicationTime >= dateFrom)
          && (dateTo === null || publicationTime <= dateTo);
      }));
      const token = parsed.data.nextPaginationToken ?? undefined;
      if (!token || reviews.length >= context.maxRecords) break;
      if (
        dateFrom !== null
        && pagePublicationTimes.length > 0
        && Math.min(...pagePublicationTimes) < dateFrom
      ) break;
      if (seenTokens.has(token)) {
        throw new SourceCollectionError("GOOGLE_PLAY_INVALID_RESPONSE", "Google Play returned a repeated pagination token.");
      }
      seenTokens.add(token);
      nextPaginationToken = token;
    }

    if (reviews.length === 0) {
      throw new SourceCollectionError("GOOGLE_PLAY_EMPTY_REVIEWS", "Google Play returned no public reviews for this app.");
    }

    const canonicalUrl = `https://play.google.com/store/apps/details?id=${encodeURIComponent(packageId)}`;
    const documents = reviews
      .slice(0, context.maxRecords)
      .map((review): PublicDocument => {
      const reviewText = normalizeText(review.text).slice(0, 20_000);
      if (!reviewText) {
        throw new SourceCollectionError("GOOGLE_PLAY_INVALID_RESPONSE", "google-play-scraper returned a review without usable text.");
      }
      const title = normalizeText(review.title ?? "").slice(0, 500) || null;
      return {
        externalId: `${packageId}:${review.id}`,
        url: canonicalUrl,
        canonicalUrl,
        sourceType: this.type,
        sourceName: "Google Play",
        platform: "Google Play",
        title,
        publicationDate: review.date ?? null,
        capturedAt: new Date().toISOString(),
        normalizedText: reviewText,
        accessMethod: "public_page",
        policyNote: `Collected from public Google Play reviews with google-play-scraper. Package: ${packageId}. Star rating: ${review.score}/5. Author identity was not retained.`,
        sourceMetadata: {
          rating: review.score,
          locale: "en-IN",
          country: "India",
          packageId
        }
      };
      });

    if (documents.length === 0) {
      throw new SourceCollectionError("GOOGLE_PLAY_EMPTY_REVIEWS", "Google Play returned no public reviews within the selected date range.");
    }

    return publicDocumentSchema.array().parse(documents);
  }
}
