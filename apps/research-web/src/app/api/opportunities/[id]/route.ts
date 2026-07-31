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
  const report = reportFile ? JSON.parse(readFileSync(reportFile, "utf-8")).report : null;
  const themes = supportingThemes();

  return NextResponse.json({
    report,
    opportunities: [toOpportunity(raw, themes)],
  });
}
