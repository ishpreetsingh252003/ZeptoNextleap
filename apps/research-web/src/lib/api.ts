export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export type DiscoveryConfig = { objective: string; company: string; country: string; dateRange: string; minRating: number; maxReviews: number; sources: string[]; dateFrom: string | null; dateTo: string | null };
export type DiscoveryStatus = { available: boolean; outputFiles: string[]; generatedOutputs: string[]; evidenceCount: number; sourceCount: number; queryCount: number; lastUpdated: string | null };
export type DiscoveryStageId = "preparing" | "searching" | "collecting" | "scoring" | "opportunities" | "finalizing";
export type DiscoveryStageEvent = { type: "stage"; stage: DiscoveryStageId; status: "active" | "done"; message: string; at: string };
export type DiscoverySourceDiagnostic = {
  source: string;
  label: string;
  unit: string;
  mode: "live" | "cached" | "dataset" | "coming_soon";
  requested: number;
  collected: number;
};
export type DiscoveryRunSummary = {
  totalSources: number;
  totalEvidence: number;
  matchedEvidence: number;
  queriesAvailable: number;
  reviewsCollected: number;
  mode: "live" | "cached" | "verified";
  opportunitiesFound: number;
  themesFound: number;
  behaviorSignals: number;
  highConfidence: number;
  sourceLabels: string[];
  qualityLevel: "Excellent" | "Good" | "Limited";
  qualityScore: number;
};
export type DiscoveryRunPayload = {
  runId: string;
  config: Pick<DiscoveryConfig, "company" | "country" | "dateRange" | "sources" | "objective" | "dateFrom" | "dateTo">;
  diagnostics: DiscoverySourceDiagnostic[];
  summary: DiscoveryRunSummary;
  evidence: {
    id: string;
    excerpt: string;
    paraphrase: string;
    category: string;
    mission: string;
    sentiment: string;
    certainty: string;
    behavioralCodes: string[];
    confidence: number;
    sourceType: string;
    sourceUrl: string;
    date: string;
    reviewerStatus: string;
    source: { title: string; platform: string; status: string } | null;
  }[];
  prioritization: {
    shortlist: { id: string; category: string; score: number; band: string; reasons: string[]; flags: string[]; action: string; url: string; snippet: string }[];
    bands: Record<string, number>;
    weakAreas: string[];
  } | null;
  opportunities: { id: string; title: string; combinedScore: number; evidenceCount: number; confidenceLevel: string }[];
  outputs: Record<string, string>;
  durationMs: number;
};
export type HistoryRun = {
  id: string;
  timestamp: string;
  status: "completed" | "failed";
  config: DiscoveryConfig;
  durationMs: number;
  mode: "live" | "cached" | "verified";
  reviewsCollected: number;
  behaviorSignals: number;
  opportunitiesFound: number;
  themesFound: number;
  qualityLevel: "Excellent" | "Good" | "Limited";
  topOpportunityTitle: string;
  sourceLabels: string[];
  outputs: Record<string, string>;
};
export type Review = { excerpt: string; category: string; sentiment: "positive" | "negative" | "neutral"; confidence: number; source: string; url: string; title: string | null; date: string; reviewerStatus: string };

export type ReviewMeta = {
  mode: "live" | "cached" | "verified";
  label: string;
  total: number;
  shown: number;
  dateFilterApplied: boolean;
};

export type BehaviorRecord = { id: string; theme: string; summary: string; source: string; opportunityIds: string[]; reviewed: boolean; notes: string };
export type ThemeExample = { id: string; excerpt: string; category: string; sourceType: string; date: string };
export type OpportunityRef = { id: string; label: string };
export type AiTheme = {
  name: string;
  count: number;
  distinctSources: number;
  sourceTypes: string[];
  categories: string[];
  strength: "High" | "Medium" | "Low";
  examples: ThemeExample[];
  theoryThemes: string[];
  theories: BehaviorRecord[];
  opportunities: OpportunityRef[];
};
export type InsightsReport = {
  executiveSummary: {
    evidenceCount: number;
    sourceCount: number;
    sourceTypes: Record<string, number>;
    categories: Record<string, number>;
    sentiment: Record<string, number>;
    topThemes: { name: string; count: number; strength: string }[];
    topCategories: string[];
    knowledgeCounts: { theories: number; commerceInsights: number; caseStudies: number; papers: number };
    strengthDistribution: { high: number; medium: number; low: number };
    narrative: string[];
  };
  aiThemes: AiTheme[];
  behaviouralTheories: BehaviorRecord[];
  commerceInsights: BehaviorRecord[];
  industryCaseStudies: BehaviorRecord[];
  researchPapers: BehaviorRecord[];
};

export type Opportunity = {
  id: string;
  rank: number;
  title: string;
  headline: string;
  combinedScore: number;
  confidenceLevel: "high" | "med_high" | "medium";
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
  supportingThemes: { theme: string; count: number }[];
  confidence: "High" | "Med-High" | "Medium";
  evidenceStrength: "Very Strong" | "Strong" | "Moderate" | "Emerging";
  estimatedEffort: "High" | "Medium" | "Low";
  support: { theories: number; caseStudies: number; papers: number };
};
export type OpportunityReport = {
  report: { title: string; project: string; date: string; status: string; executiveSummary: string };
  opportunities: Opportunity[];
};

export type RecommendationEvidence = {
  records: number;
  sourceTypes: number;
  theories: number;
  caseStudies: number;
  papers: number;
  commerceInsights: number;
};
export type RecommendationRisk = { risk: string; likelihood: string; impact: string; mitigation: string };
export type RecommendationReport = {
  report: { title: string; project: string; date: string; status: string; source: string };
  hero: {
    id: string;
    title: string;
    status: string;
    mvpRole: string;
    weightedScore: number;
    weightedMax: number;
    combinedScore: number;
    combinedMax: number;
    confidence: string;
    tagline: string;
  };
  whyThisWon: {
    businessValue: string;
    userValue: string;
    behaviouralReasoning: string;
    evidence: RecommendationEvidence;
  };
  supportingEvidence: {
    reviewsAnalysed: { primary: number; corpus: number };
    sourceTypes: string[];
    theories: number;
    caseStudies: number;
    papers: number;
    commerceInsights: number;
  };
  assumptions: string[];
  outlook: {
    expectedUserOutcome: string;
    expectedBusinessOutcome: string;
    primaryMetric: string;
    guardrailMetric: string;
    risks: RecommendationRisk[];
  };
  comparison: (Opportunity & { weightedScore: number; tradeOff: string })[];
};

export class ApiError extends Error {
  constructor(message: string, public readonly code?: string, public readonly status?: number) { super(message); }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers: { "content-type": "application/json", ...init?.headers }, cache: "no-store" });
  const body = await response.json().catch(() => ({})) as { message?: string; error?: string };
  if (!response.ok) throw new ApiError(body.message ?? `Request failed with HTTP ${response.status}.`, body.error, response.status);
  return body as T;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "Not visible";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function titleCase(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
