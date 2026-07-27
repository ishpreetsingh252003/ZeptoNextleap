import type {
  PublicDocument,
  ResearchRelevance
} from "@zepto/research-contracts";
import type { ServerEnv } from "@zepto/shared-config";
import { normalizeText } from "./lib/text.js";

export type ClassifiedResearchDocument = {
  document: PublicDocument;
  relevance: ResearchRelevance;
  signalCodes: string[];
};

export type ResearchReadinessThresholds = {
  minRelevantRecords: number;
  minSources: number;
  maxSourceConcentration: number;
  minCategories: number;
  maxCategoryConcentration: number;
  minBarriersOrRisks: number;
  minTriggersOrTrustSignals: number;
  minAbandonmentOrWorkarounds: number;
};

export const defaultResearchReadinessThresholds: ResearchReadinessThresholds = {
  minRelevantRecords: 100,
  minSources: 3,
  maxSourceConcentration: 0.75,
  minCategories: 3,
  maxCategoryConcentration: 0.75,
  minBarriersOrRisks: 20,
  minTriggersOrTrustSignals: 10,
  minAbandonmentOrWorkarounds: 10
};

export function researchReadinessThresholdsFromEnv(
  env: ServerEnv
): ResearchReadinessThresholds {
  return {
    minRelevantRecords: env.RESEARCH_READINESS_MIN_RELEVANT_RECORDS,
    minSources: env.RESEARCH_READINESS_MIN_SOURCES,
    maxSourceConcentration:
      env.RESEARCH_READINESS_MAX_SOURCE_CONCENTRATION,
    minCategories: env.RESEARCH_READINESS_MIN_CATEGORIES,
    maxCategoryConcentration:
      env.RESEARCH_READINESS_MAX_CATEGORY_CONCENTRATION,
    minBarriersOrRisks:
      env.RESEARCH_READINESS_MIN_BARRIERS_OR_RISKS,
    minTriggersOrTrustSignals:
      env.RESEARCH_READINESS_MIN_TRIGGERS_OR_TRUST_SIGNALS,
    minAbandonmentOrWorkarounds:
      env.RESEARCH_READINESS_MIN_ABANDONMENT_OR_WORKAROUNDS
  };
}

