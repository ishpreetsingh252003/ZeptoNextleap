import { createHash } from "node:crypto";
import {
  evidenceSchema,
  themeClusteringOutputSchema,
  type Evidence,
  type Theme
} from "@zepto/research-contracts";
import { jsonSchemaFor, promptDefinitions } from "@zepto/research-prompts";
import type { AiProvider } from "./ai/types.js";

export function evidenceIdFor(evidence: Evidence): string {
  const identity = JSON.stringify([
    evidence.documentId,
    evidence.sourceType,
    evidence.supportingQuote
  ]);
  return `evidence_${createHash("sha256").update(identity).digest("hex")}`;
}

export async function clusterEvidence(
  evidence: readonly Evidence[],
  provider: AiProvider
): Promise<Theme[]> {
  const parsedEvidence = evidenceSchema.array().parse(evidence);
  if (parsedEvidence.length === 0) return [];

  const evidenceWithIds = parsedEvidence.map((item) => ({
    evidenceId: evidenceIdFor(item),
    ...item
  }));
  const knownEvidenceIds = new Set(evidenceWithIds.map(({ evidenceId }) => evidenceId));
  if (knownEvidenceIds.size !== evidenceWithIds.length) {
    throw new Error("Duplicate evidence records cannot be clustered.");
  }

  const definition = promptDefinitions.theme_clustering;
  const result = await provider.generateStructured({
    stage: definition.stage,
    promptVersion: definition.version,
    schemaName: definition.name,
    systemPrompt: definition.system,
    userPrompt: `${JSON.stringify({ evidence: evidenceWithIds })}\n\nReturn only the requested structured object.`,
    jsonSchema: jsonSchemaFor(definition),
    validate: (value) => {
      const output = themeClusteringOutputSchema.parse(value);
      const assignedEvidenceIds = new Set<string>();
      for (const theme of output.themes) {
        for (const evidenceId of theme.evidenceIds) {
          if (!knownEvidenceIds.has(evidenceId)) {
            throw new Error("Theme referenced an unknown evidence ID.");
          }
          if (assignedEvidenceIds.has(evidenceId)) {
            throw new Error("Evidence cannot appear in multiple themes.");
          }
          assignedEvidenceIds.add(evidenceId);
        }
      }
      if (assignedEvidenceIds.size !== knownEvidenceIds.size) {
        throw new Error("Every evidence record must belong to exactly one theme.");
      }
      return output;
    }
  });

  return result.data.themes;
}
