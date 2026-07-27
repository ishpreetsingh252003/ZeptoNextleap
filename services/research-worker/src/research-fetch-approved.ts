import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  findRepositoryRoot,
  getTinyFishEnv,
  loadRootEnv
} from "@zepto/shared-config";
import { runApprovedResearchFetch } from "./free-research-discovery.js";
import { TinyFishClient } from "./tinyfish-client.js";

export type ResearchFetchOptions = {
  inputPath: string;
  provider: "tinyfish";
  outputPath?: string;
};

export function parseResearchFetchOptions(
  args: readonly string[]
): ResearchFetchOptions {
  const normalized = args[0] === "--" ? args.slice(1) : [...args];
  const root = findRepositoryRoot() ?? process.cwd();
  let inputPath: string | undefined;
  let provider: "tinyfish" | undefined;
  let outputPath: string | undefined;
  let reportOnly = false;
  for (let index = 0; index < normalized.length; index += 1) {
    const argument = normalized[index];
    const value = normalized[index + 1];
    if (argument === "--input" && value) {
      inputPath = resolve(root, value);
      index += 1;
    } else if (argument === "--provider" && value === "tinyfish") {
      provider = value;
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
  if (!inputPath || !provider) {
    throw new Error("--input and --provider tinyfish are required.");
  }
  if (reportOnly === Boolean(outputPath)) {
    throw new Error("Use exactly one of --report-only or --output.");
  }
  return {
    inputPath,
    provider,
    ...(outputPath ? { outputPath } : {})
  };
}

async function main(): Promise<void> {
  loadRootEnv();
  const options = parseResearchFetchOptions(process.argv.slice(2));
  const env = getTinyFishEnv();
  const client =
    env.TINYFISH_FETCH_ENABLED && env.TINYFISH_API_KEY
      ? new TinyFishClient({
          apiKey: env.TINYFISH_API_KEY,
          timeoutMs: env.TINYFISH_REQUEST_TIMEOUT_MS,
          maxRetries: env.TINYFISH_MAX_RETRIES
        })
      : undefined;
  const result = await runApprovedResearchFetch({
    ...options,
    env,
    ...(client ? { client } : {})
  });
  process.stdout.write(`${JSON.stringify({
    status: result.status,
    approvedRows: result.approvedRows,
    urlsRequested: result.urlsRequested,
    documentsAccepted: result.documents.length,
    rejected: result.rejected,
    progress: result.progress,
    outputPath: result.outputPath
  }, null, 2)}\n`);
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`${JSON.stringify({
      status: "FAILED",
      message:
        error instanceof Error
          ? error.message
          : "Approved research fetch failed."
    })}\n`);
    process.exitCode = 1;
  });
}
