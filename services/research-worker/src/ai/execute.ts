import { AiProviderError } from "./errors.js";
import {
  classifyJsonFailure,
  classifyProviderFailure,
  classifyValidationFailure,
  type StructuredAttemptDiagnostic
} from "./failure-diagnostics.js";
import type { AiProviderName } from "@zepto/shared-config";
import type { AiStageRequest, AiStageResult } from "./types.js";

const CORRECTION = "The previous response was invalid JSON or failed schema or evidence validation. Return one corrected JSON object only.";

export async function executeStructuredRequest<T>(options: {
  provider: AiProviderName;
  model: string;
  request: AiStageRequest<T>;
  invoke: (userPrompt: string) => Promise<string>;
}): Promise<AiStageResult<T>> {
  const attemptDiagnostics: StructuredAttemptDiagnostic[] = [];
  for (let attemptCount = 1; attemptCount <= 2; attemptCount += 1) {
    let raw: string;
    try {
      raw = await options.invoke(`${options.request.userPrompt}${attemptCount > 1 ? `\n\n${CORRECTION}` : ""}`);
    } catch (error) {
      attemptDiagnostics.push(classifyProviderFailure(error, attemptCount));
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch (error) {
      attemptDiagnostics.push(classifyJsonFailure(raw, error, attemptCount));
      continue;
    }

    try {
      const data = options.request.validate(parsed);
      return { data, provider: options.provider, model: options.model, attemptCount };
    } catch (error) {
      attemptDiagnostics.push(classifyValidationFailure(error, parsed, attemptCount));
    }
  }
  throw new AiProviderError(
    options.provider,
    2,
    options.request.stage,
    attemptDiagnostics
  );
}
