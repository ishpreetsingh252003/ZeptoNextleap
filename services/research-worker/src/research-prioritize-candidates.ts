import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findRepositoryRoot } from "@zepto/shared-config";
import { runCandidatePrioritization } from "./research/candidate-prioritization.js";

export type CandidatePrioritizationOptions = {
  inputPath: string;
  outputPath?: string;
};

export function parseCandidatePrioritizationOptions(
  args: readonly string[]
): CandidatePrioritizationOptions {
  const normalized = args[0] === "--" ? args.slice(1) : [...args];
  const root = findRepositoryRoot() ?? process.cwd();
  let inputPath: string | undefined;
  let outputPath: string | undefined;
  let reportOnly = false;
  for (let index = 0; index < normalized.length; index += 1) {
    const argument = normalized[index];
    const value = normalized[index + 1];
    if (argument === "--input" && value) {
      inputPath = resolve(root, value);
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
  if (!inputPath) throw new Error("--input is required.");
  if (reportOnly === Boolean(outputPath)) {
    throw new Error("Use exactly one of --report-only or --output.");
  }
  return { inputPath, ...(outputPath ? { outputPath } : {}) };
}

async function main(): Promise<void> {
  const options = parseCandidatePrioritizationOptions(process.argv.slice(2));
  const report = await runCandidatePrioritization(options);
  const { shortlist, ...summary } = report;
  process.stdout.write(`${JSON.stringify({
    ...summary,
    shortlistSize: shortlist.length,
    shortlistCandidateIds: shortlist.map(({ candidate_id }) => candidate_id)
  }, null, 2)}\n`);
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`${JSON.stringify({
      status: "FAILED",
      message: error instanceof Error
        ? error.message
        : "Candidate prioritization failed."
    })}\n`);
    process.exitCode = 1;
  });
}
