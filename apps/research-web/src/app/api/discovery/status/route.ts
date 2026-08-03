import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { resolveInput, repoDir, latestFileIn } from "@/lib/repo-paths";
import { getLatestRun } from "@/lib/run-history";

export async function GET() {
  console.log("[discovery] Resolving research corpus status...");
  const evidencePath = resolveInput("research/pilot/evidence-items.csv", "pilot/evidence-items.csv");
  const sourceLogPath = resolveInput("research/pilot/source-log.csv", "pilot/source-log.csv");
  const queryPackPath = resolveInput("research/templates/category-research-query-pack.csv", "templates/category-research-query-pack.csv");

  const outputFiles = [];
  let evidenceCount = 0;
  let sourceCount = 0;
  let queryCount = 0;

  const countLines = (path: string | null): number => {
    if (!path) return 0;
    try {
      return Math.max(0, readFileSync(path, "utf-8").trim().split("\n").length - 1);
    } catch (error) {
      console.error(`[discovery] Could not read ${path}:`, error);
      return 0;
    }
  };

  if (evidencePath) {
    outputFiles.push("research/pilot/evidence-items.csv");
    evidenceCount = countLines(evidencePath);
  }
  if (sourceLogPath) {
    outputFiles.push("research/pilot/source-log.csv");
    sourceCount = countLines(sourceLogPath);
  }
  if (queryPackPath) {
    outputFiles.push("research/templates/category-research-query-pack.csv");
    queryCount = countLines(queryPackPath);
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

  const latestRun = getLatestRun();

  return NextResponse.json({
    available: outputFiles.length > 0,
    outputFiles,
    generatedOutputs,
    evidenceCount,
    sourceCount,
    queryCount,
    latestRun: latestRun
      ? {
          id: latestRun.id,
          timestamp: latestRun.timestamp,
          mode: latestRun.mode,
          reviewsCollected: latestRun.reviewsCollected,
          opportunitiesFound: latestRun.opportunitiesFound,
          themesFound: latestRun.themesFound,
          qualityLevel: latestRun.qualityLevel,
        }
      : null,
    lastUpdated: new Date().toISOString(),
  });
}
