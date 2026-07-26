import { createHash } from "node:crypto";
import { z } from "zod";
import {
  evidenceSchema,
  themeClusteringOutputSchema,
  type Evidence,
  type Theme
} from "@zepto/research-contracts";
import { jsonSchemaFor, promptDefinitions } from "@zepto/research-prompts";
import { StructuredValidationError } from "./ai/failure-diagnostics.js";
import type { AiProvider } from "./ai/types.js";
import { AiProviderError } from "./ai/errors.js";

const themeCompletenessRepairSchema = z.object({
  assignments: z.array(z.object({
    evidenceId: z.string().min(1),
    themeId: z.string().min(1)
  }).strict()),
  newTheme: z.object({
    id: z.string().trim().min(1),
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(1_200),
    dominantSentiment: z.enum(["positive", "negative", "neutral", "mixed"])
  }).strict().nullable()
}).strict();

type ThemeClusteringOutput = z.infer<typeof themeClusteringOutputSchema>;

export type ThemeClusteringMetrics = {
  batchFingerprint: string;
  evidenceCount: number;
  initialProviderAttempts: number;
  initialMissingCount: number;
  repairRequestCount: number;
  repairProviderAttempts: number;
  repairRetryCount: number;
  repairedAssignmentCount: number;
  remainingMissingCount: number;
  newThemeCreated: boolean;
  finalValidationCategory: "valid" | "MISSING_EVIDENCE_ASSIGNMENT" | "OTHER";
  repairTimingMilliseconds: number;
};

export class ThemeCompletenessRepairError extends Error {
  readonly name = "ThemeCompletenessRepairError";

  constructor(
    readonly metrics: ThemeClusteringMetrics,
    readonly cause: unknown
  ) {
    super("Theme completeness repair failed.");
  }
}

export function evidenceIdFor(evidence: Evidence): string {
  const identity = JSON.stringify([
    evidence.documentId,
    evidence.sourceType,
    evidence.supportingQuote
  ]);
  return `evidence_${createHash("sha256").update(identity).digest("hex")}`;
}

function evidenceReference(index: number): string {
  return `E${index + 1}`;
}

export function themeBatchFingerprint(evidence: readonly Evidence[]): string {
  const records = evidence.map((item) => JSON.stringify({
    evidenceId: evidenceIdFor(item),
    documentId: item.documentId,
    sourceType: item.sourceType,
    classification: {
      sentiment: item.sentiment,
      category: item.category,
      confidence: item.confidence
    },
    contentHash: createHash("sha256").update(item.supportingQuote).digest("hex")
  })).sort();
  return createHash("sha256").update(records.join("\n")).digest("hex");
}

function assignmentState(
  output: ThemeClusteringOutput,
  knownEvidenceIds: ReadonlySet<string>,
  requireComplete: boolean
): { assigned: Set<string>; missing: string[] } {
  if (knownEvidenceIds.size > 0 && output.themes.length === 0) {
    throw new StructuredValidationError(["EMPTY_THEME"], "evidence_assignment");
  }
  const assigned = new Set<string>();
  for (const theme of output.themes) {
    for (const evidenceId of theme.evidenceIds) {
      if (!knownEvidenceIds.has(evidenceId)) {
        throw new StructuredValidationError(
          ["UNKNOWN_EVIDENCE_ID"],
          "evidence_assignment"
        );
      }
      if (assigned.has(evidenceId)) {
        throw new StructuredValidationError(
          ["DUPLICATE_EVIDENCE_ASSIGNMENT"],
          "evidence_assignment"
        );
      }
      assigned.add(evidenceId);
    }
  }
  const missing = [...knownEvidenceIds].filter((evidenceId) => !assigned.has(evidenceId));
  if (requireComplete && missing.length > 0) {
    throw new StructuredValidationError(
      ["MISSING_EVIDENCE_ASSIGNMENT"],
      "evidence_assignment"
    );
  }
  return { assigned, missing };
}

