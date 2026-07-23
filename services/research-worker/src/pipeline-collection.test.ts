import { describe, expect, it } from "vitest";
import type { CreateCollectionRunInput } from "@zepto/research-contracts";
import { getServerEnv } from "@zepto/shared-config";
import { collectRunSources } from "./pipeline.js";

const env = getServerEnv({ DATABASE_URL: "postgresql://local/test" });

function manualInput(marker: string, manualText: string): CreateCollectionRunInput {
  return {
    projectId: "11111111-1111-4111-8111-111111111111",
    sourceType: "manual_text",
    manualText,
    policyConfirmed: true,
    maxRecords: 1,
    urlOrQuery: `https://example.com/${marker}`
  };
}

describe("pipeline source collection", () => {
  it("preserves existing single-source collection behavior", async () => {
    const input = manualInput(
      "single",
      "Single public source context contains enough detail for the existing manual collection behavior."
    );

    const result = await collectRunSources(input, env);

    expect(result).toHaveLength(1);
    expect(result[0]?.normalizedText).toBe(input.manualText);
  });

  it("collects ordered source requests while isolating an adapter failure", async () => {
    const first = manualInput(
      "first",
      "First public source context contains enough detail to verify deterministic collection ordering."
    );
    const failing = manualInput("failing", "Too short.");
    const third = manualInput(
      "third",
      "Third public source context executes after the second source adapter reports its truthful failure."
    );

    const result = await collectRunSources([first, failing, third], env);

    expect(result.map(({ normalizedText }) => normalizedText)).toEqual([
      first.manualText,
      third.manualText
    ]);
  });

  it("reports the first source failure when collection produces no documents", async () => {
    await expect(collectRunSources([
      manualInput("first-failure", "First failure."),
      manualInput("second-failure", "Second failure.")
    ], env)).rejects.toMatchObject({
      name: "CollectionFailedError",
      code: "INSUFFICIENT_MANUAL_CONTEXT"
    });
  });
});
