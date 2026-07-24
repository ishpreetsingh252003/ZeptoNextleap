import type {
  Evidence,
  Insight,
  PublicDocument,
  Theme
} from "@zepto/research-contracts";
import type { AiProvider } from "./ai/types.js";
import {
  defaultAnalysisScaleConfig,
  runScaledAnalysisPipeline,
  type AnalysisScaleConfig
} from "./analysis-scale.js";

export type AnalysisPipelineResult = {
  evidence: Evidence[];
  themes: Theme[];
  insights: Insight[];
};

export async function runAnalysisPipeline(
  documents: readonly PublicDocument[],
  provider: AiProvider,
  config: AnalysisScaleConfig = defaultAnalysisScaleConfig
): Promise<AnalysisPipelineResult> {
  const { evidence, themes, insights } = await runScaledAnalysisPipeline(
    documents,
    provider,
    config
  );
  return { evidence, themes, insights };
}
