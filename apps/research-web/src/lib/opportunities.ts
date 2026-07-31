import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { resolveInput, repoDir, latestFileIn } from "@/lib/repo-paths";
import { resolveDataFile } from "@/lib/data-paths";
import type { OpportunityReport } from "@zepto/research-worker/dist/research/scoring/types";
import type { Opportunity } from "@/lib/api";

type RawOpportunity = {
  id: string;
  rank: number;
  title: string;
  headline: string;
  combinedScore: number;
  confidenceLevel: "high" | "medium";
  mvpRole: string;
  evidenceCount: number;
  sourceBreakdown: Record<string, number>;
  theoryMatches: number;
  caseStudyMatches: number;
  academicMatches: number;
  problem: string;
  categories: string[];
  businessImpact: string;
  userImpact: string;
  behaviouralTheories: string[];
  industrySupport: string[];
  academicSupport: string[];
  evidenceGaps: string[];
  recommendedMvpFit: string;
  proposedUserFlow?: string[];
  successMetrics?: string[];
};

const CONFIDENCE_LABEL: Record<string, "High" | "Med-High" | "Medium"> = {
  high: "High",
  med_high: "Med-High",
  medium: "Medium",
};

const THEME_LABELS: Record<string, string> = {
  trust: "Trust & institutional signals",
  risk: "Perceived risk reduction",
  habit: "Habit formation",
  trial: "Trial & experimentation",
  repeat_purchase: "Repeat purchase loops",
  abandonment: "Abandonment & switching costs",
  social_proof: "Social proof",
  decision_fatigue: "Decision fatigue",
};

const FLAG_LABELS: Record<string, string> = {
  SINGLE_SOURCE: "Evidence rests on a single source type",
  LOW_SOURCE_DIVERSITY: "Low source diversity across the evidence base",
  CATEGORY_IMBALANCE: "Evidence is concentrated in a single category",
  INTERVIEW_GAP: "No qualitative interview evidence yet",
  NO_POSITIVE_COUNTEREVIDENCE: "No positive counter-evidence recorded",
  BEHAVIOURAL_RESEARCH_GAP: "No matching behavioural knowledge record",
  KNOWLEDGE_THEME_UNMATCHED: "Behavioural knowledge exists but themes are unmatched",
};

const ROLE_LABELS: Record<string, string> = {
  opp_quality_assurance: "PRIMARY MVP",
  opp_support_refund: "SUPPORTING MVP",
  opp_fulfillment_control: "SUPPORTING MVP",
  opp_freshness_guarantee: "SUPPORTING MVP",
  opp_category_onboarding: "SUPPORTING MVP",
};

function evidenceStrength(combinedScore: number, evidenceCount: number): Opportunity["evidenceStrength"] {
  if (combinedScore >= 80 && evidenceCount >= 20) return "Very Strong";
  if (combinedScore >= 70 || evidenceCount >= 20) return "Strong";
  if (evidenceCount >= 10) return "Moderate";
  return "Emerging";
}

export function latestScoredReport(): { report: OpportunityReport; runId: string | null } | null {
  const dir = repoDir("research/opportunity-output");
  if (!dir) return null;
  const file = latestFileIn(dir, { suffix: "-opportunities.json" });
  if (!file) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf-8")) as OpportunityReport;
    const runId = file.split(/[\\/]/).pop()?.replace("-opportunities.json", "") ?? null;
    return { report: parsed, runId };
  } catch {
    return null;
  }
}

function buildBehaviouralTheories(real: boolean, themes: string[]): string[] {
  return real
    ? themes.map((theme) => THEME_LABELS[theme] ?? theme)
    : [];
}

