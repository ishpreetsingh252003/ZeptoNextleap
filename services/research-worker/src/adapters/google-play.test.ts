import gplay from "google-play-scraper";
import { afterEach, describe, expect, it, vi } from "vitest";
import { publicDocumentSchema } from "@zepto/research-contracts";
import { getServerEnv } from "@zepto/shared-config";
import { GooglePlayAdapter } from "./google-play.js";

vi.mock("google-play-scraper", () => ({
  default: {
    reviews: vi.fn(),
    sort: { NEWEST: 2 }
  }
}));

const reviewsMock = vi.mocked(gplay.reviews);
const env = getServerEnv({
  DATABASE_URL: "postgresql://local/test",
  GOOGLE_PLAY_TIMEOUT_MS: "15000"
});
const input = {
  projectId: "11111111-1111-4111-8111-111111111111",
  sourceType: "google_play" as const,
  urlOrQuery: "com.zeptoconsumerapp",
  policyConfirmed: true as const,
  maxRecords: 2
};

afterEach(() => {
  vi.resetAllMocks();
});

describe("GooglePlayAdapter", () => {
  it("maps newest reviews to validated PublicDocument objects", async () => {
    reviewsMock.mockResolvedValue({
      data: [{
        id: "review-1",
        userName: "Public Reviewer",
        userImage: "https://example.com/avatar.png",
        date: "2026-07-01T10:00:00.000Z",
        score: 4,
        scoreText: "4",
        url: "https://play.google.com/store/apps/details?id=com.zeptoconsumerapp&reviewId=review-1",
        title: "Useful delivery app",
        text: "The review contains a shopping decision and a clearly stated outcome.",
        replyDate: "",
        replyText: "",
        version: "1.0.0",
        thumbsUp: 2,
        criterias: []
      }]
    });

    const documents = await new GooglePlayAdapter(env).collect(input, { maxRecords: 2 });

    expect(publicDocumentSchema.array().parse(documents)).toEqual(documents);
    expect(documents[0]).toMatchObject({
      externalId: "com.zeptoconsumerapp:review-1",
      url: "https://play.google.com/store/apps/details?id=com.zeptoconsumerapp",
      canonicalUrl: "https://play.google.com/store/apps/details?id=com.zeptoconsumerapp",
      sourceType: "google_play",
      title: "Useful delivery app",
      publicationDate: "2026-07-01T10:00:00.000Z",
      normalizedText: "The review contains a shopping decision and a clearly stated outcome."
    });
    expect(documents[0]?.policyNote).toContain("Author identity was not retained");
    expect(documents[0]?.policyNote).not.toContain("Public Reviewer");
    expect(documents[0]?.policyNote).toContain("Star rating: 4/5");
    expect(reviewsMock).toHaveBeenCalledWith(expect.objectContaining({
      appId: "com.zeptoconsumerapp",
      sort: 2,
      paginate: true,
      requestOptions: {
        timeout: { request: 15000 },
        retry: { limit: 0 }
      }
    }));
  });

  it("rejects an invalid package before calling google-play-scraper", async () => {
    await expect(new GooglePlayAdapter(env).collect({ ...input, urlOrQuery: "not a package" }, { maxRecords: 1 }))
      .rejects.toMatchObject({ code: "INVALID_PACKAGE_ID" });
    expect(reviewsMock).not.toHaveBeenCalled();
  });

  it("normalizes a Play Store URL to the same package identifier", async () => {
    reviewsMock.mockResolvedValue({ data: [] });

    await expect(new GooglePlayAdapter(env).collect({
      ...input,
      urlOrQuery: "https://play.google.com/store/apps/details?id=com.zeptoconsumerapp"
    }, { maxRecords: 1 })).rejects.toMatchObject({ code: "GOOGLE_PLAY_EMPTY_REVIEWS" });

    expect(reviewsMock).toHaveBeenCalledWith(expect.objectContaining({
      appId: "com.zeptoconsumerapp"
    }));
  });

  it("reports an app-not-found response truthfully", async () => {
    reviewsMock.mockRejectedValue(Object.assign(new Error("not found"), { status: 404 }));

    await expect(new GooglePlayAdapter(env).collect(input, { maxRecords: 1 }))
      .rejects.toMatchObject({ code: "GOOGLE_PLAY_APP_NOT_FOUND" });
  });

  it("rejects an empty review result", async () => {
    reviewsMock.mockResolvedValue({ data: [] });

    await expect(new GooglePlayAdapter(env).collect(input, { maxRecords: 1 }))
      .rejects.toMatchObject({ code: "GOOGLE_PLAY_EMPTY_REVIEWS" });
  });

  it("follows continuation tokens sequentially until the requested count", async () => {
    const pageProgress: Array<{ pageNumber: number; recordCount: number }> = [];
    reviewsMock
      .mockResolvedValueOnce({
        data: [{
          id: "review-1",
          userName: null,
          date: "2026-07-02T00:00:00.000Z",
          score: 5,
          title: null,
          text: "First page review."
        }],
        nextPaginationToken: "page-two"
      } as never)
      .mockResolvedValueOnce({
        data: [{
          id: "review-2",
          userName: null,
          date: "2026-07-01T00:00:00.000Z",
          score: 4,
          title: null,
          text: "Second page review."
        }],
        nextPaginationToken: null
      } as never);

    const result = await new GooglePlayAdapter(env).collect(input, {
      maxRecords: 2,
      onPageCollected: (progress) => pageProgress.push(progress)
    });

    expect(result.map(({ externalId }) => externalId)).toEqual([
      "com.zeptoconsumerapp:review-1",
      "com.zeptoconsumerapp:review-2"
    ]);
    expect(reviewsMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      nextPaginationToken: "page-two"
    }));
    expect(pageProgress).toEqual([
      { pageNumber: 1, recordCount: 1 },
      { pageNumber: 2, recordCount: 1 }
    ]);
  });

  it("rejects repeated continuation tokens instead of looping", async () => {
    reviewsMock
      .mockResolvedValueOnce({
        data: [{
          id: "review-1",
          userName: null,
          date: "2026-07-02T00:00:00.000Z",
          score: 5,
          title: null,
          text: "First page review."
        }],
        nextPaginationToken: "repeated"
      } as never)
      .mockResolvedValueOnce({
        data: [{
          id: "review-2",
          userName: null,
          date: "2026-07-01T00:00:00.000Z",
          score: 4,
          title: null,
          text: "Second page review."
        }],
        nextPaginationToken: "repeated"
      } as never);

    await expect(new GooglePlayAdapter(env).collect(
      { ...input, maxRecords: 3 },
      { maxRecords: 3 }
    )).rejects.toMatchObject({ code: "GOOGLE_PLAY_INVALID_RESPONSE" });
  });

  it("continues past newer pages to satisfy a selected date range", async () => {
    reviewsMock
      .mockResolvedValueOnce({
        data: [{
          id: "too-new",
          userName: null,
          date: "2026-07-10T00:00:00.000Z",
          score: 5,
          title: null,
          text: "Outside the requested range."
        }],
        nextPaginationToken: "older-page"
      } as never)
      .mockResolvedValueOnce({
        data: [{
          id: "in-range",
          userName: null,
          date: "2026-07-01T00:00:00.000Z",
          score: 4,
          title: null,
          text: "Inside the requested range."
        }],
        nextPaginationToken: null
      } as never);

    const result = await new GooglePlayAdapter(env).collect(input, {
      maxRecords: 1,
      dateFrom: "2026-07-01",
      dateTo: "2026-07-02"
    });

    expect(result.map(({ externalId }) => externalId)).toEqual([
      "com.zeptoconsumerapp:in-range"
    ]);
    expect(reviewsMock).toHaveBeenCalledTimes(2);
  });

  it("reports a timeout truthfully", async () => {
    reviewsMock.mockRejectedValue(Object.assign(new Error("timed out"), { name: "TimeoutError", code: "ETIMEDOUT" }));

    await expect(new GooglePlayAdapter(env).collect(input, { maxRecords: 1 }))
      .rejects.toMatchObject({ code: "GOOGLE_PLAY_TIMEOUT", retryable: true });
  });

  it("rejects malformed scraper output", async () => {
    reviewsMock.mockResolvedValue({ data: [{ id: "review-1", score: "five", text: "Malformed" }] } as never);

    await expect(new GooglePlayAdapter(env).collect(input, { maxRecords: 1 }))
      .rejects.toMatchObject({ code: "GOOGLE_PLAY_INVALID_RESPONSE" });
  });

  it("reports network failures without exposing provider details", async () => {
    reviewsMock.mockRejectedValue(new Error("socket details must not escape"));

    await expect(new GooglePlayAdapter(env).collect(input, { maxRecords: 1 }))
      .rejects.toMatchObject({
        code: "GOOGLE_PLAY_NETWORK_FAILURE",
        message: "Google Play reviews could not be retrieved."
      });
  });

  it("requires an environment-configured timeout", async () => {
    const unconfigured = getServerEnv({ DATABASE_URL: "postgresql://local/test" });

    await expect(new GooglePlayAdapter(unconfigured).collect(input, { maxRecords: 1 }))
      .rejects.toMatchObject({ code: "GOOGLE_PLAY_NOT_CONFIGURED" });
    expect(reviewsMock).not.toHaveBeenCalled();
  });
});
