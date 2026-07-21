import Groq from "groq-sdk";
import { executeStructuredRequest } from "./execute.js";
import type { AiProvider, AiStageRequest, AiStageResult } from "./types.js";

export class GroqProvider implements AiProvider {
  readonly provider = "groq" as const;
  private readonly client: Groq;

  constructor(public readonly model: string, apiKey: string) {
    this.client = new Groq({ apiKey });
  }

  generateStructured<T>(request: AiStageRequest<T>): Promise<AiStageResult<T>> {
    return executeStructuredRequest({
      provider: this.provider,
      model: this.model,
      request,
      invoke: async (userPrompt) => {
        const response = await this.client.chat.completions.create({
          model: this.model,
          temperature: 0,
          messages: [
            { role: "system", content: request.systemPrompt },
            { role: "user", content: userPrompt }
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: request.schemaName, strict: true, schema: request.jsonSchema }
          } as never
        });
        const content = response.choices[0]?.message?.content;
        if (!content) throw new Error("Provider returned no structured content.");
        return content;
      }
    });
  }
}
