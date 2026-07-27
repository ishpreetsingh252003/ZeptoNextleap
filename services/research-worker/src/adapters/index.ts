import type { SourceAdapter, SourceType } from "@zepto/research-contracts";
import type { ServerEnv } from "@zepto/shared-config";
import { FirecrawlAdapter } from "./firecrawl.js";
import { CsvImportAdapter } from "./csv-import.js";
import { CuratedPublicUrlAdapter } from "./curated-public-url.js";
import { GooglePlayAdapter } from "./google-play.js";
import { ManualTextAdapter } from "./manual-text.js";
import { PublicUrlAdapter } from "./public-url.js";
import { TavilyAdapter } from "./tavily.js";
import { SourceCollectionError } from "./errors.js";

type AdapterFactory = (env: ServerEnv) => SourceAdapter;

const adapterFactories: Partial<Record<SourceType, AdapterFactory>> = {
  firecrawl: (env) => new FirecrawlAdapter(env),
  csv_import: () => new CsvImportAdapter(),
  curated_public_url: (env) => new CuratedPublicUrlAdapter(env),
  google_play: (env) => new GooglePlayAdapter(env),
  public_url: (env) => new PublicUrlAdapter(env),
  manual_text: () => new ManualTextAdapter(),
  tavily_query: (env) => new TavilyAdapter(env)
};

export function getAdapter(type: SourceType, env: ServerEnv): SourceAdapter {
  const factory = adapterFactories[type];
  if (!factory) {
    const conditional = {
      app_store: ["APP_STORE_MANUAL_ONLY", "Third-party App Store reviews require an approved export or CSV import; automated scraping is disabled."],
      reddit: ["REDDIT_NOT_CONFIGURED", "Reddit automation is disabled until approved official API credentials and data-use terms are configured."],
      quora: ["QUORA_MANUAL_ONLY", "Quora automation is disabled; use an explicitly permitted public URL or CSV import."]
    } as const;
    const reason = type in conditional
      ? conditional[type as keyof typeof conditional]
      : ["UNSUPPORTED_SOURCE", `Source type ${type} is not available for automated collection.`] as const;
    throw new SourceCollectionError(reason[0], reason[1]);
  }
  return factory(env);
}

export { SourceCollectionError } from "./errors.js";
