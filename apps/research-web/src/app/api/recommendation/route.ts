import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { resolveDataFile } from "@/lib/data-paths";
import { loadOpportunities, supportingThemes, toOpportunity, scoredReportSummary, scoredOpportunities } from "@/lib/opportunities";
import { getLatestRun } from "@/lib/run-history";
import type { RecommendationReport } from "@/lib/api";

type RawRecommendation = Omit<RecommendationReport, "comparison"> & { comparisonTradeOffs: Record<string, string>; decisionScores: Record<string, number> };

const CONFIDENCE_LABEL: Record<string, "High" | "Med-High" | "Medium"> = {
  high: "High",
  med_high: "Med-High",
  medium: "Medium",
};

function buildFromScored(): RecommendationReport {
  const latest = scoredReportSummary()!;
  const opportunities = scoredOpportunities().sort((a, b) => a.rank - b.rank);
  const hero = opportunities[0]!;
  const latestRun = getLatestRun();
  const sources = Object.keys(latest.report.sourceDistribution ?? {});
  const rawCombined = new Map(latest.report.topOpportunities.map((o) => [o.opportunityId, o.combinedScore]));
  const maxCombined = Math.max(...latest.report.topOpportunities.map((o) => o.combinedScore), 1);
  const weighted = (id: string) => Math.round((Math.max(0.5, ((rawCombined.get(id) ?? 0) / maxCombined) * 5)) * 100) / 100;
  const heroRisks = (hero.evidenceGaps ?? []).slice(0, 3);

  return {
    report: {
      title: "MVP Recommendation Report",
      project: latestRun?.config.company ? `${latestRun.config.company} NextLeap Project` : "Zepto NextLeap Graduation Project",
      date: latestRun?.timestamp ? new Date(latestRun.timestamp).toISOString().slice(0, 10) : "Current",
      status: "Final Research Phase — Consolidated Evidence & Behaviour Knowledge Base Recommendation",
      source: "Generated from the deterministic opportunity-scoring engine over the human-reviewed evidence corpus",
    },
    hero: {
      id: hero.id,
      title: hero.title,
      status: "Recommended for Implementation",
      mvpRole: hero.mvpRole,
      weightedScore: weighted(hero.id),
      weightedMax: 5,
      combinedScore: hero.combinedScore,
      combinedMax: 100,
      confidence: CONFIDENCE_LABEL[hero.confidenceLevel] ?? "Medium",
      tagline: `Leads the scored opportunity set with ${hero.combinedScore}/100 (${hero.evidenceCount} reviewed records) — the strongest triangulation across evidence frequency, source diversity, and behavioural knowledge support.`,
    },
    whyThisWon: {
      businessValue: hero.businessImpact,
      userValue: hero.userImpact,
      behaviouralReasoning: `The evidence cluster is anchored in ${(hero.behaviouralTheories ?? []).join(", ") || "observed behavioural barriers"} that are directly addressed by this opportunity.`,
      evidence: {
        records: hero.evidenceCount,
        sourceTypes: Object.keys(hero.sourceBreakdown ?? {}).length,
        theories: hero.theoryMatches,
        caseStudies: hero.caseStudyMatches,
        papers: hero.academicMatches,
        commerceInsights: 0,
      },
    },
    supportingEvidence: {
      reviewsAnalysed: { primary: hero.evidenceCount, corpus: latest.report.evidenceCount },
      sourceTypes: sources.length > 0 ? sources : ["Public sources"],
      theories: hero.theoryMatches,
      caseStudies: hero.caseStudyMatches,
      papers: hero.academicMatches,
      commerceInsights: 0,
    },
    assumptions: [
      "Every evidence item is human-reviewed and retained before scoring.",
      "Scores are produced by a deterministic engine — no AI inference or live provider calls.",
      "Behavioural knowledge comes from the curated research/behavior/ knowledge base.",
      "No scraping, third-party APIs, or database alterations are performed by this pipeline.",
    ],
    outlook: {
      expectedUserOutcome: hero.userImpact,
      expectedBusinessOutcome: hero.businessImpact,
      primaryMetric: "Share of monthly active customers purchasing from a lifetime-new category.",
      guardrailMetric: "Post-delivery issue/refund request rate (must remain below 3%).",
      risks: (heroRisks.length > 0 ? heroRisks : ["Evidence base may still be thin for high-confidence product decisions."]).map((gap, index) => ({
        risk: gap,
        likelihood: index === 0 ? "Medium" : "Low",
        impact: index === 0 ? "Medium" : "Low",
        mitigation: "Expand evidence collection across additional source types and categories before final build decisions.",
      })),
    },
    comparison: opportunities.map((opportunity) => ({
      ...toOpportunity(opportunity, supportingThemes()),
      weightedScore: weighted(opportunity.id),
      tradeOff:
        opportunity.rank === 1
          ? "Wins on every weighted dimension — the strongest triangulation across evidence, theory, and knowledge support."
          : `Score ${opportunity.combinedScore} from ${opportunity.evidenceCount} reviewed records; narrower evidence than the primary candidate.`,
    })),
  };
}

export async function GET() {
  console.log("[recommendation] Loading latest run...");
  let scored: ReturnType<typeof scoredReportSummary> | null = null;
  try {
    scored = scoredReportSummary();
  } catch (error) {
    console.error("[recommendation] Could not load the latest scored report — falling back to bundled data:", error);
  }
  if (scored) {
    console.log("[recommendation] Returning scored recommendation.");
    return NextResponse.json(buildFromScored() satisfies RecommendationReport);
  }
  console.log("[recommendation] No scored run found — falling back to bundled data...");
  const file = resolveDataFile("recommendation/recommendation.json");
  if (!file) {
    console.log("[recommendation] Bundled recommendation data is missing.");
    return NextResponse.json({ message: "Recommendation output is not available." }, { status: 404 });
  }
  let raw: RawRecommendation;
  try {
    raw = JSON.parse(readFileSync(file, "utf-8")) as RawRecommendation;
  } catch (error) {
    console.error(`[recommendation] Could not parse bundled recommendation (${file}):`, error);
    return NextResponse.json({ message: "Recommendation output is not available." }, { status: 404 });
  }
  const themes = supportingThemes();

  const comparison = loadOpportunities()
    .sort((a, b) => a.rank - b.rank)
    .map((opportunity) => ({
      ...toOpportunity(opportunity, themes),
      weightedScore: raw.decisionScores[opportunity.id] ?? 0,
      tradeOff: raw.comparisonTradeOffs[opportunity.id] ?? "",
    }));

  const { comparisonTradeOffs: _omitTradeOffs, decisionScores: _omitScores, ...payload } = raw;
  console.log("[recommendation] Returning bundled recommendation.");
  return NextResponse.json({ ...payload, comparison } satisfies RecommendationReport);
}