function repairFailureCategory(error: unknown): ThemeClusteringMetrics["finalValidationCategory"] {
  if (
    error instanceof AiProviderError
    && error.attemptDiagnostics.some(({ categories }) =>
      categories.includes("MISSING_EVIDENCE_ASSIGNMENT")
    )
  ) {
    return "MISSING_EVIDENCE_ASSIGNMENT";
  }
  return "OTHER";
}

export async function clusterEvidence(
  evidence: readonly Evidence[],
  provider: AiProvider,
  onMetrics?: (metrics: ThemeClusteringMetrics) => void
): Promise<Theme[]> {
  const parsedEvidence = evidenceSchema.array().parse(evidence);
  if (parsedEvidence.length === 0) return [];

  const evidenceWithIds = parsedEvidence.map((item, index) => ({
    evidenceId: evidenceReference(index),
    ...item
  }));
  const stableIdByReference = new Map(
    evidenceWithIds.map(({ evidenceId }, index) => [
      evidenceId,
      evidenceIdFor(parsedEvidence[index]!)
    ])
  );
  const knownEvidenceIds = new Set(stableIdByReference.keys());
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
      assignmentState(output, knownEvidenceIds, false);
      return output;
    }
  });

  const initialState = assignmentState(result.data, knownEvidenceIds, false);
  const baseMetrics: ThemeClusteringMetrics = {
    batchFingerprint: themeBatchFingerprint(parsedEvidence),
    evidenceCount: parsedEvidence.length,
    initialProviderAttempts: result.attemptCount,
    initialMissingCount: initialState.missing.length,
    repairRequestCount: 0,
    repairProviderAttempts: 0,
    repairRetryCount: 0,
    repairedAssignmentCount: 0,
    remainingMissingCount: initialState.missing.length,
    newThemeCreated: false,
    finalValidationCategory: initialState.missing.length === 0
      ? "valid"
      : "MISSING_EVIDENCE_ASSIGNMENT",
    repairTimingMilliseconds: 0
  };

  let completeOutput = result.data;
  if (initialState.missing.length > 0) {
    const missingSet = new Set(initialState.missing);
    const existingThemeIds = new Set(result.data.themes.map(({ id }) => id));
    const existingAssigned = initialState.assigned;
    const missingEvidence = evidenceWithIds.filter(({ evidenceId }) => missingSet.has(evidenceId));
    const repairStartedAt = performance.now();
    try {
      const repairResult = await provider.generateStructured({
        stage: "theme_clustering",
        promptVersion: "theme-completeness-repair-v1.0.0",
        schemaName: "theme_completeness_repair",
        systemPrompt: `Assign every supplied missing evidenceId to exactly one existing provisional theme.
Use only the exact allowed evidenceIds. Do not return already assigned or unknown evidenceIds.
Do not rename, delete, modify, or reproduce existing themes or prior assignments.
Create one newTheme only when none of the existing themes fits; otherwise newTheme must be null.
Return each missing evidenceId exactly once in assignments and return only the requested structured object.`,
        userPrompt: `${JSON.stringify({
          existingThemes: result.data.themes.map(({ id, title, description }) => ({
            themeId: id,
            title,
            description
          })),
          missingEvidence,
          allowedMissingEvidenceIds: initialState.missing
        })}\n\nReturn only the requested structured object.`,
        jsonSchema: z.toJSONSchema(themeCompletenessRepairSchema, {
          target: "draft-7",
          unrepresentable: "any"
        }) as Record<string, unknown>,
        validate: (value) => {
          const repair = themeCompletenessRepairSchema.parse(value);
          const newThemeId = repair.newTheme?.id;
          if (newThemeId && existingThemeIds.has(newThemeId)) {
            throw new StructuredValidationError(["UNKNOWN_THEME_REFERENCE"], "theme_reference");
          }
          const repairedIds = new Set<string>();
          for (const assignment of repair.assignments) {
            if (existingAssigned.has(assignment.evidenceId)) {
              throw new StructuredValidationError(
                ["DUPLICATE_EVIDENCE_ASSIGNMENT"],
                "evidence_assignment"
              );
            }
            if (!missingSet.has(assignment.evidenceId)) {
              throw new StructuredValidationError(
                ["UNKNOWN_EVIDENCE_ID"],
                "evidence_assignment"
              );
            }
            if (repairedIds.has(assignment.evidenceId)) {
              throw new StructuredValidationError(
                ["DUPLICATE_EVIDENCE_ASSIGNMENT"],
                "evidence_assignment"
              );
            }
            if (!existingThemeIds.has(assignment.themeId) && assignment.themeId !== newThemeId) {
              throw new StructuredValidationError(
                ["UNKNOWN_THEME_REFERENCE"],
                "theme_reference"
              );
            }
            repairedIds.add(assignment.evidenceId);
          }
          if (repair.newTheme && !repair.assignments.some(({ themeId }) => themeId === repair.newTheme!.id)) {
            throw new StructuredValidationError(["EMPTY_THEME"], "theme_reference");
          }
          if (repairedIds.size !== missingSet.size) {
            throw new StructuredValidationError(
              ["MISSING_EVIDENCE_ASSIGNMENT"],
              "evidence_assignment"
            );
          }
          return repair;
        }
      });

      const assignmentsByTheme = new Map<string, string[]>();
      for (const evidenceId of initialState.missing) {
        const assignment = repairResult.data.assignments.find((item) => item.evidenceId === evidenceId)!;
        const assigned = assignmentsByTheme.get(assignment.themeId) ?? [];
        assigned.push(evidenceId);
        assignmentsByTheme.set(assignment.themeId, assigned);
      }
      const repairedThemes = result.data.themes.map((theme) => {
        const repairedIds = assignmentsByTheme.get(theme.id) ?? [];
        const evidenceIds = [...theme.evidenceIds, ...repairedIds];
        return { ...theme, evidenceIds, evidenceCount: evidenceIds.length };
      });
      if (repairResult.data.newTheme) {
        const evidenceIds = assignmentsByTheme.get(repairResult.data.newTheme.id) ?? [];
        repairedThemes.push({
          ...repairResult.data.newTheme,
          evidenceIds,
          evidenceCount: evidenceIds.length
        });
      }
      completeOutput = themeClusteringOutputSchema.parse({ themes: repairedThemes });
      const finalState = assignmentState(completeOutput, knownEvidenceIds, true);
      onMetrics?.({
        ...baseMetrics,
        repairRequestCount: 1,
        repairProviderAttempts: repairResult.attemptCount,
        repairRetryCount: Math.max(0, repairResult.attemptCount - 1),
        repairedAssignmentCount: initialState.missing.length,
        remainingMissingCount: finalState.missing.length,
        newThemeCreated: repairResult.data.newTheme !== null,
        finalValidationCategory: "valid",
        repairTimingMilliseconds: performance.now() - repairStartedAt
      });
    } catch (error) {
      const repairProviderAttempts = error instanceof AiProviderError ? error.attemptCount : 1;
      const metrics: ThemeClusteringMetrics = {
        ...baseMetrics,
        repairRequestCount: 1,
        repairProviderAttempts,
        repairRetryCount: Math.max(0, repairProviderAttempts - 1),
        finalValidationCategory: repairFailureCategory(error),
        repairTimingMilliseconds: performance.now() - repairStartedAt
      };
      onMetrics?.(metrics);
      throw new ThemeCompletenessRepairError(metrics, error);
    }
  } else {
    assignmentState(completeOutput, knownEvidenceIds, true);
    onMetrics?.(baseMetrics);
  }

  return completeOutput.themes.map((theme) => ({
    ...theme,
    evidenceIds: theme.evidenceIds.map((reference) => stableIdByReference.get(reference)!)
  }));
}