export function scoredToRaw(score: OpportunityReport["topOpportunities"][number], rank: number): RawOpportunity {
  const id = score.opportunityId;
  const categories = Object.entries(score.categoryDistribution)
    .sort((a, b) => b[1] - a[1])
    .map(([category]) => category);
  const themeNames = score.behaviourKnowledgeThemes ?? [];
  return {
    id,
    rank,
    title: score.opportunityTitle,
    headline: score.opportunityTitle,
    combinedScore: Math.min(100, score.combinedScore),
    confidenceLevel: score.confidenceLevel === "high" ? "high" : "medium",
    mvpRole: ROLE_LABELS[id] ?? (rank === 1 ? "PRIMARY MVP" : "SUPPORTING MVP"),
    evidenceCount: score.evidenceCount,
    sourceBreakdown: score.sourceDistribution ?? {},
    theoryMatches: score.behaviourKnowledgeSupportCount,
    caseStudyMatches: score.industrySupportCount,
    academicMatches: score.researchSupportCount,
    problem: `Evidence across ${score.evidenceCount} reviewed records points to ${categories.length > 0 ? categories.slice(0, 3).join(", ") : "core"} purchase barriers the current experience does not fully address.`,
    categories,
    businessImpact: `Addresses the strongest evidence cluster (score ${score.score}, ${score.evidenceCount} records) to expand basket and repeat-purchase behaviour.`,
    userImpact: `Reduces friction behind ${themeNames.length > 0 ? themeNames.map((t) => THEME_LABELS[t] ?? t).join(", ") : "the observed behavioural barriers"}, removing the reason customers stop short of a purchase.`,
    behaviouralTheories: buildBehaviouralTheories(true, themeNames),
    industrySupport: [],
    academicSupport: [],
    evidenceGaps: (score.evidenceGaps ?? []).concat((score.weakEvidenceFlags ?? []).map((flag) => FLAG_LABELS[flag] ?? flag)),
    recommendedMvpFit: `Recommended ${ROLE_LABELS[id] ?? (rank === 1 ? "PRIMARY MVP" : "SUPPORTING MVP")} — ${score.opportunityTitle}.`,
    proposedUserFlow: [
      `Expose the ${score.opportunityTitle.toLowerCase()} promise at the decision point with visible, verifiable cues.`,
      "Re-affirm the commitment during checkout for first-time trial items.",
      "Provide a single-tap resolution entrypoint in order history when expectations are not met.",
    ],
    successMetrics: [
      "Primary Metric: share of monthly active customers purchasing from a lifetime-new category.",
      "Guardrail Metric: post-delivery issue/refund request rate (must remain below 3%).",
    ],
  };
}

export function scoredOpportunities(): RawOpportunity[] {
  const latest = latestScoredReport();
  if (!latest) return [];
  return latest.report.topOpportunities
    .map((score, index) => scoredToRaw(score, index + 1))
    .sort((a, b) => a.rank - b.rank);
}

export function scoredReportSummary(): { report: OpportunityReport; runId: string | null } | null {
  return latestScoredReport();
}

export function loadOpportunities(): RawOpportunity[] {
  const scored = scoredOpportunities();
  if (scored.length > 0) return scored;
  const file = resolveDataFile("opportunities/opportunities.json");
  if (!file) return [];
  const parsed = JSON.parse(readFileSync(file, "utf-8")) as { opportunities: RawOpportunity[] };
  return parsed.opportunities;
}

export function supportingThemes(): Map<string, { theme: string; count: number }[]> {
  const themes = new Map<string, Map<string, number>>();
  for (const file of [
    "research/behavior/behavioural-theories.csv",
    "research/behavior/commerce-insights.csv",
    "research/behavior/industry-case-studies.csv",
    "research/behavior/research-papers.csv",
  ]) {
    const path = resolveInput(file, `behavior/${file.split("/").pop()}`);
    if (!path) continue;
    const rows = parse(readFileSync(path, "utf-8"), { columns: true, skip_empty_lines: true, bom: true, trim: true }) as Record<string, string>[];
    for (const row of rows) {
      for (const opportunityId of (row.opportunity_ids ?? "").split(";").map((o) => o.trim()).filter(Boolean)) {
        const entry = themes.get(opportunityId) ?? new Map<string, number>();
        entry.set(row.theme, (entry.get(row.theme) ?? 0) + 1);
        themes.set(opportunityId, entry);
      }
    }
  }
  return new Map([...themes.entries()].map(([id, counts]) => [
    id,
    [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([theme, count]) => ({ theme, count })),
  ]));
}

export function toOpportunity(raw: RawOpportunity, themes: Map<string, { theme: string; count: number }[]>): Opportunity {
  return {
    ...raw,
    supportingThemes: themes.get(raw.id) ?? [],
    confidence: CONFIDENCE_LABEL[raw.confidenceLevel] ?? "Medium",
    evidenceStrength: evidenceStrength(raw.combinedScore, raw.evidenceCount),
    support: {
      theories: raw.theoryMatches,
      caseStudies: raw.caseStudyMatches,
      papers: raw.academicMatches,
    },
  };
}
