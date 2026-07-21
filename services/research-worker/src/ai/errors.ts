import type { AiProviderName } from "@zepto/shared-config";

export class AiConfigurationError extends Error {
  readonly code = "AI_PROVIDER_NOT_CONFIGURED";

  constructor(message: string) {
    super(message);
    this.name = "AiConfigurationError";
  }
}

export class AiProviderError extends Error {
  readonly code = "AI_STAGE_FAILED";

  constructor(
    public readonly provider: AiProviderName,
    public readonly attemptCount: number,
    stage: string
  ) {
    super(`${provider} could not produce a valid structured response for ${stage} after ${attemptCount} attempts.`);
    this.name = "AiProviderError";
  }
}
