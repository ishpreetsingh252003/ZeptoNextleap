import { describe, expect, it } from "vitest";
import { getServerEnv } from "@zepto/shared-config";
import { promptDefinitions } from "@zepto/research-prompts";
import { createAiProvider } from "./factory.js";
import { jsonSchemaForGemini } from "./gemini.js";
import { buildAnalysisLineageValues } from "./structured-stage.js";

describe("AI provider factory", () => {
  it.each([
    ["gemini", { GEMINI_API_KEY: "key", GEMINI_MODEL: "gemini-model" }],
    ["groq", { GROQ_API_KEY: "key", GROQ_MODEL: "groq-model" }]
  ] as const)("returns the explicitly selected %s adapter", (providerName, providerVariables) => {
    const env = getServerEnv({ DATABASE_URL: "postgresql://local/test", AI_PROVIDER: providerName, ...providerVariables });
    const provider = createAiProvider(env);
    expect(provider.provider).toBe(providerName);
    expect(provider.model).toBe("GEMINI_MODEL" in providerVariables ? providerVariables.GEMINI_MODEL : providerVariables.GROQ_MODEL);
  });

  it("maps provider metadata into analysis lineage", () => {
    const provider = createAiProvider(getServerEnv({ DATABASE_URL: "postgresql://local/test", AI_PROVIDER: "gemini", GEMINI_API_KEY: "key", GEMINI_MODEL: "gemini-model" }));
    const values = buildAnalysisLineageValues({ collectionRunId: "11111111-1111-4111-8111-111111111111", provider, definition: promptDefinitions.relevance, inputHash: "hash" });
    expect(values).toMatchObject({ provider: "gemini", model: "gemini-model", promptVersion: "relevance-v1.0.0", stage: "relevance", attemptCount: 0 });
  });

  it("reduces unsupported Gemini schema constraints without weakening final Zod validation", () => {
    expect(jsonSchemaForGemini({
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: {
        id: { type: "string", format: "uuid", minLength: 1 },
        outcome: { anyOf: [{ type: "string", maxLength: 500 }, { type: "null" }] }
      }
    })).toEqual({
      type: "object",
      properties: { id: { type: "string" }, outcome: { type: ["string", "null"] } }
    });
  });
});
