import type { SourceAdapter, SourceType } from "@zepto/research-contracts";
import type { ServerEnv } from "@zepto/shared-config";
import { FirecrawlAdapter } from "./firecrawl.js";
import { GooglePlayAdapter } from "./google-play.js";
import { ManualTextAdapter } from "./manual-text.js";
import { PublicUrlAdapter } from "./public-url.js";
import { TavilyAdapter } from "./tavily.js";
import { SourceCollectionError } from "./errors.js";

type AdapterFactory = (env: ServerEnv) => SourceAdapter;

const adapterFactories: Partial<Record<SourceType, AdapterFactory>> = {
  firecrawl: (env) => new FirecrawlAdapter(env),
  google_play: (env) => new GooglePlayAdapter(env),
  public_url: (env) => new PublicUrlAdapter(env),
  manual_text: () => new ManualTextAdapter(),
  tavily_query: (env) => new TavilyAdapter(env)
};

export function getAdapter(type: SourceType, env: ServerEnv): SourceAdapter {
  const factory = adapterFactories[type];
  if (!factory) throw new SourceCollectionError("UNSUPPORTED_SOURCE", `Source type ${type} is not available for automated collection.`);
  return factory(env);
}

export { SourceCollectionError } from "./errors.js";
