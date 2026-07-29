/**
 * @module [PRODUCTION]
 * Core offline opportunity scoring engine for Zepto NextLeap project.
 * Implements deterministic evidence strength calculations and knowledge integration.
 */

import { dirname, relative, resolve } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { findRepositoryRoot } from "@zepto/shared-config";

import {
  normalized,
  countBy,
  cappedRatio,
  cappedCount,
  tagCount,
} from "./utils.js";
import type {
  ReviewedEvidence,
  BehaviourKnowledgeRecord,
  BehaviourKnowledgeDataset,
  OpportunityScore,
  OpportunityReport,
} from "./types.js";

import {
  reviewedEvidenceColumns,
  opportunityTags,
  OpportunityTag,
  behaviouralThemes,
  BehaviouralTheme,
} from "./types.js";

// ---- Helper parsers -------------------------------------------------------
function parseTags(value: string, row: number): OpportunityTag[] {
  const tags = value
    .split(/[;,|]/u)
    .map(normalized)
    .filter(Boolean);
  const invalid = tags.filter((tag) => !opportunityTags.includes(tag as OpportunityTag));
  if (invalid.length > 0) {
    throw new Error(`Row ${row}: unsupported relevance_tags value.`);
  }
  return [...new Set(tags as OpportunityTag[])].sort();
}

function parseThemes(value: string, row: number): BehaviouralTheme[] {
  const themes = value
    .split(/[;,|]/u)
    .map(normalized)
    .filter(Boolean);
  const invalid = themes.filter((theme) => !behaviouralThemes.includes(theme as BehaviouralTheme));
  if (invalid.length > 0) {
    throw new Error(`Row ${row}: unsupported behavioural_themes value.`);
  }
  return [...new Set(themes as BehaviouralTheme[])].sort();
}

// ---- CSV parsers ----------------------------------------------------------
export function parseReviewedEvidenceCsv(csvText: string): ReviewedEvidence[] {
  const headerRow = parse(csvText, {
    to_line: 1,
    bom: true,
    trim: true,
  }) as string[][];
  const rows = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
    relax_column_count: false,
  }) as Array<Record<string, string>>;
  const headers = headerRow[0] ?? [];
  const missing = reviewedEvidenceColumns.filter((column) => !headers.includes(column));
  if (missing.length > 0) {
    throw new Error(`Reviewed evidence CSV is missing columns: ${missing.join(", ")}`);
  }
  const evidenceIds = new Set<string>();
  return rows.map((row, index) => {
    const rowNumber = index + 2;
    const evidenceId = row.evidence_id?.trim() ?? "";
    const opportunityId = row.opportunity_id?.trim() ?? "";
    const opportunityTitle = row.opportunity_title?.trim() ?? "";
    const sourceType = row.source_type?.trim() ?? "";
    const category = row.category?.trim() ?? "";
    if (!evidenceId || !opportunityId || !opportunityTitle || !sourceType || !category) {
      throw new Error(`Row ${rowNumber}: required reviewed evidence field is empty.`);
    }
    if (normalized(row.reviewed ?? "") !== "true") {
      throw new Error(`Row ${rowNumber}: reviewed must be true.`);
    }
    if (evidenceIds.has(evidenceId)) {
      throw new Error(`Row ${rowNumber}: duplicate evidence_id.`);
    }
    evidenceIds.add(evidenceId);
    return {
      evidenceId,
      opportunityId,
      opportunityTitle,
      sourceType,
      category,
      relevanceTags: parseTags(row.relevance_tags ?? "", rowNumber),
      behaviouralThemes: headers.includes("behavioural_themes")
        ? parseThemes(row.behavioural_themes ?? "", rowNumber)
        : [],
    };
  });
}

const behaviourKnowledgeColumns = [
  "record_id",
  "theme",
  "summary",
  "source",
  "opportunity_ids",
  "reviewed",
  "notes",
] as const;

export function parseBehaviourKnowledgeCsv(
  csvText: string,
  dataset: BehaviourKnowledgeDataset
): BehaviourKnowledgeRecord[] {
  const headerRow = parse(csvText, {
    to_line: 1,
    bom: true,
    trim: true,
  }) as string[][];
  const rows = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
    relax_column_count: false,
  }) as Array<Record<string, string>>;
  const headers = headerRow[0] ?? [];
  const missing = behaviourKnowledgeColumns.filter((column) => !headers.includes(column));
  if (missing.length > 0) {
    throw new Error(`Behaviour knowledge CSV is missing columns: ${missing.join(", ")}`);
  }
  const recordIds = new Set<string>();
  return rows.map((row, index) => {
    const rowNumber = index + 2;
    const recordId = row.record_id?.trim() ?? "";
    const source = row.source?.trim() ?? "";
    const opportunityIds = (row.opportunity_ids ?? "")
      .split(/[;,|]/u)
      .map((value) => value.trim())
      .filter(Boolean);
    if (!recordId || !source || opportunityIds.length === 0) {
      throw new Error(`Row ${rowNumber}: required behaviour knowledge field is empty.`);
    }
    if (normalized(row.reviewed ?? "") !== "true") {
      throw new Error(`Row ${rowNumber}: reviewed must be true.`);
    }
    if (recordIds.has(recordId)) {
      throw new Error(`Row ${rowNumber}: duplicate record_id.`);
    }
    recordIds.add(recordId);
    const themes = parseThemes(row.theme ?? "", rowNumber);
    if (themes.length !== 1) {
      throw new Error(`Row ${rowNumber}: theme must contain exactly one controlled value.`);
    }
    return {
      recordId,
      dataset,
      theme: themes[0]!,
      source,
      opportunityIds: [...new Set(opportunityIds)].sort(),
    };
  });
}

