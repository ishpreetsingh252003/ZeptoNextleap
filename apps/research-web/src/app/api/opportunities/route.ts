import { NextResponse } from "next/server";
import { loadOpportunities, supportingThemes, toOpportunity, scoredReportSummary } from "@/lib/opportunities";
import { getLatestRun } from "@/lib/run-history";

export async function GET() {
  const scored = scoredReportSummary();
  const latestRun = getLatestRun();
  const themes = supportingThemes();
  const opportunities = loadOpportunities()
    .sort((a, b) => a.rank - b.rank)
    .map((raw) => toOpportunity(raw, themes));

  const report = scored
    ? {
        title: "Opportunity Scoring Report",
        project: latestRun?.config.company ? `${latestRun.config.company} NextLeap Project` : "Zepto NextLeap Graduation Project",
        date: latestRun?.timestamp ? new Date(latestRun.timestamp).toISOString().slice(0, 10) : "Current",
        status: "Scored from human-reviewed evidence via the deterministic opportunity-scoring engine",
        executiveSummary: `${scored.report.evidenceCount} reviewed-evidence records were scored into ${scored.report.topOpportunities.length} opportunities. ${scored.report.topOpportunities[0] ? `The leading candidate is ${scored.report.topOpportunities[0].opportunityTitle} (combined score ${scored.report.topOpportunities[0].combinedScore}).` : ""} No AI inference, live provider calls, scraping, or database alterations were performed.`,
      }
    : null;

  return NextResponse.json({
    report,
    opportunities,
  });
}
