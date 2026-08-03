import { NextResponse } from "next/server";
import { listRuns, getLatestRun } from "@/lib/run-history";

export async function GET() {
  console.log("[history] Loading latest run...");
  const runs = listRuns();
  const latest = getLatestRun();
  console.log(`[history] Returning ${runs.length} runs${latest ? ` (latest ${latest.id})` : ""}.`);
  return NextResponse.json({
    runs,
    latest,
  });
}
