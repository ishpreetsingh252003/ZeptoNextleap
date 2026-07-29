import { z } from "zod";

// Behavioural knowledge‑base concepts
export interface BehaviouralConcept {
  id: string; // e.g., "loss_aversion"
  name: string; // Human‑readable name
  description: string; // Brief description of the concept
}

// Link between evidence and a behavioural concept
export interface EvidenceLink {
  evidenceId: string;
  conceptId: string;
  relevanceScore: number; // 0‑1 confidence that evidence supports concept
}

// Extended opportunity scoring fields
export interface ExtendedOpportunityScore {
  opportunityId: string;
  opportunityTitle: string;
  customerEvidenceCount: number;
  behaviouralSupportCount: number;
  industrySupportCount: number;
  researchSupportCount: number;
  confidenceLevel: "high" | "medium" | "low";
  evidenceGaps: string[]; // list of missing support types
  rationale: string;
  combinedScore: number; // weighted sum used for ranking
}
