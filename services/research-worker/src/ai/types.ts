import type { AnalysisStage } from "@zepto/research-contracts";
import type { AiProviderName } from "@zepto/shared-config";

export type AiStageRequest<T> = {
  stage: AnalysisStage;
  promptVersion: string;
  schemaName: string;
  systemPrompt: string;
  userPrompt: string;
  jsonSchema: Record<string, unknown>;
  validate: (value: unknown) => T;
};

export type AiStageResult<T> = {
  data: T;
  provider: AiProviderName;
  model: string;
  attemptCount: number;
};

export interface AiProvider {
  readonly provider: AiProviderName;
  readonly model: string;
  generateStructured<T>(request: AiStageRequest<T>): Promise<AiStageResult<T>>;
}
