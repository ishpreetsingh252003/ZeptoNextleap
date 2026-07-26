import { describe, expect, it, vi } from "vitest";
import { executeStructuredRequest } from "./execute.js";

describe("structured AI execution", () => {
  it("returns an unchanged successful result after a sanitized retry", async () => {
    const invoke = vi.fn()
      .mockResolvedValueOnce("not valid JSON")
      .mockResolvedValueOnce(JSON.stringify({ ok: true }));

    await expect(executeStructuredRequest({
      provider: "gemini",
      model: "test-model",
      request: {
        stage: "evidence_extraction",
        promptVersion: "test-v1",
        schemaName: "test_schema",
        systemPrompt: "Return structured output.",
        userPrompt: "Test input.",
        jsonSchema: { type: "object" },
        validate: (value) => value as { ok: boolean }
      },
      invoke
    })).resolves.toEqual({
      data: { ok: true },
      provider: "gemini",
      model: "test-model",
      attemptCount: 2
    });
  });

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
      attemptCount: 2,
      attemptDiagnostics: [
        { attempt: 1, categories: ["INVALID_JSON"], failureLocation: "json_parse" },
        { attempt: 2, categories: ["INVALID_JSON"], failureLocation: "json_parse" }
      ]
    });

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls[1]?.[0]).toContain("previous response was invalid");
  });
});
