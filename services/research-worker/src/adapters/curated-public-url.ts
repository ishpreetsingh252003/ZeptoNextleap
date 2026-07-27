import type {
  PublicDocument,
  SourceAdapter
} from "@zepto/research-contracts";
import type { ServerEnv } from "@zepto/shared-config";
import { SourceCollectionError } from "./errors.js";
import { PublicUrlAdapter } from "./public-url.js";

type CollectOne = (
  url: string,
  input: Parameters<SourceAdapter["collect"]>[0],
  context: Parameters<SourceAdapter["collect"]>[1]
) => Promise<PublicDocument[]>;

function canonicalExplicitUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SourceCollectionError("INVALID_URL", "Enter a valid public URL.");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new SourceCollectionError(
      "UNSUPPORTED_PROTOCOL",
      "Only explicit public HTTP(S) URLs are supported."
    );
  }
  const hostname = url.hostname.toLocaleLowerCase("en");
  if (
    hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname === "0.0.0.0"
    || hostname === "::1"
    || /^127\./.test(hostname)
    || /^10\./.test(hostname)
    || /^192\.168\./.test(hostname)
    || /^169\.254\./.test(hostname)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  ) {
    throw new SourceCollectionError(
      "PRIVATE_ADDRESS_BLOCKED",
      "Private and local URLs are not permitted."
    );
  }
  url.hash = "";
  return url.href;
}

export class CuratedPublicUrlAdapter implements SourceAdapter {
  readonly type = "curated_public_url" as const;

  constructor(
    env: ServerEnv,
    private readonly collectOne: CollectOne = async (url, input, context) =>
      new PublicUrlAdapter(env).collect(
        { ...input, sourceType: "public_url", urls: undefined, urlOrQuery: url },
        { ...context, maxRecords: 1 }
      )
  ) {}

  async collect(
    input: Parameters<SourceAdapter["collect"]>[0],
    context: Parameters<SourceAdapter["collect"]>[1]
  ): Promise<PublicDocument[]> {
    if (!input.urls?.length || !input.sourceLabel) {
      throw new SourceCollectionError(
        "CURATED_URL_INPUT_REQUIRED",
        "Explicit public URLs and a declared source label are required."
      );
    }
    const explicitUrls = [...new Set(input.urls.map(canonicalExplicitUrl))];
    const limit = Math.min(explicitUrls.length, input.maxRecords, context.maxRecords);
    const documents: PublicDocument[] = [];
    for (const url of explicitUrls.slice(0, limit)) {
      const collected = await this.collectOne(url, input, {
        ...context,
        maxRecords: 1
      });
      if (collected.length !== 1) {
        throw new SourceCollectionError(
          "CURATED_URL_INVALID_RESULT",
          "Each explicit URL must produce exactly one normalized document."
        );
      }
      documents.push({
        ...collected[0]!,
        sourceType: this.type,
        sourceName: input.sourceLabel,
        platform: input.sourceLabel,
        policyNote: `${collected[0]!.policyNote} URL was explicitly supplied; no links or domains were crawled.`,
        sourceMetadata: {
          ...collected[0]!.sourceMetadata,
          sourceLabel: input.sourceLabel,
          sourceUrlAvailable: true
        }
      });
    }
    return documents;
  }
}
