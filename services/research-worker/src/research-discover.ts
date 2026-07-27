import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  findRepositoryRoot,
  getTinyFishEnv,
  loadRootEnv
} from "@zepto/shared-config";
import { runResearchDiscovery } from "./free-research-discovery.js";
import { TinyFishClient } from "./tinyfish-client.js";

export type ResearchDiscoveryOptions = {
  queryPackPath: string;
  provider: "tinyfish";
  limitQueries: number;
  outputPath?: string;
};

export function parseResearchDiscoveryOptions(
  args: readonly string[]
): ResearchDiscoveryOptions {
  const normalized = args[0] === "--" ? args.slice(1) : [...args];
  const root = findRepositoryRoot() ?? process.cwd();
  let queryPackPath: string | undefined;
  let provider: "tinyfish" | undefined;
  let limitQueries = 8;
  let outputPath: string | undefined;
  let reportOnly = false;
  for (let index = 0; index < normalized.length; index += 1) {
    const argument = normalized[index];
    const value = normalized[index + 1];
    if (argument === "--query-pack" && value) {
      queryPackPath = resolve(root, value);
      index += 1;
    } else if (argument === "--provider" && value === "tinyfish") {
      provider = value;
      index += 1;
    } else if (argument === "--limit-queries" && value) {
      limitQueries = Number.parseInt(value, 10);
      index += 1;
    } else if (argument === "--output" && value) {
      outputPath = resolve(root, value);
      index += 1;
    } else if (argument === "--report-only") {
      reportOnly = true;
    } else {
      throw new Error(`Unsupported or incomplete argument: ${argument ?? ""}`);
    }
  }
  if (!queryPackPath || !provider) {
    throw new Error("--query-pack and --provider tinyfish are required.");
  }
  if (!Number.isInteger(limitQueries) || limitQueries < 1) {
    throw new Error("--limit-queries must be a positive integer.");
  }
  if (reportOnly === Boolean(outputPath)) {
    throw new Error("Use exactly one of --report-only or --output.");
  }
  return {
    queryPackPath,
    provider,
    limitQueries,
    ...(outputPath ? { outputPath } : {})
  };
}

async function main(): Promise<void> {
  loadRootEnv();
  const options = parseResearchDiscoveryOptions(process.argv.slice(2));
  const env = getTinyFishEnv();
  const client =
    env.TINYFISH_SEARCH_ENABLED && env.TINYFISH_API_KEY
      ? new TinyFishClient({
          apiKey: env.TINYFISH_API_KEY,
          timeoutMs: env.TINYFISH_REQUEST_TIMEOUT_MS,
          maxRetries: env.TINYFISH_MAX_RETRIES
        })
      : undefined;
  const result = await runResearchDiscovery({
    ...options,
    env,
    ...(client ? { client } : {})
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`${JSON.stringify({
      status: "FAILED",
      message:
        error instanceof Error
          ? error.message
          : "Research discovery failed."
    })}\n`);
    process.exitCode = 1;
  });
}
