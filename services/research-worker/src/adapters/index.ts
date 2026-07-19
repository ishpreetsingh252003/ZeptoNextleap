import type { SourceAdapter, SourceType } from "@zepto/research-contracts";
import type { ServerEnv } from "@zepto/shared-config";
import { GooglePlayAdapter } from "./google-play.js";
import { ManualTextAdapter } from "./manual-text.js";
import { PublicUrlAdapter } from "./public-url.js";
import { TavilyAdapter } from "./tavily.js";
import { SourceCollectionError } from "./errors.js";

export function getAdapter(type: SourceType, env: ServerEnv): SourceAdapter {
  const adapters: Partial<Record<SourceType, SourceAdapter>> = {
    google_play: new GooglePlayAdapter(env),
    public_url: new PublicUrlAdapter(env),
    manual_text: new ManualTextAdapter(),
    tavily_query: new TavilyAdapter(env)
  };
  const adapter = adapters[type];
  if (!adapter) throw new SourceCollectionError("UNSUPPORTED_SOURCE", `Source type ${type} is not available for automated collection.`);
  return adapter;
}

export { SourceCollectionError } from "./errors.js";
