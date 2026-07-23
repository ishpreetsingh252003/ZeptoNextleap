import { describe, expect, it, vi } from "vitest";
import { executeStructuredRequest } from "./execute.js";

describe("structured AI execution", () => {
  it("reports a truthful failure after two invalid structured responses", async () => {
    const invoke = vi.fn().mockResolvedValue("not valid JSON");

    await expect(executeStructuredRequest({
      provider: "gemini",
      model: "test-model",
      request: {
        stage: "relevance",
        promptVersion: "test-v1",
        schemaName: "test_schema",
        systemPrompt: "Return structured output.",
        userPrompt: "Test input.",
        jsonSchema: { type: "object" },
        validate: (value) => value
      },
      invoke
    })).rejects.toMatchObject({
      code: "AI_STAGE_FAILED",
      provider: "gemini",
      attemptCount: 2
    });

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls[1]?.[0]).toContain("previous response was invalid");
  });
});
