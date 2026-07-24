import { z } from "zod";

export const sourceTypeSchema = z.enum(["google_play", "public_url", "tavily_query", "firecrawl", "manual_text", "manual_pilot"]);
export type SourceType = z.infer<typeof sourceTypeSchema>;

export const runStatusSchema = z.enum(["queued", "collecting", "processing", "analyzing", "completed", "partially_completed", "failed"]);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const analysisStageSchema = z.enum(["relevance", "evidence_extraction", "behavioral_coding", "contradiction_detection", "theme_synthesis"]);
export type AnalysisStage = z.infer<typeof analysisStageSchema>;

export const applicabilitySchema = z.enum(["Zepto-direct", "Quick-commerce transferable", "Category-general contextual"]);
export type Applicability = z.infer<typeof applicabilitySchema>;
export const interpretationSchema = z.enum(["explicit", "inferred", "unknown"]);
export const evidenceValenceSchema = z.enum(["confirming", "opposing", "mixed", "boundary case"]);
export const reviewerStatusSchema = z.enum(["pending", "approved", "revised", "held", "rejected"]);
export const claimStatusSchema = z.enum(["observed", "inferred", "hypothesized", "suggested"]);

export const behavioralCodeSchema = z.enum([
  "barrier", "trigger", "habit", "workaround", "decision criterion", "information need", "trust signal",
  "perceived risk", "shopping mission", "category consideration", "experiment behavior", "JTBD", "mental model", "outcome"
]);
export type BehavioralCode = z.infer<typeof behavioralCodeSchema>;

export const createProjectSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional()
});

export const createCollectionRunSchema = z.object({
  projectId: z.string().uuid(),
  sourceType: sourceTypeSchema.exclude(["manual_pilot"]),
  urlOrQuery: z.string().trim().max(2_000).optional(),
  manualText: z.string().trim().max(20_000).optional(),
  policyConfirmed: z.literal(true),
  maxRecords: z.coerce.number().int().min(1).max(50).default(10),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional()
}).superRefine((value, context) => {
  if (value.sourceType === "manual_text" && !value.manualText) {
    context.addIssue({ code: "custom", path: ["manualText"], message: "Manual text is required." });
  }
  if (value.sourceType !== "manual_text" && !value.urlOrQuery) {
    context.addIssue({ code: "custom", path: ["urlOrQuery"], message: "A public URL or query is required." });
  }
});
export type CreateCollectionRunInput = z.infer<typeof createCollectionRunSchema>;

export const publicDocumentSchema = z.object({
  externalId: z.string().min(1),
  url: z.string().url(),
  canonicalUrl: z.string().url(),
  sourceType: sourceTypeSchema,
  platform: z.string().min(1),
  title: z.string().max(500).nullable(),
  publicationDate: z.string().datetime().nullable(),
  capturedAt: z.string().datetime(),
  normalizedText: z.string().min(1).max(20_000),
  accessMethod: z.enum(["public_page", "public_search_api", "manual_import"]),
  policyNote: z.string().min(1)
});
export type PublicDocument = z.infer<typeof publicDocumentSchema>;
export type AdapterContext = { maxRecords: number; dateFrom?: string; dateTo?: string; signal?: AbortSignal };
export type SourceAdapter = { readonly type: SourceType; collect(input: CreateCollectionRunInput, context: AdapterContext): Promise<PublicDocument[]> };

export const evidenceSentimentSchema = z.enum(["positive", "negative", "neutral", "mixed"]);
export const evidenceSchema = z.object({
  documentId: z.string().min(1),
  sourceType: sourceTypeSchema,
  supportingQuote: z.string().min(1).refine((quote) => quote.trim().length > 0, "Supporting quote cannot be blank."),
  sentiment: evidenceSentimentSchema,
  category: z.string().trim().min(1).max(120),
  confidence: z.number().min(0).max(1)
});
export const documentEvidenceExtractionSchema = z.object({
  evidence: z.array(evidenceSchema)
}).superRefine((output, context) => {
  const seen = new Set<string>();
  for (const [index, evidence] of output.evidence.entries()) {
    const key = JSON.stringify([evidence.documentId, evidence.supportingQuote]);
    if (seen.has(key)) {
      context.addIssue({
        code: "custom",
        path: ["evidence", index],
        message: "Duplicate evidence is not allowed."
      });
    }
    seen.add(key);
  }
});
export type Evidence = z.infer<typeof evidenceSchema>;
export type DocumentEvidenceExtraction = z.infer<typeof documentEvidenceExtractionSchema>;

const reasoningBasisSchema = z.object({ claimStatus: claimStatusSchema, rationale: z.string().min(1).max(800) });

export const relevanceOutputSchema = z.object({
  relevant: z.boolean(),
  categoryExpansionConnection: z.string().min(1).max(800),
  exclusionReason: z.string().max(800).nullable(),
  basis: reasoningBasisSchema
});

export const atomicEvidenceSchema = z.object({
  sourceExternalId: z.string().min(1),
  neutralParaphrase: z.string().min(1).max(1_200),
  minimalExcerpt: z.string().min(1).max(320),
  categoryGroup: z.string().min(1).max(120),
  shoppingMission: z.string().min(1).max(240),
  interpretationCertainty: interpretationSchema,
  outcome: z.string().max(500).nullable(),
  applicability: applicabilitySchema,
  transferRationale: z.string().min(1).max(800),
  evidenceValence: evidenceValenceSchema,
  limitations: z.string().min(1).max(800),
  basis: reasoningBasisSchema
});
export const evidenceExtractionOutputSchema = z.object({ items: z.array(atomicEvidenceSchema).max(12) });

export const behavioralCodingItemSchema = z.object({
  evidenceIndex: z.number().int().nonnegative(),
  codes: z.array(behavioralCodeSchema).min(1),
  jtbd: z.string().max(800).nullable(),
  mentalModel: z.string().max(800).nullable(),
  codeRationale: z.string().min(1).max(800),
  basis: reasoningBasisSchema
});
export const behavioralCodingOutputSchema = z.object({ items: z.array(behavioralCodingItemSchema) });

export const contradictionOutputSchema = z.object({ relationships: z.array(z.object({
  evidenceIndex: z.number().int().nonnegative(),
  relationship: evidenceValenceSchema,
  mechanism: z.string().min(1).max(800),
  basis: reasoningBasisSchema
})) });

export const themeSynthesisOutputSchema = z.object({ themes: z.array(z.object({
  title: z.string().min(1).max(160),
  summary: z.string().min(1).max(1_200),
  behavioralMechanism: z.string().min(1).max(1_000),
  evidenceIds: z.array(z.string().uuid()).min(1),
  opposingEvidenceIds: z.array(z.string().uuid()),
  boundaryEvidenceIds: z.array(z.string().uuid()),
  applicability: applicabilitySchema,
  transferRationale: z.string().min(1).max(800),
  evidenceStrength: z.enum(["Weak", "Directional", "Strong", "Strong with counterevidence"]),
  strengthRationale: z.string().min(1).max(800),
  limitations: z.string().min(1).max(800),
  basis: reasoningBasisSchema
})).max(12) });

export type RelevanceOutput = z.infer<typeof relevanceOutputSchema>;
export type EvidenceExtractionOutput = z.infer<typeof evidenceExtractionOutputSchema>;
export type BehavioralCodingOutput = z.infer<typeof behavioralCodingOutputSchema>;
export type ContradictionOutput = z.infer<typeof contradictionOutputSchema>;
export type ThemeSynthesisOutput = z.infer<typeof themeSynthesisOutputSchema>;

export { assertThemeTraceability } from "./traceability.js";
