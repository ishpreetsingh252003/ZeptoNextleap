import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, relative } from "path";
import { parse } from "csv-parse/sync";
import {
  runCandidatePrioritization,
  candidateColumns,
  type ResearchCandidate,
} from "@zepto/research-worker/src/research/candidate-prioritization";
import {
  runOpportunityReport,
  parseBehaviourKnowledgeCsv,
} from "@zepto/research-worker/dist/research/scoring/core";
import type {
  BehaviourKnowledgeRecord,
  BehaviourKnowledgeDataset,
} from "@zepto/research-worker/dist/research/scoring/types";
import { repoRootOrThrow, resolveInput } from "./repo-paths";
import { deriveThemes, deriveRelevanceTags, OPPORTUNITY_TITLES } from "./behavior-mapping";
import { buildSynthesis, loadSynthesisSources, type SynthesisPayload } from "./synthesis";
import { recordRun, writeSynthesis, runDir } from "./run-history";
import type { DiscoveryConfig } from "./api";

const SOURCE_MAP: Record<string, string[]> = {
  play_store: ["Google Play", "App-store review"],
  app_store: ["Apple App Store", "App-store review"],
  reddit: ["Reddit", "Public community thread"],
  youtube: ["YouTube", "Video review"],
  trustpilot: ["Trustpilot", "Consumer-review platform"],
  twitter: ["X / Twitter", "Twitter", "Social media post"],
  linkedin: ["LinkedIn", "Social media post"],
  community_forums: ["Public community thread", "Forum post"],
};

const KNOWLEDGE_FILES: { file: string; bundled: string; dataset: BehaviourKnowledgeDataset }[] = [
  { file: "research/behavior/behavioural-theories.csv", bundled: "behavior/behavioural-theories.csv", dataset: "behavioural_theories" },
  { file: "research/behavior/commerce-insights.csv", bundled: "behavior/commerce-insights.csv", dataset: "commerce_insights" },
  { file: "research/behavior/industry-case-studies.csv", bundled: "behavior/industry-case-studies.csv", dataset: "industry_case_studies" },
  { file: "research/behavior/research-papers.csv", bundled: "behavior/research-papers.csv", dataset: "research_papers" },
];

const REVIEWED_EVIDENCE_COLUMNS = [
  "evidence_id",
  "opportunity_id",
  "opportunity_title",
  "source_type",
  "category",
  "relevance_tags",
  "reviewed",
  "behavioural_themes",
];

export type PipelineStage = "preparing" | "searching" | "collecting" | "scoring" | "opportunities" | "finalizing";

export type PipelineEvent =
  | { type: "stage"; stage: PipelineStage; status: "active" | "done"; message: string; at: string }
  | { type: "complete"; payload: RunResult }
  | { type: "error"; message: string };

