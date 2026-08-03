import { NextResponse } from "next/server";
import { loadSynthesisSources, buildSynthesis, type SynthesisPayload } from "@/lib/synthesis";
import { latestSynthesis } from "@/lib/run-history";

export async function GET() {
  console.log("[insights] Loading latest run...");
  let latest: { runId: string; payload: unknown } | null = null;
  try {
    latest = latestSynthesis();
  } catch (error) {
    console.error("[insights] Could not load the latest run — falling back to bundled data:", error);
  }
  if (latest) {
    console.log(`[insights] Returning synthesis from run ${latest.runId}.`);
    return NextResponse.json(latest.payload as SynthesisPayload);
  }
  console.log("[insights] No run synthesis found — falling back to bundled data...");
  const report = buildSynthesis(loadSynthesisSources());
  console.log("[insights] Returning bundled insights.");
  return NextResponse.json(report);
}
