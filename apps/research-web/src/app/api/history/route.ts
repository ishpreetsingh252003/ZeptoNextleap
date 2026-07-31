import { NextResponse } from "next/server";
import { listRuns, getLatestRun } from "@/lib/run-history";

export async function GET() {
  return NextResponse.json({
    runs: listRuns(),
    latest: getLatestRun(),
  });
}
