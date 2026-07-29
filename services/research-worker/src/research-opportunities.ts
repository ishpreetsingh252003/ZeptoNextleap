import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findRepositoryRoot } from "@zepto/shared-config";
import { readFile } from "node:fs/promises";
import {
  parseBehaviourKnowledgeCsv,
  runOpportunityReport,
  type BehaviourKnowledgeDataset,
  type BehaviourKnowledgeRecord
} from "./research/opportunity-scoring.js";

export type OpportunityOptions = {
  inputPath: string;
  outputPath?: string;
  behaviourKnowledgePaths: Partial<Record<BehaviourKnowledgeDataset, string>>;
};

export function parseOpportunityOptions(args: readonly string[]): OpportunityOptions {
  const normalized = args[0] === "--" ? args.slice(1) : [...args];
  const root = findRepositoryRoot() ?? process.cwd();
  let inputPath: string | undefined;
  let outputPath: string | undefined;
  const behaviourKnowledgePaths: OpportunityOptions["behaviourKnowledgePaths"] = {};
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
    } else if (value && [
      "--behavioural-theories",
      "--commerce-insights",
      "--industry-case-studies",
      "--research-papers"
    ].includes(argument ?? "")) {
      const dataset: Record<string, BehaviourKnowledgeDataset> = {
        "--behavioural-theories": "behavioural_theories",
        "--commerce-insights": "commerce_insights",
        "--industry-case-studies": "industry_case_studies",
        "--research-papers": "research_papers"
      };
      behaviourKnowledgePaths[dataset[argument!]!] = resolve(root, value);
      index += 1;
    } else {
      throw new Error(`Unsupported or incomplete argument: ${argument ?? ""}`);
    }
  }
  if (!inputPath) throw new Error("--input is required.");
  if (reportOnly === Boolean(outputPath)) {
    throw new Error("Use exactly one of --report-only or --output.");
  }
  return {
    inputPath,
    behaviourKnowledgePaths,
    ...(outputPath ? { outputPath } : {})
  };
}

async function main(): Promise<void> {
  const options = parseOpportunityOptions(process.argv.slice(2));
  const behaviourKnowledge: BehaviourKnowledgeRecord[] = [];
  for (const [dataset, path] of Object.entries(options.behaviourKnowledgePaths)) {
    behaviourKnowledge.push(...parseBehaviourKnowledgeCsv(
      await readFile(path!, "utf8"),
      dataset as BehaviourKnowledgeDataset
    ));
  }
  const report = await runOpportunityReport({
    inputPath: options.inputPath,
    ...(options.outputPath ? { outputPath: options.outputPath } : {}),
    behaviourKnowledge
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`${JSON.stringify({
      status: "FAILED",
      message: error instanceof Error ? error.message : "Opportunity report failed."
    })}\n`);
    process.exitCode = 1;
  });
}
