import { NextResponse } from "next/server";
import { loadSynthesisSources, buildSynthesis, type SynthesisPayload } from "@/lib/synthesis";
import { latestSynthesis } from "@/lib/run-history";

export async function GET() {
  const latest = latestSynthesis();
  if (latest) {
    return NextResponse.json(latest.payload as SynthesisPayload);
  }
  const report = buildSynthesis(loadSynthesisSources());
  return NextResponse.json(report);
}
