import { z, type ZodType } from "zod";
import {
  behavioralCodingOutputSchema,
  contradictionOutputSchema,
  evidenceExtractionOutputSchema,
  relevanceOutputSchema,
  themeSynthesisOutputSchema,
  type AnalysisStage
} from "@zepto/research-contracts";

const NON_FABRICATION = `
Use only the supplied source text and metadata. Never invent quotes, demographics, outcomes, prevalence, causality, or Zepto-specific behavior.
Label every reasoning basis as observed, inferred, hypothesized, or suggested. Category-general evidence is never direct Zepto-user behavior.
Primary scope is lifetime-new or dormant category expansion. Retain product-level detail only when it explains category entry, abandonment, purchase, purchase elsewhere, workaround, or repeat behavior.
Exclude brand, flavor, pack-size, or variant discussion inside a familiar category unless it explains a category-expansion mechanism.
Sentiment alone is not evidence. Preserve contradictions and uncertainty.`.trim();

const CODEBOOK = `Allowed codes: barrier, trigger, habit, workaround, decision criterion, information need, trust signal, perceived risk, shopping mission, category consideration, experiment behavior, JTBD, mental model, outcome.`;

export type PromptDefinition<T> = {
  stage: AnalysisStage;
  version: string;
  name: string;
  schema: ZodType<T>;
  system: string;
};

export const promptDefinitions = {
  relevance: {
    stage: "relevance", version: "relevance-v1.0.0", name: "research_relevance",
    schema: relevanceOutputSchema,
    system: `Decide whether this public document contains a behavior, decision, trigger, workaround, context, or outcome relevant to category expansion or quick-commerce channel choice. Explain the bounded connection or exclusion. ${NON_FABRICATION}`
  },
  evidence_extraction: {
    stage: "evidence_extraction", version: "evidence-v1.0.0", name: "atomic_evidence",
    schema: evidenceExtractionOutputSchema,
    system: `Extract atomic evidence units. Each item must contain one bounded observation, a neutral paraphrase, and the shortest excerpt that substantiates it. Excerpts must be exact substrings of the supplied text and no longer than necessary. ${NON_FABRICATION}`
  },
  behavioral_coding: {
    stage: "behavioral_coding", version: "coding-v1.0.0", name: "behavioral_coding",
    schema: behavioralCodingOutputSchema,
    system: `Code each supplied evidence item using only supported behavioral constructs. Do not force JTBD or mental models; use null when unsupported. ${CODEBOOK} ${NON_FABRICATION}`
  },
  contradiction_detection: {
    stage: "contradiction_detection", version: "contradiction-v1.0.0", name: "contradiction_detection",
    schema: contradictionOutputSchema,
    system: `Classify each evidence item as confirming, opposing, mixed, or a boundary case relative to the other supplied items. Explain the mechanism or boundary; disagreement is not an error. ${NON_FABRICATION}`
  },
  theme_synthesis: {
    stage: "theme_synthesis", version: "themes-v1.0.0", name: "theme_synthesis",
    schema: themeSynthesisOutputSchema,
    system: `Synthesize behavioral themes, not sentiment clusters. Every claim must cite only supplied evidence UUIDs and keep supporting, opposing, and boundary evidence separate. Strength is qualitative corpus support, never statistical confidence. Product ideas are out of scope. ${NON_FABRICATION}`
  }
} as const satisfies Record<AnalysisStage, PromptDefinition<unknown>>;

export function jsonSchemaFor(definition: PromptDefinition<unknown>): Record<string, unknown> {
  return z.toJSONSchema(definition.schema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
}
