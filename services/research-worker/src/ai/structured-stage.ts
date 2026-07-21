import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { PromptDefinition } from "@zepto/research-prompts";
import { jsonSchemaFor } from "@zepto/research-prompts";
import { analysisRuns, getDb } from "@zepto/research-database";
import { AiProviderError } from "./errors.js";
import type { AiProvider } from "./types.js";

type StageResult<T> = { analysisRunId: string; output: T };

export function buildAnalysisLineageValues(options: {
  collectionRunId: string;
  sourceId?: string;
  provider: AiProvider;
  definition: PromptDefinition<unknown>;
  inputHash: string;
}): typeof analysisRuns.$inferInsert {
  return {
    collectionRunId: options.collectionRunId,
    ...(options.sourceId ? { sourceId: options.sourceId } : {}),
    stage: options.definition.stage,
    provider: options.provider.provider,
    model: options.provider.model,
    promptVersion: options.definition.version,
    inputHash: options.inputHash,
    attemptCount: 0
  };
}

export async function runStructuredStage<T>(options: {
  collectionRunId: string;
  sourceId?: string;
  provider: AiProvider;
  definition: PromptDefinition<T>;
  input: unknown;
  postValidate?: (output: T) => void;
}): Promise<StageResult<T>> {
  const db = getDb();
  const inputText = JSON.stringify(options.input);
  const inputHash = createHash("sha256").update(inputText).digest("hex");
  const [lineage] = await db.insert(analysisRuns).values(buildAnalysisLineageValues({
    collectionRunId: options.collectionRunId,
    ...(options.sourceId ? { sourceId: options.sourceId } : {}),
    provider: options.provider,
    definition: options.definition,
    inputHash
  })).returning({ id: analysisRuns.id });
  if (!lineage) throw new Error("Could not create analysis lineage record.");

  try {
    const result = await options.provider.generateStructured({
      stage: options.definition.stage,
      promptVersion: options.definition.version,
      schemaName: options.definition.name,
      systemPrompt: options.definition.system,
      userPrompt: `${inputText}\n\nReturn only the requested structured object.`,
      jsonSchema: jsonSchemaFor(options.definition),
      validate: (value) => {
        const output = options.definition.schema.parse(value);
        options.postValidate?.(output);
        return output;
      }
    });
    await db.update(analysisRuns).set({ status: "completed", attemptCount: result.attemptCount, validatedOutput: result.data as object, completedAt: new Date(), updatedAt: new Date() }).where(eq(analysisRuns.id, lineage.id));
    return { analysisRunId: lineage.id, output: result.data };
  } catch (error) {
    const attemptCount = error instanceof AiProviderError ? error.attemptCount : 0;
    const message = error instanceof Error ? error.message : "Unknown AI provider failure.";
    await db.update(analysisRuns).set({ status: "failed", attemptCount, errorMessage: message, completedAt: new Date(), updatedAt: new Date() }).where(eq(analysisRuns.id, lineage.id));
    throw error;
  }
}
