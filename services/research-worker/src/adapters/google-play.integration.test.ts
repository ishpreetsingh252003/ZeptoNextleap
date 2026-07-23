import { describe, expect, it } from "vitest";
import { publicDocumentSchema } from "@zepto/research-contracts";
import { getServerEnv, loadRootEnv } from "@zepto/shared-config";
import { getAdapter } from "./index.js";

loadRootEnv();

describe("Google Play live ingestion", () => {
  it("collects newest public reviews through the registered adapter", async () => {
    const adapter = getAdapter("google_play", getServerEnv());
    const documents = await adapter.collect({
      projectId: "11111111-1111-4111-8111-111111111111",
      sourceType: "google_play",
      urlOrQuery: "com.zeptoconsumerapp",
      policyConfirmed: true,
      maxRecords: 3
    }, { maxRecords: 3 });

    expect(publicDocumentSchema.array().parse(documents)).toEqual(documents);
    expect(documents.length).toBeGreaterThan(0);
    expect(documents.length).toBeLessThanOrEqual(3);
    expect(documents.every((document) => document.sourceType === "google_play")).toBe(true);
  }, 45_000);
});