export type RunResult = {
  runId: string;
  config: Pick<DiscoveryConfig, "company" | "country" | "dateRange" | "sources" | "objective">;
  summary: {
    totalSources: number;
    totalEvidence: number;
    matchedEvidence: number;
    queriesAvailable: number;
    reviewsCollected: number;
    opportunitiesFound: number;
  };
  evidence: {
    id: string;
    excerpt: string;
    paraphrase: string;
    category: string;
    mission: string;
    sentiment: string;
    certainty: string;
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
  opportunities: {
    id: string;
    title: string;
    combinedScore: number;
    evidenceCount: number;
    confidenceLevel: string;
  }[];
  synthesis: SynthesisPayload;
  outputs: Record<string, string>;
  durationMs: number;
};

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function toCsv(headers: readonly string[], rows: readonly Record<string, string>[]): string {
  const body = rows.map((row) => headers.map((header) => csvCell(row[header] ?? "")).join(","));
  return `${headers.map(csvCell).join(",")}\n${body.join("\n")}\n`;
}

function readCsv(realRelativePath: string, bundledRelativePath: string): Record<string, string>[] {
  const file = resolveInput(realRelativePath, bundledRelativePath);
  if (!file) return [];
  return parse(readFileSync(file, "utf-8"), { columns: true, skip_empty_lines: true, bom: true, trim: true }) as Record<string, string>[];
}

function relToRoot(root: string, absPath: string): string {
  return relative(root, absPath).replaceAll("\\", "/");
}

function mapEvidenceRow(row: Record<string, string>, sourceLogMap: Map<string, Record<string, string>>, index: number) {
  return {
    id: row.evidence_id ?? "",
    excerpt: row.minimal_permitted_excerpt ?? "",
    paraphrase: row.neutral_paraphrase ?? "",
    category: row.category_group ?? "",
    mission: row.shopping_mission ?? "",
    sentiment: row.evidence_valence ?? "",
    certainty: row.interpretation_certainty ?? "",
    sourceType: row.source_type ?? "",
    sourceUrl: row.source_url ?? "",
    date: row.publication_date ?? "",
    reviewerStatus: row.reviewer_status ?? "",
    source: (() => {
      const src = sourceLogMap.get(row.source_id ?? "");
      return src
        ? { title: src.source_title ?? "", platform: src.platform ?? "", status: src.review_status ?? "" }
        : null;
    })(),
  };
}

function toCandidates(rows: readonly Record<string, string>[]): ResearchCandidate[] {
  return rows.map((row, index) => ({
    candidate_id: row.evidence_id ?? `E${String(index + 1).padStart(3, "0")}`,
    query_id: `corpus-${index}`,
    category: row.category_group ?? "",
    behavior_focus: row.shopping_mission ?? "",
    search_query: "",
    title: (row.neutral_paraphrase ?? "").slice(0, 80),
    domain: row.source_url ? (() => { try { return new URL(row.source_url).hostname; } catch { return ""; } })() : "",
    url: row.source_url ?? "",
    snippet: row.minimal_permitted_excerpt ?? row.neutral_paraphrase ?? "",
    source_type: row.source_type ?? "",
    fetch_eligibility: "fetch_candidate",
    manual_review_required: "false",
    duplicate_group: "",
    approval_status: "pending",
    review_note: "",
  }));
}

function loadBehaviourKnowledge(): BehaviourKnowledgeRecord[] {
  const records: BehaviourKnowledgeRecord[] = [];
  for (const { file, bundled, dataset } of KNOWLEDGE_FILES) {
    const path = resolveInput(file, bundled);
    if (!path) {
      console.log(`[pipeline] Behaviour knowledge source missing (${file}) — skipping ${dataset}.`);
      continue;
    }
    try {
      records.push(...parseBehaviourKnowledgeCsv(readFileSync(path, "utf8"), dataset));
    } catch (error) {
      console.error(`[pipeline] Could not parse behaviour knowledge source (${path}):`, error);
    }
  }
  return records;
}

function bestOpportunityId(themes: readonly string[], knowledge: readonly BehaviourKnowledgeRecord[]): string | null {
  const counts = new Map<string, number>();
  for (const record of knowledge) {
    if (!themes.includes(record.theme)) continue;
    for (const opportunityId of record.opportunityIds) {
      counts.set(opportunityId, (counts.get(opportunityId) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return null;
  const order = Object.keys(OPPORTUNITY_TITLES);
  return [...counts.entries()].sort((a, b) =>
    b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]) || a[0].localeCompare(b[0])
  )[0]![0];
}

function reviewedEvidenceRows(
  rows: readonly Record<string, string>[],
  knowledge: readonly BehaviourKnowledgeRecord[]
): Record<string, string>[] {
  const output: Record<string, string>[] = [];
  for (const row of rows) {
    const codes = (row.behavioral_codes ?? "").split(";").map((c) => c.trim()).filter(Boolean);
    const themes = deriveThemes(codes);
    const opportunityId = bestOpportunityId(themes, knowledge);
    if (!opportunityId) continue;
    output.push({
      evidence_id: row.evidence_id ?? "",
      opportunity_id: opportunityId,
      opportunity_title: OPPORTUNITY_TITLES[opportunityId] ?? opportunityId,
      source_type: row.source_type ?? "",
      category: row.category_group ?? "",
      relevance_tags: deriveRelevanceTags(codes, row.evidence_valence ?? "").join(";"),
      reviewed: "true",
      behavioural_themes: themes.join(";"),
    });
  }
  return output;
}

export async function runPipeline(
  config: DiscoveryConfig,
  emit: (event: PipelineEvent) => void
): Promise<RunResult> {
  const startedAt = Date.now();
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const stage = (stageId: PipelineStage, status: "active" | "done", message: string) =>
    emit({ type: "stage", stage: stageId, status, message, at: new Date().toISOString() });

  const repoRoot = repoRootOrThrow();
  stage("preparing", "active", "Resolving repository corpus and pipeline configuration");

  const evidencePath = resolveInput("research/pilot/evidence-items.csv", "pilot/evidence-items.csv");
  if (!evidencePath) {
    throw new Error("No evidence data found. Run the research pipeline first.");
  }

  const sourceLogPath = resolveInput("research/pilot/source-log.csv", "pilot/source-log.csv");
  const queryPackPath = resolveInput("research/templates/category-research-query-pack.csv", "templates/category-research-query-pack.csv");

  stage("preparing", "done", `Configuration accepted — ${config.sources.length} sources, "${(config.objective ?? "").slice(0, 60)}"`);

  stage("searching", "active", "Loading collected sources from the research corpus");
  const sourceLogRows = sourceLogPath
    ? parse(readFileSync(sourceLogPath, "utf8"), { columns: true, skip_empty_lines: true, bom: true, trim: true }) as Record<string, string>[]
    : [];
  const queryPackRows = queryPackPath
    ? parse(readFileSync(queryPackPath, "utf8"), { columns: true, skip_empty_lines: true, bom: true, trim: true }) as Record<string, string>[]
    : [];
  stage("searching", "done", `Located ${sourceLogRows.length} public sources and ${queryPackRows.length} research queries`);

  stage("collecting", "active", "Collecting reviews that match your source selection");
  const evidenceRows = parse(readFileSync(evidencePath, "utf8"), { columns: true, skip_empty_lines: true, bom: true, trim: true }) as Record<string, string>[];
  const activeSourceTypes = new Set(config.sources.flatMap((s) => SOURCE_MAP[s] ?? []));
  const matchedEvidence = evidenceRows.filter((row) =>
    activeSourceTypes.size === 0 || activeSourceTypes.has(row.platform ?? "") || activeSourceTypes.has(row.source_type ?? "")
  );
  stage("collecting", "done", `Collected ${matchedEvidence.length} reviews from ${evidenceRows.length} retained evidence items`);

  const discoveryOutputDir = join(repoRoot, "research", "discovery-output");
  const opportunityOutputDir = join(repoRoot, "research", "opportunity-output");
  mkdirSync(discoveryOutputDir, { recursive: true });
  mkdirSync(opportunityOutputDir, { recursive: true });

  const outputs: Record<string, string> = {};

  let prioritization: Awaited<ReturnType<typeof runCandidatePrioritization>> | null = null;
  if (matchedEvidence.length > 0) {
    stage("scoring", "active", `Scoring ${matchedEvidence.length} candidates with the candidate prioritization module`);
    const candidates = toCandidates(matchedEvidence);
    const candidatesCsvPath = join(discoveryOutputDir, `${runId}-candidates.csv`);
    const prioritizedCsvPath = join(discoveryOutputDir, `${runId}-prioritized.csv`);
    writeFileSync(candidatesCsvPath, toCsv(candidateColumns, candidates), "utf8");
    prioritization = await runCandidatePrioritization({
      inputPath: candidatesCsvPath,
      outputPath: prioritizedCsvPath,
      repositoryRoot: repoRoot,
    });
    outputs.candidatesCsv = relToRoot(repoRoot, candidatesCsvPath);
    outputs.prioritizedCsv = relToRoot(repoRoot, prioritizedCsvPath);
    stage("scoring", "done", `${prioritization.shortlist.length} candidates shortlisted · bands A:${prioritization.bands.A} B:${prioritization.bands.B} C:${prioritization.bands.C}`);
  } else {
    stage("scoring", "done", "No candidates matched the source selection — skipped candidate scoring");
  }

  stage("opportunities", "active", "Building the reviewed-evidence matrix and scoring opportunities");
  const behaviourKnowledge = loadBehaviourKnowledge();
  const reviewedRows = reviewedEvidenceRows(matchedEvidence, behaviourKnowledge);
  const reviewedEvidenceCsvPath = join(opportunityOutputDir, `${runId}-reviewed-evidence.csv`);
  writeFileSync(reviewedEvidenceCsvPath, toCsv(REVIEWED_EVIDENCE_COLUMNS, reviewedRows), "utf8");
  const opportunitiesJsonPath = join(opportunityOutputDir, `${runId}-opportunities.json`);
  const opportunityReport = await runOpportunityReport({
    inputPath: reviewedEvidenceCsvPath,
    outputPath: opportunitiesJsonPath,
    behaviourKnowledge,
    repositoryRoot: repoRoot,
  });
  outputs.reviewedEvidenceCsv = relToRoot(repoRoot, reviewedEvidenceCsvPath);
  outputs.opportunitiesJson = relToRoot(repoRoot, opportunitiesJsonPath);
  stage("opportunities", "done", `Scored ${opportunityReport.topOpportunities.length} opportunities from ${reviewedRows.length} reviewed-evidence records`);

  stage("finalizing", "active", "Writing synthesis output and run manifest");
  const sources = loadSynthesisSources();
  const synthesis = buildSynthesis(sources) as SynthesisPayload;
  synthesis.scoringSummary = {
    evidenceCount: opportunityReport.evidenceCount,
    opportunities: opportunityReport.topOpportunities.map((opportunity) => ({
      id: opportunity.opportunityId,
      title: opportunity.opportunityTitle,
      combinedScore: opportunity.combinedScore,
      evidenceCount: opportunity.evidenceCount,
      confidenceLevel: opportunity.confidenceLevel,
    })),
  };
  const synthesisJsonPath = writeSynthesis(runId, synthesis);
  outputs.synthesisJson = relToRoot(repoRoot, synthesisJsonPath);

  const durationMs = Date.now() - startedAt;
  const manifest = {
    id: runId,
    timestamp: new Date().toISOString(),
    status: "completed" as const,
    config,
    durationMs,
    reviewsCollected: matchedEvidence.length,
    opportunitiesFound: opportunityReport.topOpportunities.length,
    outputs,
  };
  outputs.runManifest = relToRoot(repoRoot, recordRun(manifest));
  stage("finalizing", "done", `Run ${runId} finalized in ${(durationMs / 1000).toFixed(1)}s`);

  const sourceLogMap = new Map(sourceLogRows.map((row) => [row.source_id, row]));

  return {
    runId,
    config: {
      company: config.company || "Zepto",
      country: config.country,
      dateRange: config.dateRange,
      sources: config.sources,
      objective: config.objective,
    },
    summary: {
      totalSources: sourceLogRows.length,
      totalEvidence: evidenceRows.length,
      matchedEvidence: matchedEvidence.length,
      queriesAvailable: queryPackRows.length,
      reviewsCollected: matchedEvidence.length,
      opportunitiesFound: opportunityReport.topOpportunities.length,
    },
    evidence: matchedEvidence.map((row, index) => mapEvidenceRow(row, sourceLogMap, index)),
    prioritization: prioritization
      ? {
          shortlist: prioritization.shortlist.map((candidate) => ({
            id: candidate.candidate_id,
            category: candidate.category,
            score: candidate.priority_score,
            band: candidate.priority_band,
            reasons: candidate.priority_reasons,
            flags: candidate.quality_flags,
            action: candidate.recommended_action,
            url: candidate.url,
            snippet: candidate.snippet,
          })),
          bands: prioritization.bands,
          weakAreas: prioritization.weakAreas,
        }
      : null,
    opportunities: opportunityReport.topOpportunities.map((opportunity) => ({
      id: opportunity.opportunityId,
      title: opportunity.opportunityTitle,
      combinedScore: opportunity.combinedScore,
      evidenceCount: opportunity.evidenceCount,
      confidenceLevel: opportunity.confidenceLevel,
    })),
    synthesis,
    outputs,
    durationMs,
  };
}
