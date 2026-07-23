import { describe, expect, it } from "vitest";
import { publicDocumentSchema, type SourceType } from "@zepto/research-contracts";
import { getServerEnv } from "@zepto/shared-config";
import { SourceCollectionError, getAdapter } from "./index.js";

const env = getServerEnv({ DATABASE_URL: "postgresql://local/test" });

describe("source adapter registry", () => {
  it.each(["google_play", "public_url", "manual_text", "tavily_query"] satisfies SourceType[])("resolves %s through the typed registry", (sourceType) => {
    expect(getAdapter(sourceType, env).type).toBe(sourceType);
  });

  it("rejects a source type without a registered adapter", () => {
    expect(() => getAdapter("manual_pilot", env)).toThrowError(expect.objectContaining<Partial<SourceCollectionError>>({ code: "UNSUPPORTED_SOURCE" }));
  });

  it("accepts valid adapter output and rejects malformed documents at runtime", async () => {
    const adapter = getAdapter("manual_text", env);
    const documents = await adapter.collect({
      projectId: "11111111-1111-4111-8111-111111111111",
      sourceType: "manual_text",
      manualText: "This public manual-text fixture contains enough bounded context for offline validation.",
      policyConfirmed: true,
      maxRecords: 1
    }, { maxRecords: 1 });

    expect(publicDocumentSchema.array().parse(documents)).toEqual(documents);
    expect(() => publicDocumentSchema.array().parse([{ ...documents[0], policyNote: "" }])).toThrow();
  });
});
