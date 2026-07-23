import { describe, expect, it } from "vitest";
import { publicDocumentSchema } from "@zepto/research-contracts";
import { getServerEnv, loadRootEnv } from "@zepto/shared-config";
import { getAdapter } from "./index.js";

loadRootEnv();

const apiKeyConfigured = Boolean(process.env.FIRECRAWL_API_KEY?.trim());

describe.skipIf(!apiKeyConfigured)("Firecrawl live ingestion", () => {
  it("collects a public page through the registered adapter boundary", async () => {
    const adapter = getAdapter("firecrawl", getServerEnv());
    const documents = await adapter.collect({
      projectId: "11111111-1111-4111-8111-111111111111",
      sourceType: "firecrawl",
      urlOrQuery: "https://example.com",
      policyConfirmed: true,
      maxRecords: 1
    }, { maxRecords: 1 });

    expect(publicDocumentSchema.array().parse(documents)).toEqual(documents);
    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({
      sourceType: "firecrawl",
      canonicalUrl: "https://example.com/"
    });
  });
});
