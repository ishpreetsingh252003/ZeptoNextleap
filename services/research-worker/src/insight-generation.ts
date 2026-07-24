import {
  evidenceSchema,
  insightGenerationOutputSchema,
  themeClusteringOutputSchema,
  type Evidence,
  type Insight,
  type Theme
} from "@zepto/research-contracts";
import { jsonSchemaFor, promptDefinitions } from "@zepto/research-prompts";
import type { AiProvider } from "./ai/types.js";
import { evidenceIdFor } from "./theme-clustering.js";

export async function generateInsights(
  themes: readonly Theme[],
  evidence: readonly Evidence[],
  provider: AiProvider
): Promise<Insight[]> {
  const parsedThemes = themeClusteringOutputSchema.parse({ themes }).themes;
  if (parsedThemes.length === 0) return [];

  const parsedEvidence = evidenceSchema.array().parse(evidence);
  const evidenceWithIds = parsedEvidence.map((item) => ({
    evidenceId: evidenceIdFor(item),
    ...item
  }));
  const evidenceById = new Map(evidenceWithIds.map((item) => [item.evidenceId, item]));
  if (evidenceById.size !== evidenceWithIds.length) {
    throw new Error("Duplicate evidence records cannot generate insights.");
  }

  const themesById = new Map(parsedThemes.map((theme) => [theme.id, theme]));
  const themeByEvidenceId = new Map<string, string>();
  for (const theme of parsedThemes) {
    for (const evidenceId of theme.evidenceIds) {
      if (!evidenceById.has(evidenceId)) {
        throw new Error("Theme referenced evidence that was not supplied.");
      }
      if (themeByEvidenceId.has(evidenceId)) {
        throw new Error("Evidence cannot belong to multiple supplied themes.");
      }
      themeByEvidenceId.set(evidenceId, theme.id);
    }
  }
  if (themeByEvidenceId.size !== evidenceById.size) {
    throw new Error("Every supplied evidence record must belong to a theme.");
  }

  const definition = promptDefinitions.insight_generation;
  const result = await provider.generateStructured({
    stage: definition.stage,
    promptVersion: definition.version,
    schemaName: definition.name,
    systemPrompt: definition.system,
    userPrompt: `${JSON.stringify({ themes: parsedThemes, evidence: evidenceWithIds })}\n\nReturn only the requested structured object.`,
    jsonSchema: jsonSchemaFor(definition),
    validate: (value) => {
      const output = insightGenerationOutputSchema.parse(value);
      for (const insight of output.insights) {
        const theme = themesById.get(insight.themeId);
        if (!theme) throw new Error("Insight referenced an unknown theme.");
        const themeEvidenceIds = new Set(theme.evidenceIds);
        for (const evidenceId of insight.evidenceIds) {
          if (!evidenceById.has(evidenceId)) {
            throw new Error("Insight referenced unknown evidence.");
          }
          if (!themeEvidenceIds.has(evidenceId)) {
            throw new Error("Insight evidence did not belong to its referenced theme.");
          }
        }
      }
      return output;
    }
  });

  return result.data.insights;
}