const directPhraseSignals: ReadonlyArray<[string, RegExp]> = [
  ["first_trial", /\b(first time|tried? for the first time|never (?:bought|ordered)|new category)\b/u],
  ["trust_barrier", /\b(did not trust|don'?t trust|authenticity concern|quality concern|freshness concern)\b/u],
  ["channel_switch", /\b(bought elsewhere|purchase elsewhere|offline store|specialist (?:store|marketplace)|avoided ordering)\b/u],
  ["uncertainty", /\b(size|fit|ingredient|specification)s? uncertainty\b/u],
  ["resolution_risk", /\b(return|refund|replacement) risk\b/u],
  ["missing_information", /\b(unavailable|missing|not enough) (?:product )?information\b/u],
  ["repeat_behavior", /\b(repeat purchase|bought again|ordered again|did not reorder)\b/u],
  ["category_switch", /\b(switched category|category abandonment|abandoned the category)\b/u]
];

const categorySignals: ReadonlyArray<[string, RegExp]> = [
  ["pet_care", /\b(pet care|pet food|dog food|cat food)\b/u],
  ["baby_care", /\b(baby care|diaper|nappy|infant)\b/u],
  ["personal_care", /\bpersonal care\b/u],
  ["health_wellness", /\b(health and wellness|health & wellness|supplement|vitamin)\b/u],
  ["beauty_skincare", /\b(beauty|skin ?care|cosmetic)\b/u],
  ["fresh_produce", /\b(fresh produce|fruit|vegetable)\b/u],
  ["meat_seafood", /\b(meat|seafood|fish|chicken)\b/u],
  ["premium_packaged", /\b(premium|high[- ]value) packaged product\b/u]
];

const broadServiceSignals: ReadonlyArray<[string, RegExp]> = [
  ["delivery", /\b(late|delayed|delivery|rider)\b/u],
  ["support", /\b(customer support|customer care|support agent)\b/u],
  ["account", /\b(login|account|otp|sign[- ]in)\b/u],
  ["app_performance", /\b(app crash|crashed|slow app|loading)\b/u],
  ["payment", /\b(payment failed|upi|wallet)\b/u]
];

const behaviorStageSignals = new Set([
  "consideration",
  "comparison",
  "trial",
  "abandonment",
  "purchase_elsewhere",
  "first_purchase",
  "post_purchase",
  "repeat_purchase",
  "churn"
]);

const evidenceTypeSignals = new Set([
  "barrier",
  "trigger",
  "trust_signal",
  "perceived_risk",
  "information_need",
  "workaround",
  "decision_criterion",
  "outcome"
]);

function matchingSignals(
  text: string,
  signals: ReadonlyArray<[string, RegExp]>
): string[] {
  return signals
    .filter(([, pattern]) => pattern.test(text))
    .map(([code]) => code);
}

export function classifyResearchRelevance(
  document: PublicDocument
): ClassifiedResearchDocument {
  const text = normalizeText(document.normalizedText)
    .toLocaleLowerCase("en");
  const metadata = document.sourceMetadata;
  const directSignals = matchingSignals(text, directPhraseSignals);
  const categoryTextSignals = matchingSignals(text, categorySignals);
  const broadSignals = matchingSignals(text, broadServiceSignals);
  const hasCategory = Boolean(metadata?.category);
  const hasBehaviorSignal = Boolean(
    metadata?.behaviorStage
      && behaviorStageSignals.has(metadata.behaviorStage)
  );
  const hasEvidenceSignal = Boolean(
    metadata?.evidenceType
      && evidenceTypeSignals.has(metadata.evidenceType)
  );
  const signalCodes = [
    ...directSignals,
    ...categoryTextSignals,
    ...(hasCategory ? ["explicit_category"] : []),
    ...(hasBehaviorSignal ? ["explicit_behavior_stage"] : []),
    ...(hasEvidenceSignal ? ["explicit_evidence_type"] : [])
  ];

  if (
    directSignals.length > 0
    || (hasCategory && (hasBehaviorSignal || hasEvidenceSignal))
  ) {
    return {
      document,
      relevance: "directly_relevant",
      signalCodes
    };
  }
  if (
    hasCategory
    || hasBehaviorSignal
    || hasEvidenceSignal
    || categoryTextSignals.length > 0
  ) {
    return {
      document,
      relevance: "potentially_relevant",
      signalCodes
    };
  }
  if (broadSignals.length > 0) {
    return {
      document,
      relevance: "broad_service_feedback",
      signalCodes: broadSignals
    };
  }
  return {
    document,
    relevance: "irrelevant",
    signalCodes: []
  };
}

const relevanceOrder: Record<ResearchRelevance, number> = {
  directly_relevant: 0,
  potentially_relevant: 1,
  broad_service_feedback: 2,
  irrelevant: 3
};

export function classifyAndPrioritizeResearchDocuments(
  documents: readonly PublicDocument[]
): ClassifiedResearchDocument[] {
  return documents
    .map(classifyResearchRelevance)
    .sort((first, second) =>
      relevanceOrder[first.relevance] - relevanceOrder[second.relevance]
      || first.document.sourceName.localeCompare(second.document.sourceName)
      || first.document.externalId.localeCompare(second.document.externalId)
    );
}

type Concentration = {
  name: string | null;
  count: number;
  ratio: number;
};

export type ReadinessCriterion =
  | "relevant_records"
  | "source_diversity"
  | "source_concentration"
  | "category_diversity"
  | "category_concentration"
  | "barriers_or_risks"
  | "triggers_or_trust_signals"
  | "abandonment_or_workarounds"
  | "provenance_completeness";

export type UnmetReadinessCriterion = {
  criterion: ReadinessCriterion;
  actual: number;
  required: number;
  comparison: "at_least" | "at_most" | "equals";
};

export type ResearchReadinessReport = {
  status: "ready" | "not_ready";
  totalImportedRecords: number;
  recordsBySource: Record<string, number>;
  recordsByCategory: Record<string, number>;
  recordsByBehaviorStage: Record<string, number>;
  recordsByEvidenceType: Record<string, number>;
  recordsByRelevance: Record<ResearchRelevance, number>;
  provenance: {
    complete: number;
    incomplete: number;
    completenessRatio: number;
    eligibleComplete: number;
    eligibleIncomplete: number;
    incompleteDocumentIds: string[];
  };
  sourceConcentration: Concentration;
  categoryConcentration: Concentration;
  eligibleResearchRecords: number;
  unmetCriteria: UnmetReadinessCriterion[];
};

function countBy(
  documents: readonly PublicDocument[],
  value: (document: PublicDocument) => string
): Record<string, number> {
  const values = new Map<string, number>();
  for (const document of documents) {
    const key = value(document);
    values.set(key, (values.get(key) ?? 0) + 1);
  }
  return Object.fromEntries(
    [...values.entries()].sort(([first], [second]) =>
      first.localeCompare(second)
    )
  );
}

function concentration(counts: Record<string, number>): Concentration {
  const entries = Object.entries(counts)
    .sort(([firstName, firstCount], [secondName, secondCount]) =>
      secondCount - firstCount || firstName.localeCompare(secondName)
    );
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  const [name, count] = entries[0] ?? [null, 0];
  return {
    name,
    count,
    ratio: total === 0 ? 0 : count / total
  };
}

function hasCompleteProvenance(document: PublicDocument): boolean {
  let publicUrl = false;
  try {
    publicUrl = ["http:", "https:"].includes(
      new URL(document.canonicalUrl).protocol
    );
  } catch {
    publicUrl = false;
  }
  return Boolean(
    document.externalId
    && document.sourceName
    && document.capturedAt
    && document.accessMethod
    && publicUrl
    && document.sourceMetadata?.sourceUrlAvailable !== false
  );
}

export function createResearchReadinessReport(
  documents: readonly PublicDocument[],
  thresholds: ResearchReadinessThresholds =
    defaultResearchReadinessThresholds
): ResearchReadinessReport {
  const classified = classifyAndPrioritizeResearchDocuments(documents);
  const relevant = classified.filter(({ relevance }) =>
    relevance === "directly_relevant"
    || relevance === "potentially_relevant"
  );
  const relevantDocuments = relevant.map(({ document }) => document);
  const recordsBySource = countBy(documents, ({ sourceName }) => sourceName);
  const recordsByCategory = countBy(
    documents,
    ({ sourceMetadata }) => sourceMetadata?.category ?? "unknown"
  );
  const relevantSources = countBy(
    relevantDocuments,
    ({ sourceName }) => sourceName
  );
  const relevantCategories = countBy(
    relevantDocuments.filter(({ sourceMetadata }) =>
      Boolean(sourceMetadata?.category)
    ),
    ({ sourceMetadata }) => sourceMetadata!.category!
  );
  const incompleteDocuments = documents
    .filter((document) => !hasCompleteProvenance(document))
  const incompleteDocumentIds = incompleteDocuments
    .map(({ externalId }) => externalId).sort();
  const incompleteEligibleDocumentIds = relevantDocuments
    .filter((document) => !hasCompleteProvenance(document))
    .map(({ externalId }) => externalId);
  const barriersOrRisks = relevantDocuments.filter(({ sourceMetadata }) =>
    sourceMetadata?.evidenceType === "barrier"
    || sourceMetadata?.evidenceType === "perceived_risk"
  ).length;
  const triggersOrTrustSignals = relevantDocuments.filter(
    ({ sourceMetadata }) =>
      sourceMetadata?.evidenceType === "trigger"
      || sourceMetadata?.evidenceType === "trust_signal"
  ).length;
  const abandonmentOrWorkarounds = relevantDocuments.filter(
    ({ sourceMetadata }) =>
      sourceMetadata?.behaviorStage === "abandonment"
      || sourceMetadata?.behaviorStage === "purchase_elsewhere"
      || sourceMetadata?.evidenceType === "workaround"
  ).length;
  const sourceConcentration = concentration(relevantSources);
  const categoryConcentration = concentration(relevantCategories);
  const unmetCriteria: UnmetReadinessCriterion[] = [];
  const atLeast = (
    criterion: ReadinessCriterion,
    actual: number,
    required: number
  ) => {
    if (actual < required) {
      unmetCriteria.push({
        criterion,
        actual,
        required,
        comparison: "at_least"
      });
    }
  };
  const atMost = (
    criterion: ReadinessCriterion,
    actual: number,
    required: number
  ) => {
    if (actual > required) {
      unmetCriteria.push({
        criterion,
        actual,
        required,
        comparison: "at_most"
      });
    }
  };

  atLeast("relevant_records", relevant.length, thresholds.minRelevantRecords);
  atLeast(
    "source_diversity",
    Object.keys(relevantSources).length,
    thresholds.minSources
  );
  atMost(
    "source_concentration",
    sourceConcentration.ratio,
    thresholds.maxSourceConcentration
  );
  atLeast(
    "category_diversity",
    Object.keys(relevantCategories).length,
    thresholds.minCategories
  );
  if (Object.keys(relevantCategories).length > 0) {
    atMost(
      "category_concentration",
      categoryConcentration.ratio,
      thresholds.maxCategoryConcentration
    );
  } else {
    unmetCriteria.push({
      criterion: "category_concentration",
      actual: 1,
      required: thresholds.maxCategoryConcentration,
      comparison: "at_most"
    });
  }
  atLeast(
    "barriers_or_risks",
    barriersOrRisks,
    thresholds.minBarriersOrRisks
  );
  atLeast(
    "triggers_or_trust_signals",
    triggersOrTrustSignals,
    thresholds.minTriggersOrTrustSignals
  );
  atLeast(
    "abandonment_or_workarounds",
    abandonmentOrWorkarounds,
    thresholds.minAbandonmentOrWorkarounds
  );
  if (incompleteEligibleDocumentIds.length > 0) {
    unmetCriteria.push({
      criterion: "provenance_completeness",
      actual: relevant.length - incompleteEligibleDocumentIds.length,
      required: relevant.length,
      comparison: "equals"
    });
  }

  const recordsByRelevance: Record<ResearchRelevance, number> = {
    directly_relevant: 0,
    potentially_relevant: 0,
    broad_service_feedback: 0,
    irrelevant: 0
  };
  for (const item of classified) recordsByRelevance[item.relevance] += 1;

  return {
    status: unmetCriteria.length === 0 ? "ready" : "not_ready",
    totalImportedRecords: documents.length,
    recordsBySource,
    recordsByCategory,
    recordsByBehaviorStage: countBy(
      documents,
      ({ sourceMetadata }) => sourceMetadata?.behaviorStage ?? "unknown"
    ),
    recordsByEvidenceType: countBy(
      documents,
      ({ sourceMetadata }) => sourceMetadata?.evidenceType ?? "unknown"
    ),
    recordsByRelevance,
    provenance: {
      complete: documents.length - incompleteDocuments.length,
      incomplete: incompleteDocuments.length,
      completenessRatio:
        documents.length === 0
          ? 0
          : (documents.length - incompleteDocuments.length) / documents.length,
      eligibleComplete:
        relevant.length - incompleteEligibleDocumentIds.length,
      eligibleIncomplete: incompleteEligibleDocumentIds.length,
      incompleteDocumentIds
    },
    sourceConcentration,
    categoryConcentration,
    eligibleResearchRecords: relevant.length,
    unmetCriteria
  };
}
