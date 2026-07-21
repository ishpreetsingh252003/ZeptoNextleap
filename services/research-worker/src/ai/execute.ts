import { AiProviderError } from "./errors.js";
import type { AiProviderName } from "@zepto/shared-config";
import type { AiStageRequest, AiStageResult } from "./types.js";

const CORRECTION = "The previous response was invalid JSON or failed schema or evidence validation. Return one corrected JSON object only.";

export async function executeStructuredRequest<T>(options: {
  provider: AiProviderName;
  model: string;
  request: AiStageRequest<T>;
  invoke: (userPrompt: string) => Promise<string>;
}): Promise<AiStageResult<T>> {
  for (let attemptCount = 1; attemptCount <= 2; attemptCount += 1) {
    try {
      const raw = await options.invoke(`${options.request.userPrompt}${attemptCount > 1 ? `\n\n${CORRECTION}` : ""}`);
      const data = options.request.validate(JSON.parse(raw) as unknown);
      return { data, provider: options.provider, model: options.model, attemptCount };
    } catch {
      // Raw model output and source-bearing validation details are intentionally not logged.
    }
  }
  throw new AiProviderError(options.provider, 2, options.request.stage);
}
