// src/research/scoring/types.ts

export const reviewedEvidenceColumns = [
  "evidence_id",
  "opportunity_id",
  "opportunity_title",
  "source_type",
  "category",
  "relevance_tags",
  "reviewed"
] as const;

export const opportunityTags = [
  "trust_risk",
  "purchase_elsewhere",
  "repeat_purchase",
  "positive_counterevidence"
] as const;

export type OpportunityTag = (typeof opportunityTags)[number];

export const behaviouralThemes = [
  "trust",
  "risk",
  "habit",
  "trial",
  "repeat_purchase",
  "abandonment",
  "social_proof",
  "decision_fatigue"
] as const;

export type BehaviouralTheme = (typeof behaviouralThemes)[number];

export type ReviewedEvidence = {
  evidenceId: string;
  opportunityId: string;
  opportunityTitle: string;
  sourceType: string;
  category: string;
  relevanceTags: OpportunityTag[];
  behaviouralThemes: BehaviouralTheme[];
};

export type BehaviourKnowledgeDataset =
  | "behavioural_theories"
  | "commerce_insights"
  | "industry_case_studies"
  | "research_papers";

export type BehaviourKnowledgeRecord = {
  recordId: string;
  dataset: BehaviourKnowledgeDataset;
  theme: BehaviouralTheme;
  source: string;
  opportunityIds: string[];
};

export type OpportunityScore = {
  opportunityId: string;
  opportunityTitle: string;
  evidenceCount: number;
  sourceDistribution: Record<string, number>;
  categoryDistribution: Record<string, number>;
  criteria: {
    evidenceFrequency: number;
    sourceDiversity: number;
    trustRiskRelevance: number;
    purchaseElsewhereRelevance: number;
    repeatPurchaseRelevance: number;
    categoryConcentration: number;
    positiveCounterEvidence: number;
  };
  score: number;
  reviewConfidenceScore: number;
  confidenceScore: number;
  confidenceUplift: number;
  behaviourKnowledgeSupportCount: number;
  behaviourKnowledgeDatasets: BehaviourKnowledgeDataset[];
  behaviourKnowledgeThemes: BehaviouralTheme[];
  weakEvidenceFlags: string[];
  interviewEvidenceCount: number;
  // Extended fields
  behaviouralSupportCount: number;
  industrySupportCount: number;
  researchSupportCount: number;
  confidenceLevel: "high" | "medium" | "low";
  evidenceGaps: string[];
  rationale: string;
  combinedScore: number;
};

export type OpportunityReport = {
  evidenceCount: number;
  sourceDistribution: Record<string, number>;
  topOpportunities: OpportunityScore[];
  weakEvidenceFlags: Record<string, string[]>;
  interviewGaps: Array<{
    opportunityId: string;
    opportunityTitle: string;
    interviewEvidenceCount: number;
  }>;
  opportunitiesSupportedOnlyByReviews: string[];
  opportunitiesSupportedByReviewsAndBehaviour: string[];
  remainingEvidenceGaps: Record<string, string[]>;
  outputPath: string | null;
};
