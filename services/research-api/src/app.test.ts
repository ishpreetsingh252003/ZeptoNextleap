import { describe, expect, it } from "vitest";
import { getServerEnv } from "@zepto/shared-config";
import { buildHealthStatus } from "./app.js";

describe("provider-neutral health status", () => {
  it("reports selected-provider and optional-source configuration without secret fields", () => {
    const env = getServerEnv({
      DATABASE_URL: "postgresql://local/test",
      AI_PROVIDER: "gemini",
      GEMINI_MODEL: "gemini-model",
      TAVILY_API_KEY: "secret",
      APIFY_API_TOKEN: "secret",
      APIFY_GOOGLE_PLAY_ACTOR_ID: "actor"
    });
    const health = buildHealthStatus(env, false);

    expect(health).toEqual({
      database: { configured: true, reachable: false },
      ai: { selectedProvider: "gemini", configured: false, modelConfigured: true },
      optionalSources: { tavilyConfigured: true, firecrawlConfigured: false, apifyConfigured: true }
    });
    expect(JSON.stringify(health)).not.toContain("secret");
    expect(JSON.stringify(health)).not.toContain("GEMINI_API_KEY");
  });
});
