import type { AiProviderName } from "@zepto/shared-config";
import type { StructuredAttemptDiagnostic } from "./failure-diagnostics.js";

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
    stage: string,
    public readonly attemptDiagnostics: readonly StructuredAttemptDiagnostic[] = []
  ) {
    super(`${provider} could not produce a valid structured response for ${stage} after ${attemptCount} attempts.`);
    this.name = "AiProviderError";
  }
}
