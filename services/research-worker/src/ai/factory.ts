import { EnvironmentConfigurationError, getSelectedAiConfiguration, type ServerEnv } from "@zepto/shared-config";
import { AiConfigurationError } from "./errors.js";
import { GeminiProvider } from "./gemini.js";
import { GroqProvider } from "./groq.js";
import type { AiProvider } from "./types.js";

export function createAiProvider(env: ServerEnv): AiProvider {
  try {
    const selected = getSelectedAiConfiguration(env);
    return selected.provider === "gemini"
      ? new GeminiProvider(selected.model, selected.apiKey)
      : new GroqProvider(selected.model, selected.apiKey);
  } catch (error) {
    if (error instanceof EnvironmentConfigurationError) throw new AiConfigurationError(error.message);
    throw error;
  }
}
