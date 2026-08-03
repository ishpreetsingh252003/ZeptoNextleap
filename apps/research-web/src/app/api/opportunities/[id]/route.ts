import { NextResponse } from "next/server";
import { loadOpportunities, supportingThemes, toOpportunity } from "@/lib/opportunities";
import { resolveDataFile } from "@/lib/data-paths";
import { readFileSync } from "fs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const raw = loadOpportunities().find((opportunity) => opportunity.id === id);
  if (!raw) {
    return NextResponse.json({ message: `Opportunity ${id} was not found.` }, { status: 404 });
  }
  const reportFile = resolveDataFile("opportunities/opportunities.json");
  let report: unknown = null;
  if (reportFile) {
    try {
      report = JSON.parse(readFileSync(reportFile, "utf-8")).report;
    } catch (error) {
      console.error(`[opportunities] Could not parse bundled opportunity report (${reportFile}):`, error);
    }
  }
  const themes = supportingThemes();

  return NextResponse.json({
    report,
    opportunities: [toOpportunity(raw, themes)],
  });
}
