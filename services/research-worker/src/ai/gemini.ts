import { GoogleGenAI } from "@google/genai";
import { executeStructuredRequest } from "./execute.js";
import type { AiProvider, AiStageRequest, AiStageResult } from "./types.js";

const UNSUPPORTED_SCHEMA_KEYS = new Set(["$schema", "minLength", "maxLength", "pattern"]);
const SUPPORTED_STRING_FORMATS = new Set(["date", "date-time", "time"]);

export function jsonSchemaForGemini(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(jsonSchemaForGemini);
  if (!value || typeof value !== "object") return value;

  const source = value as Record<string, unknown>;
  const alternatives = source.anyOf;
  if (Array.isArray(alternatives) && alternatives.length === 2) {
    const nullAlternative = alternatives.find((entry) => typeof entry === "object" && entry !== null && (entry as Record<string, unknown>).type === "null");
    const valueAlternative = alternatives.find((entry) => entry !== nullAlternative);
    if (nullAlternative && valueAlternative && typeof valueAlternative === "object" && valueAlternative !== null) {
      const normalized = jsonSchemaForGemini(valueAlternative) as Record<string, unknown>;
      const type = normalized.type;
      if (typeof type === "string") return { ...normalized, type: [type, "null"] };
    }
  }

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(source)) {
    if (UNSUPPORTED_SCHEMA_KEYS.has(key)) continue;
    if (key === "format" && typeof entry === "string" && !SUPPORTED_STRING_FORMATS.has(entry)) continue;
    if (key === "properties" && entry && typeof entry === "object" && !Array.isArray(entry)) {
      output[key] = Object.fromEntries(Object.entries(entry as Record<string, unknown>).map(([name, schema]) => [name, jsonSchemaForGemini(schema)]));
    } else {
      output[key] = jsonSchemaForGemini(entry);
    }
  }
  return output;
}

export class GeminiProvider implements AiProvider {
  readonly provider = "gemini" as const;
  private readonly client: GoogleGenAI;

  constructor(public readonly model: string, apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  generateStructured<T>(request: AiStageRequest<T>): Promise<AiStageResult<T>> {
    return executeStructuredRequest({
      provider: this.provider,
      model: this.model,
      request,
      invoke: async (userPrompt) => {
        const response = await this.client.models.generateContent({
          model: this.model,
          contents: userPrompt,
          config: {
            systemInstruction: request.systemPrompt,
            temperature: 0,
            responseMimeType: "application/json",
            responseJsonSchema: jsonSchemaForGemini(request.jsonSchema)
          }
        });
        if (!response.text) throw new Error("Provider returned no structured content.");
        return response.text;
      }
    });
  }
}
