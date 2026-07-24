import type {
  Evidence,
  Insight,
  PublicDocument,
  Theme
} from "@zepto/research-contracts";
import type { AiProvider } from "./ai/types.js";
import { extractEvidence } from "./evidence-extractor.js";
import { generateInsights } from "./insight-generation.js";
import { clusterEvidence } from "./theme-clustering.js";

export type AnalysisPipelineResult = {
  evidence: Evidence[];
  themes: Theme[];
  insights: Insight[];
};

export async function runAnalysisPipeline(
  documents: readonly PublicDocument[],
  provider: AiProvider
): Promise<AnalysisPipelineResult> {
  if (documents.length === 0) {
    return { evidence: [], themes: [], insights: [] };
  }

  const evidence = await extractEvidence(documents, provider);
  const themes = await clusterEvidence(evidence, provider);
  const insights = await generateInsights(themes, evidence, provider);

  return { evidence, themes, insights };
}
