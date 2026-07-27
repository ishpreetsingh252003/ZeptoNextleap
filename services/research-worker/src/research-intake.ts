import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findRepositoryRoot } from "@zepto/shared-config";
import { runResearchIntake } from "./category-evidence-intake.js";

export type ResearchIntakeOptions = {
  inputPaths: string[];
  outputPath?: string;
};

export function parseResearchIntakeOptions(
  args: readonly string[]
): ResearchIntakeOptions {
  const normalized = args[0] === "--" ? args.slice(1) : [...args];
  const inputPaths: string[] = [];
  let outputPath: string | undefined;
  let reportOnly = false;
  const baseDirectory = findRepositoryRoot() ?? process.cwd();

  for (let index = 0; index < normalized.length; index += 1) {
    const argument = normalized[index];
    if (argument === "--input") {
      const value = normalized[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--input requires a CSV file path.");
      }
      inputPaths.push(resolve(baseDirectory, value));
      index += 1;
    } else if (argument === "--output") {
      const value = normalized[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--output requires a file path.");
      }
      outputPath = resolve(baseDirectory, value);
      index += 1;
    } else if (argument === "--report-only") {
      reportOnly = true;
    } else {
      throw new Error(`Unsupported argument: ${argument ?? ""}`);
    }
  }
  if (inputPaths.length === 0) {
    throw new Error("At least one --input CSV file is required.");
  }
  if (reportOnly && outputPath) {
    throw new Error("--report-only cannot be combined with --output.");
  }
  if (!reportOnly && !outputPath) {
    throw new Error("Use --report-only or provide an explicit --output path.");
  }
  return { inputPaths, ...(outputPath ? { outputPath } : {}) };
}

async function main(): Promise<void> {
  const options = parseResearchIntakeOptions(process.argv.slice(2));
  const result = await runResearchIntake(options);
  process.stdout.write(`${JSON.stringify({
    ...result.report,
    outputWritten: Boolean(result.outputPath)
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
          : "Research intake failed."
    })}\n`);
    process.exitCode = 1;
  });
}
