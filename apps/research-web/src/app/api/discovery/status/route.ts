import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { resolveInput, repoDir, latestFileIn } from "@/lib/repo-paths";

export async function GET() {
  const evidencePath = resolveInput("research/pilot/evidence-items.csv", "pilot/evidence-items.csv");
  const sourceLogPath = resolveInput("research/pilot/source-log.csv", "pilot/source-log.csv");
  const queryPackPath = resolveInput("research/templates/category-research-query-pack.csv", "templates/category-research-query-pack.csv");

  const outputFiles = [];
  let evidenceCount = 0;
  let sourceCount = 0;
  let queryCount = 0;

  if (evidencePath) {
    outputFiles.push("research/pilot/evidence-items.csv");
    evidenceCount = Math.max(0, readFileSync(evidencePath, "utf-8").trim().split("\n").length - 1);
  }
  if (sourceLogPath) {
    outputFiles.push("research/pilot/source-log.csv");
    sourceCount = Math.max(0, readFileSync(sourceLogPath, "utf-8").trim().split("\n").length - 1);
  }
  if (queryPackPath) {
    outputFiles.push("research/templates/category-research-query-pack.csv");
    queryCount = Math.max(0, readFileSync(queryPackPath, "utf-8").trim().split("\n").length - 1);
  }

  const discoveryDir = repoDir("research/discovery-output");
  const opportunityDir = repoDir("research/opportunity-output");
  const generatedOutputs = [];
  if (discoveryDir) {
    const prioritized = latestFileIn(discoveryDir, { suffix: "-prioritized.csv" });
    if (prioritized) generatedOutputs.push("research/discovery-output/" + prioritized.split(/[\\/]/).pop());
  }
  if (opportunityDir) {
    const report = latestFileIn(opportunityDir, { suffix: "-opportunities.json" });
    if (report) generatedOutputs.push("research/opportunity-output/" + report.split(/[\\/]/).pop());
  }

  return NextResponse.json({
    available: outputFiles.length > 0,
    outputFiles,
    generatedOutputs,
    evidenceCount,
    sourceCount,
    queryCount,
    lastUpdated: new Date().toISOString(),
  });
}
