import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PublicDocument,
  SourceAdapter,
  SourceType
} from "@zepto/research-contracts";
import { getServerEnv } from "@zepto/shared-config";
import { getAdapter } from "./adapters/index.js";
import { SourceCollectionError } from "./adapters/errors.js";
import { SourceOrchestrator, type SourceRequest } from "./source-orchestrator.js";

vi.mock("./adapters/index.js", () => ({ getAdapter: vi.fn() }));

const env = getServerEnv({ DATABASE_URL: "postgresql://local/test" });
const getAdapterMock = vi.mocked(getAdapter);

function request(sourceType: "manual_text" | "public_url", marker: string): SourceRequest {
  return {
    input: {
      projectId: "11111111-1111-4111-8111-111111111111",
      sourceType,
      ...(sourceType === "manual_text"
        ? { manualText: `Public source context for ${marker} is sufficiently detailed for collection.` }
        : { urlOrQuery: `https://example.com/${marker}` }),
      policyConfirmed: true,
      maxRecords: 10
    },
    context: { maxRecords: 10 }
  };
}

function document(externalId: string, sourceType: SourceType): PublicDocument {
  return {
    externalId,
    url: `https://example.com/${externalId}`,
    canonicalUrl: `https://example.com/${externalId}`,
    sourceType,
    sourceName: sourceType,
    platform: "Test source",
    title: null,
    publicationDate: null,
    capturedAt: "2026-07-23T00:00:00.000Z",
    normalizedText: `Public source document ${externalId}`,
    accessMethod: "manual_import",
    policyNote: "Offline deterministic test fixture."
  };
}

function adapter(type: SourceType, collect: SourceAdapter["collect"]): SourceAdapter {
  return { type, collect };
}

beforeEach(() => {
  getAdapterMock.mockReset();
});

describe("SourceOrchestrator", () => {
  it("collects from a single registered adapter", async () => {
    getAdapterMock.mockReturnValue(adapter("manual_text", vi.fn().mockResolvedValue([
      document("one", "manual_text")
    ])));

    const result = await new SourceOrchestrator(env).collect([request("manual_text", "one")]);

    expect(result).toEqual({ documents: [document("one", "manual_text")], failures: [] });
  });

  it("merges documents from multiple adapters", async () => {
    getAdapterMock
      .mockReturnValueOnce(adapter("manual_text", vi.fn().mockResolvedValue([
        document("manual", "manual_text")
      ])))
      .mockReturnValueOnce(adapter("public_url", vi.fn().mockResolvedValue([
        document("url", "public_url")
      ])));

    const result = await new SourceOrchestrator(env).collect([
      request("manual_text", "manual"),
      request("public_url", "url")
    ]);

    expect(result.documents.map(({ externalId }) => externalId)).toEqual(["manual", "url"]);
    expect(result.failures).toEqual([]);
  });

  it("reports an adapter failure and continues with remaining requests", async () => {
    getAdapterMock
      .mockReturnValueOnce(adapter("public_url", vi.fn().mockRejectedValue(
        new SourceCollectionError("SOURCE_UNAVAILABLE", "Public source is unavailable.", true)
      )))
      .mockReturnValueOnce(adapter("manual_text", vi.fn().mockResolvedValue([
        document("recovered", "manual_text")
      ])));

    const result = await new SourceOrchestrator(env).collect([
      request("public_url", "unavailable"),
      request("manual_text", "recovered")
    ]);

    expect(result.documents.map(({ externalId }) => externalId)).toEqual(["recovered"]);
    expect(result.failures).toEqual([{
      requestIndex: 0,
      sourceType: "public_url",
      code: "SOURCE_UNAVAILABLE",
      message: "Public source is unavailable.",
      retryable: true
    }]);
  });

  it("accepts an adapter with no documents", async () => {
    getAdapterMock.mockReturnValue(adapter("manual_text", vi.fn().mockResolvedValue([])));

    await expect(new SourceOrchestrator(env).collect([
      request("manual_text", "empty")
    ])).resolves.toEqual({ documents: [], failures: [] });
  });

  it("preserves request order and document order", async () => {
    getAdapterMock
      .mockReturnValueOnce(adapter("manual_text", vi.fn().mockResolvedValue([
        document("first-a", "manual_text"),
        document("first-b", "manual_text")
      ])))
      .mockReturnValueOnce(adapter("public_url", vi.fn().mockResolvedValue([
        document("second-a", "public_url"),
        document("second-b", "public_url")
      ])));

    const result = await new SourceOrchestrator(env).collect([
      request("manual_text", "first"),
      request("public_url", "second")
    ]);

    expect(result.documents.map(({ externalId }) => externalId)).toEqual([
      "first-a",
      "first-b",
      "second-a",
      "second-b"
    ]);
  });

  it("resolves every request through the adapter registry", async () => {
    getAdapterMock.mockImplementation((type) => adapter(type, vi.fn().mockResolvedValue([])));

    await new SourceOrchestrator(env).collect([
      request("manual_text", "manual"),
      request("public_url", "url")
    ]);

    expect(getAdapterMock.mock.calls).toEqual([
      ["manual_text", env],
      ["public_url", env]
    ]);
  });
});