// ---- Scoring -------------------------------------------------------------
export function scoreOpportunities(
  evidence: readonly ReviewedEvidence[],
  behaviourKnowledge: readonly BehaviourKnowledgeRecord[] = []
): Omit<OpportunityReport, "outputPath"> {
  const grouped = new Map<string, ReviewedEvidence[]>();
  for (const record of evidence) {
    const key = record.opportunityId;
    grouped.set(key, [...(grouped.get(key) ?? []), record]);
  }
  const opportunities = [...grouped.entries()].map(([opportunityId, records]) => {
    const title = records[0]!.opportunityTitle;
    if (records.some(({ opportunityTitle }) => opportunityTitle !== title)) {
      throw new Error(`Opportunity ${opportunityId} has inconsistent titles.`);
    }
    const sources = countBy(records, ({ sourceType }) => sourceType);
    const categories = countBy(records, ({ category }) => category);
    const dominantCategoryCount = Math.max(...Object.values(categories));
    const interviewEvidenceCount = records.filter(({ sourceType }) =>
      normalized(sourceType) === "interview"
    ).length;
    const criteria = {
      evidenceFrequency: cappedCount(
        records.length,
        8,
        (global as any).opportunityWeights?.evidenceFrequency ?? 25
      ),
      sourceDiversity: cappedCount(
        Object.keys(sources).length,
        4,
        (global as any).opportunityWeights?.sourceDiversity ?? 15
      ),
      trustRiskRelevance: cappedRatio(
        tagCount(records, "trust_risk"),
        records.length,
        (global as any).opportunityWeights?.trustRiskRelevance ?? 15
      ),
      purchaseElsewhereRelevance: cappedRatio(
        tagCount(records, "purchase_elsewhere"),
        records.length,
        (global as any).opportunityWeights?.purchaseElsewhereRelevance ?? 15
      ),
      repeatPurchaseRelevance: cappedRatio(
        tagCount(records, "repeat_purchase"),
        records.length,
        (global as any).opportunityWeights?.repeatPurchaseRelevance ?? 15
      ),
      categoryConcentration: cappedRatio(
        dominantCategoryCount,
        records.length,
        (global as any).opportunityWeights?.categoryConcentration ?? 10
      ),
      positiveCounterEvidence: cappedRatio(
        tagCount(records, "positive_counterevidence"),
        records.length,
        (global as any).opportunityWeights?.positiveCounterEvidence ?? 10
      ),
    };
    const matchingKnowledge = behaviourKnowledge.filter((record) =>
      record.opportunityIds.includes(opportunityId) &&
      records.some(({ behaviouralThemes: themes }) => themes.includes(record.theme))
    );
    const unmatchedKnowledge = behaviourKnowledge.some((record) =>
      record.opportunityIds.includes(opportunityId) &&
      !records.some(({ behaviouralThemes: themes }) => themes.includes(record.theme))
    );
    const weakEvidenceFlags: string[] = [];
    if (Object.keys(sources).length === 1) weakEvidenceFlags.push("SINGLE_SOURCE");
    if (Object.keys(sources).length < 2) weakEvidenceFlags.push("LOW_SOURCE_DIVERSITY");
    if (dominantCategoryCount / records.length >= 0.8) {
      weakEvidenceFlags.push("CATEGORY_IMBALANCE");
    }
    if (interviewEvidenceCount === 0) weakEvidenceFlags.push("INTERVIEW_GAP");
    if (criteria.positiveCounterEvidence === 0) {
      weakEvidenceFlags.push("NO_POSITIVE_COUNTEREVIDENCE");
    }
    if (matchingKnowledge.length === 0) {
      weakEvidenceFlags.push("BEHAVIOURAL_RESEARCH_GAP");
    }
    if (unmatchedKnowledge) weakEvidenceFlags.push("KNOWLEDGE_THEME_UNMATCHED");
    const score = Object.values(criteria).reduce((sum, value) => sum + value, 0);
    const confidencePenalty =
      (weakEvidenceFlags.includes("SINGLE_SOURCE") ? 15 : 0) +
      (weakEvidenceFlags.includes("CATEGORY_IMBALANCE") ? 10 : 0) +
      (weakEvidenceFlags.includes("INTERVIEW_GAP") ? 5 : 0);
    const reviewConfidenceScore = Math.max(0, score - confidencePenalty);
    const behaviourKnowledgeDatasets = [...new Set(
      matchingKnowledge.map(({ dataset }) => dataset)
    )].sort() as BehaviourKnowledgeDataset[];
    const behaviourKnowledgeThemes = [...new Set(
      matchingKnowledge.map(({ theme }) => theme)
    )].sort() as BehaviouralTheme[];
    const confidenceUplift = Math.min(
      15,
      matchingKnowledge.length * 3 + behaviourKnowledgeThemes.length * 2
    );
    return {
      opportunityId,
      opportunityTitle: title,
      evidenceCount: records.length,
      sourceDistribution: sources,
      categoryDistribution: categories,
      criteria,
      score,
      reviewConfidenceScore,
      confidenceScore: Math.min(100, reviewConfidenceScore + confidenceUplift),
      confidenceUplift,
      behaviourKnowledgeSupportCount: matchingKnowledge.length,
      behaviourKnowledgeDatasets,
      behaviourKnowledgeThemes,
      weakEvidenceFlags,
      interviewEvidenceCount,
      // Extended fields calculations
      behaviouralSupportCount: matchingKnowledge.length,
      industrySupportCount: 0,
      researchSupportCount: 0,
      confidenceLevel:
        (Math.min(100, reviewConfidenceScore + confidenceUplift) >= 80
          ? "high"
          : Math.min(100, reviewConfidenceScore + confidenceUplift) >= 50
          ? "medium"
          : "low"),
      evidenceGaps: (() => {
        const gaps: string[] = [];
        if (matchingKnowledge.length === 0) gaps.push("behavioural");
        // placeholders for industry and research support
        if (0 === 0) gaps.push("industry");
        if (0 === 0) gaps.push("research");
        return gaps;
      })(),
      rationale:
        "Scored using evidence frequency, source diversity, and behavioural knowledge support.",
      combinedScore: score + matchingKnowledge.length * 3,
    } satisfies OpportunityScore;
  }).sort((first, second) =>
    second.score - first.score ||
    second.confidenceScore - first.confidenceScore ||
    first.opportunityId.localeCompare(second.opportunityId)
  );
  const sourceDistribution = countBy(evidence, ({ sourceType }) => sourceType);
  const opportunitiesSupportedOnlyByReviews = opportunities.filter(
    ({ behaviourKnowledgeSupportCount }) => behaviourKnowledgeSupportCount === 0
  ).map(({ opportunityId }) => opportunityId);
  const opportunitiesSupportedByReviewsAndBehaviour = opportunities.filter(
    ({ behaviourKnowledgeSupportCount }) => behaviourKnowledgeSupportCount > 0
  ).map(({ opportunityId }) => opportunityId);
  return {
    evidenceCount: evidence.length,
    sourceDistribution,
    topOpportunities: opportunities,
    weakEvidenceFlags: evidence.length === 0
      ? { _corpus: ["NO_EVIDENCE"] }
      : Object.fromEntries(opportunities.map((opportunity) => [
        opportunity.opportunityId,
        opportunity.weakEvidenceFlags
      ])),
    interviewGaps: opportunities.filter(({ interviewEvidenceCount }) =>
      interviewEvidenceCount === 0
    ).map(({ opportunityId, opportunityTitle, interviewEvidenceCount }) => ({
      opportunityId,
      opportunityTitle,
      interviewEvidenceCount,
    })),
    opportunitiesSupportedOnlyByReviews,
    opportunitiesSupportedByReviewsAndBehaviour,
    remainingEvidenceGaps: evidence.length === 0
      ? { _corpus: ["NO_EVIDENCE"] }
      : Object.fromEntries(opportunities.map((opportunity) => [
        opportunity.opportunityId,
        opportunity.weakEvidenceFlags
      ])),
  };
}

// ---- Output helpers -------------------------------------------------------
async function assertOpportunityOutput(path: string): Promise<void> {
  const root = findRepositoryRoot();
  if (!root) throw new Error("Repository root could not be resolved.");
  const repositoryPath = relative(root, resolve(path)).replaceAll("\\", "/");
  if (
    repositoryPath === "" ||
    repositoryPath === ".." ||
    repositoryPath.startsWith("../") ||
    !repositoryPath.startsWith("research/opportunity-output/")
  ) {
    throw new Error(
      "Output must use the Git-ignored research/opportunity-output/ directory."
    );
  }
}

export async function runOpportunityReport(options: {
  inputPath: string;
  outputPath?: string;
  behaviourKnowledge?: readonly BehaviourKnowledgeRecord[];
}): Promise<OpportunityReport> {
  const evidence = parseReviewedEvidenceCsv(await readFile(options.inputPath, "utf8"));
  const report = scoreOpportunities(evidence, options.behaviourKnowledge);
  if (!options.outputPath) return { ...report, outputPath: null };
  await assertOpportunityOutput(options.outputPath);
  const outputPath = resolve(options.outputPath);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  return { ...report, outputPath };
}
