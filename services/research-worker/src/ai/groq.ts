import { createHash } from "node:crypto";
import Groq from "groq-sdk";
import { eq } from "drizzle-orm";
import type { ZodType } from "zod";
import { analysisRuns, getDb } from "@zepto/research-database";
import { jsonSchemaFor, type PromptDefinition } from "@zepto/research-prompts";

type StageResult<T> = { analysisRunId: string; output: T };

export async function runStructuredStage<T>(options: {
  collectionRunId: string;
  sourceId?: string;
  model: string;
  apiKey: string;
  definition: PromptDefinition<T>;
  input: unknown;
  postValidate?: (output: T) => void;
}): Promise<StageResult<T>> {
  const db = getDb();
  const inputText = JSON.stringify(options.input);
  const inputHash = createHash("sha256").update(inputText).digest("hex");
  const [lineage] = await db.insert(analysisRuns).values({
    collectionRunId: options.collectionRunId,
    sourceId: options.sourceId,
    stage: options.definition.stage,
    model: options.model,
    promptVersion: options.definition.version,
    inputHash
  }).returning({ id: analysisRuns.id });
  if (!lineage) throw new Error("Could not create analysis lineage record.");

  const client = new Groq({ apiKey: options.apiKey });
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await client.chat.completions.create({
        model: options.model,
        temperature: 0,
        messages: [
          { role: "system", content: options.definition.system },
          { role: "user", content: `${inputText}\n\nReturn only the requested structured object.${attempt > 1 ? " Correct the prior schema or evidence-grounding failure." : ""}` }
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: options.definition.name, strict: true, schema: jsonSchemaFor(options.definition) }
        } as never
      });
      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error("Groq returned no structured content.");
      const output = options.definition.schema.parse(JSON.parse(content));
      options.postValidate?.(output);
      await db.update(analysisRuns).set({ status: "completed", validatedOutput: output as object, completedAt: new Date(), updatedAt: new Date() }).where(eq(analysisRuns.id, lineage.id));
      return { analysisRunId: lineage.id, output };
    } catch (error) {
      lastError = error;
    }
  }

  const message = lastError instanceof Error ? lastError.message : "Unknown structured-output failure.";
  await db.update(analysisRuns).set({ status: "failed", errorMessage: message, completedAt: new Date(), updatedAt: new Date() }).where(eq(analysisRuns.id, lineage.id));
  throw new Error(`Groq ${options.definition.stage} failed validation after 2 attempts: ${message}`);
}
