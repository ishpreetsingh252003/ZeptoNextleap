import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, relative } from "path";
import { parse } from "csv-parse/sync";
import { loadRootEnv } from "@zepto/shared-config";
import gplay from "google-play-scraper";
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
import { recordRun, recordResult, writeSynthesis, runDir } from "./run-history";
import { readLiveCollectionCache, writeLiveCollectionCache, type LiveReviewDoc } from "./live-cache";
import type { DiscoveryConfig, DiscoverySourceDiagnostic } from "./api";

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
  config: Pick<DiscoveryConfig, "company" | "country" | "dateRange" | "sources" | "objective" | "dateFrom" | "dateTo">;
  diagnostics: DiscoverySourceDiagnostic[];
  summary: {
    totalSources: number;
    totalEvidence: number;
    matchedEvidence: number;
    queriesAvailable: number;
    reviewsCollected: number;
    opportunitiesFound: number;
    themesFound: number;
    behaviorSignals: number;
    highConfidence: number;
    sourceLabels: string[];
    qualityLevel: "Excellent" | "Good" | "Limited";
    qualityScore: number;
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

function parseDateFilter(config: DiscoveryConfig): { dateFrom: string | null; dateTo: string | null } {
  const valid = (value: string | null | undefined) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
  return {
    dateFrom: valid(config.dateFrom) ? config.dateFrom as string : null,
    dateTo: valid(config.dateTo) ? config.dateTo as string : null,
  };
}

function inDateRange(date: string | undefined, dateFrom: string | null, dateTo: string | null): boolean {
  const value = (date ?? "").trim().slice(0, 10);
  if (!value) return dateFrom === null && dateTo === null;
  if (dateFrom && value < dateFrom) return false;
  if (dateTo && value > dateTo) return false;
  return true;
}

function heuristicBehavioralCodes(rating: number | undefined): string {
  if (rating === undefined) return "";
  if (rating <= 2) return "Barrier; Perceived risk";
  if (rating === 3) return "Decision criterion; Information need";
  return "Trust signal; Trigger";
}

function liveReviewToEvidenceRow(doc: LiveReviewDoc): Record<string, string> {
  const rating = doc.sourceMetadata?.rating;
  return {
    evidence_id: doc.externalId,
    source_id: "",
    source_url: doc.canonicalUrl,
    source_type: "App-store review",
    platform: "Google Play",
    publication_date: (doc.publicationDate ?? "").slice(0, 10),
    capture_date: doc.capturedAt.slice(0, 10),
    category_group: "Cross-category",
    shopping_mission: "",
    neutral_paraphrase: doc.normalizedText.slice(0, 240),
    minimal_permitted_excerpt: doc.normalizedText.slice(0, 320),
    behavioral_codes: heuristicBehavioralCodes(rating),
    interpretation_certainty: "Explicit",
    outcome_if_stated: "",
    applicability: "Zepto-direct",
    transfer_rationale: "",
    evidence_valence: rating === undefined ? "mixed" : rating <= 2 ? "confirming" : rating >= 4 ? "opposing" : "mixed",
    reviewer_status: "Live Google Play review",
    notes_or_limitations: "",
  };
}

const GOOGLE_PLAY_PACKAGE_ID = "com.zeptoconsumerapp";
const GOOGLE_PLAY_CANONICAL_URL = `https://play.google.com/store/apps/details?id=${GOOGLE_PLAY_PACKAGE_ID}`;
const GOOGLE_PLAY_NEWEST = (gplay.sort as unknown as { NEWEST: number }).NEWEST;

async function fetchLiveGooglePlayReviews(options: {
  dateFrom: string | null;
  dateTo: string | null;
  maxRecords: number;
  timeoutMs: number;
}): Promise<LiveReviewDoc[]> {
  const { dateFrom, dateTo, maxRecords, timeoutMs } = options;
  const from = dateFrom ? Date.parse(`${dateFrom}T00:00:00.000Z`) : null;
  const to = dateTo ? Date.parse(`${dateTo}T23:59:59.999Z`) : null;
  const requestOptions = {
    timeout: { request: timeoutMs },
    retry: { limit: 0 },
  };

  const collected: { id: string; date: string; score: number; text: string }[] = [];
  let nextPaginationToken: string | undefined;
  let firstPage = true;

  while (firstPage || (nextPaginationToken && collected.length < maxRecords)) {
    firstPage = false;
    const response = await gplay.reviews({
      appId: GOOGLE_PLAY_PACKAGE_ID,
      country: "in",
      lang: "en",
      sort: GOOGLE_PLAY_NEWEST,
      paginate: true,
      ...(nextPaginationToken ? { nextPaginationToken } : {}),
      requestOptions,
    } as Parameters<typeof gplay.reviews>[0]);
    for (const review of response.data) {
      const inWindow = (from === null || Date.parse(review.date) >= from)
        && (to === null || Date.parse(review.date) <= to);
      if (inWindow) {
        collected.push({ id: review.id, date: review.date, score: review.score, text: review.text });
      }
    }
    const token = response.nextPaginationToken;
    if (!token || collected.length >= maxRecords) break;
    nextPaginationToken = token;
  }

  return collected.slice(0, maxRecords).map((review) => ({
    externalId: `${GOOGLE_PLAY_PACKAGE_ID}:${review.id}`,
    canonicalUrl: GOOGLE_PLAY_CANONICAL_URL,
    normalizedText: (review.text || "").trim().slice(0, 20_000),
    publicationDate: review.date,
    capturedAt: new Date().toISOString(),
    sourceMetadata: { rating: review.score },
  }));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Google Play request timed out")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

const SOURCE_LABELS: Record<string, string> = {
  play_store: "Google Play",
  app_store: "App Store",
  reddit: "Reddit",
  youtube: "YouTube",
  trustpilot: "Trustpilot",
  twitter: "X / Twitter",
  linkedin: "LinkedIn",
  community_forums: "Community Forums",
};

const SOURCE_UNITS: Record<string, string> = {
  play_store: "Reviews",
  app_store: "Reviews",
  reddit: "Discussions",
  youtube: "Comments",
  trustpilot: "Reviews",
  twitter: "Posts",
  linkedin: "Posts",
  community_forums: "Threads",
};

const SOURCE_CAPABILITY: Record<string, "live" | "dataset" | "coming_soon"> = {
  play_store: "live",
  app_store: "coming_soon",
  reddit: "dataset",
  youtube: "dataset",
  trustpilot: "dataset",
  twitter: "coming_soon",
  linkedin: "coming_soon",
  community_forums: "dataset",
};

function qualityLevelFor(input: { reviews: number; sources: number; themes: number; highConfidence: number }): { level: "Excellent" | "Good" | "Limited"; score: number } {
  const band = (value: number) => (value >= 100 ? 100 : value >= 30 ? 60 : value >= 1 ? 30 : 0);
  const coverage = input.reviews > 0 ? Math.round((input.highConfidence / input.reviews) * 100) : 0;
  const confidence = coverage >= 60 ? 100 : coverage >= 25 ? 60 : coverage >= 1 ? 30 : 0;
  const score = Math.round(
    0.35 * band(input.reviews) +
    0.25 * band(input.sources >= 3 ? 100 : input.sources === 2 ? 60 : input.sources === 1 ? 30 : 0) +
    0.25 * band(input.themes) +
    0.15 * confidence
  );
  return { level: score >= 80 ? "Excellent" : score >= 55 ? "Good" : "Limited", score };
}

function countRowsForSource(rows: readonly Record<string, string>[], source: string): number {
  const names = new Set(SOURCE_MAP[source] ?? []);
  return rows.filter((row) => names.has(row.platform ?? "") || names.has(row.source_type ?? "")).length;
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
  stage("preparing", "active", "Preparing research...");

  const evidencePath = resolveInput("research/pilot/evidence-items.csv", "pilot/evidence-items.csv");
  if (!evidencePath) {
    throw new Error("No evidence data found. Run the research pipeline first.");
  }

  const sourceLogPath = resolveInput("research/pilot/source-log.csv", "pilot/source-log.csv");
  const queryPackPath = resolveInput("research/templates/category-research-query-pack.csv", "templates/category-research-query-pack.csv");

  stage("preparing", "done", `Configuration accepted — ${config.sources.length} sources, "${(config.objective ?? "").slice(0, 60)}"`);

  stage("searching", "active", "Loading research dataset");
  const sourceLogRows = sourceLogPath
    ? parse(readFileSync(sourceLogPath, "utf8"), { columns: true, skip_empty_lines: true, bom: true, trim: true }) as Record<string, string>[]
    : [];
  const queryPackRows = queryPackPath
    ? parse(readFileSync(queryPackPath, "utf8"), { columns: true, skip_empty_lines: true, bom: true, trim: true }) as Record<string, string>[]
    : [];
  stage("searching", "done", `Located ${sourceLogRows.length} public sources and ${queryPackRows.length} research queries`);

  stage("collecting", "active", "Collecting reviews");
  const evidenceRows = parse(readFileSync(evidencePath, "utf8"), { columns: true, skip_empty_lines: true, bom: true, trim: true }) as Record<string, string>[];
  const { dateFrom, dateTo } = parseDateFilter(config);
  const dateFiltered = evidenceRows.filter((row) => inDateRange(row.publication_date, dateFrom, dateTo));
  const maxRecords = Math.min(Math.max(config.maxReviews || 100, 1), 100);
  const minRating = config.minRating || 1;

  let liveRows: Record<string, string>[] = [];
  let liveMode: DiscoverySourceDiagnostic["mode"] = "dataset";
  if (config.sources.includes("play_store")) {
    loadRootEnv();
    const cached = readLiveCollectionCache({ dateFrom, dateTo });
    if (cached) {
      liveRows = cached.docs
        .slice(0, maxRecords)
        .filter((doc) => (doc.sourceMetadata?.rating ?? 5) >= minRating)
        .map((doc) => liveReviewToEvidenceRow(doc));
      liveMode = "cached";
      stage("collecting", "done", `Cached Google Play reviews loaded (${liveRows.length})`);
    } else {
      const timeoutMs = Number(process.env.GOOGLE_PLAY_TIMEOUT_MS);
      if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
        stage("collecting", "active", "Connecting to Google Play...");
        try {
          const docs = await withTimeout(
            fetchLiveGooglePlayReviews({ dateFrom, dateTo, maxRecords, timeoutMs }),
            Math.min(timeoutMs, 5000)
          );
          liveRows = docs
            .filter((doc) => (doc.sourceMetadata?.rating ?? 5) >= minRating)
            .map((doc) => liveReviewToEvidenceRow(doc));
          liveMode = "live";
          writeLiveCollectionCache({ dateFrom, dateTo }, docs);
          stage("collecting", "done", `Live Google Play reviews collected (${liveRows.length})`);
        } catch {
          liveMode = "dataset";
          stage("collecting", "done", "Using verified research dataset");
        }
      }
    }
  }

  const corpusFor = (source: string) =>
    dateFiltered.filter((row) => {
      const names = new Set(SOURCE_MAP[source] ?? []);
      return names.has(row.platform ?? "") || names.has(row.source_type ?? "");
    });

  const matchedEvidence: Record<string, string>[] = [];
  const seenEvidence = new Set<string>();
  const addRows = (rows: readonly Record<string, string>[]) => {
    for (const row of rows) {
      const id = row.evidence_id ?? "";
      if (id && seenEvidence.has(id)) continue;
      if (id) seenEvidence.add(id);
      matchedEvidence.push(row);
    }
  };

  for (const source of config.sources) {
    if (source === "play_store") {
      addRows(liveRows);
      if (liveRows.length === 0) addRows(corpusFor(source));
    } else {
      addRows(corpusFor(source));
    }
  }
  stage("collecting", "done", `Collected ${matchedEvidence.length} reviews for analysis`);

  const diagnostics: DiscoverySourceDiagnostic[] = config.sources.map((source) => {
    const label = SOURCE_LABELS[source] ?? source;
    const unit = SOURCE_UNITS[source] ?? "Items";
    const capability = SOURCE_CAPABILITY[source] ?? "coming_soon";
    if (source === "play_store") {
      return { source, label, unit, mode: liveMode, requested: maxRecords, collected: liveRows.length };
    }
    const collected = countRowsForSource(matchedEvidence, source);
    return { source, label, unit, mode: capability, requested: 0, collected };
  });

  const discoveryOutputDir = join(repoRoot, "research", "discovery-output");
  const opportunityOutputDir = join(repoRoot, "research", "opportunity-output");
  mkdirSync(discoveryOutputDir, { recursive: true });
  mkdirSync(opportunityOutputDir, { recursive: true });

  const outputs: Record<string, string> = {};

  let prioritization: Awaited<ReturnType<typeof runCandidatePrioritization>> | null = null;
  if (matchedEvidence.length > 0) {
    stage("scoring", "active", `Analyzing behaviour and scoring ${matchedEvidence.length} reviews`);
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
    stage("scoring", "done", `Shortlisted ${prioritization.shortlist.length} candidates for review`);
  } else {
    stage("scoring", "done", "No reviews matched the selection");
  }

  stage("opportunities", "active", "Scoring opportunities from reviewed evidence");
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
  stage("opportunities", "done", `Identified ${opportunityReport.topOpportunities.length} opportunity areas`);

  stage("finalizing", "active", "Generating recommendation");
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

  const behaviorCodes = new Set<string>();
  const themesFound = new Set<string>();
  let highConfidence = 0;
  for (const row of matchedEvidence) {
    const codes = (row.behavioral_codes ?? "").split(";").map((c) => c.trim()).filter(Boolean);
    codes.forEach((code) => behaviorCodes.add(code));
    deriveThemes(codes).forEach((theme) => themesFound.add(theme));
    if ((row.interpretation_certainty ?? "") === "Explicit") highConfidence += 1;
  }
  const contributingSources = diagnostics.filter((d) => d.collected > 0).map((d) => d.label);
  const quality = qualityLevelFor({
    reviews: matchedEvidence.length,
    sources: contributingSources.length,
    themes: themesFound.size,
    highConfidence,
  });
  const topOpportunityTitle = opportunityReport.topOpportunities[0]?.opportunityTitle ?? "";

  const manifest = {
    id: runId,
    timestamp: new Date().toISOString(),
    status: "completed" as const,
    config,
    durationMs,
    reviewsCollected: matchedEvidence.length,
    opportunitiesFound: opportunityReport.topOpportunities.length,
    themesFound: themesFound.size,
    qualityLevel: quality.level,
    topOpportunityTitle,
    sourceLabels: contributingSources,
    outputs,
  };
  outputs.runManifest = relToRoot(repoRoot, recordRun(manifest));
  stage("finalizing", "done", `Recommendation ready in ${(durationMs / 1000).toFixed(1)}s`);

  const sourceLogMap = new Map(sourceLogRows.map((row) => [row.source_id, row]));

  const resultPayload: RunResult = {
    runId,
    config: {
      company: config.company || "Zepto",
      country: config.country,
      dateRange: config.dateRange,
      sources: config.sources,
      objective: config.objective,
      dateFrom,
      dateTo,
    },
    diagnostics,
    summary: {
      totalSources: sourceLogRows.length,
      totalEvidence: evidenceRows.length,
      matchedEvidence: matchedEvidence.length,
      queriesAvailable: queryPackRows.length,
      reviewsCollected: matchedEvidence.length,
      opportunitiesFound: opportunityReport.topOpportunities.length,
      themesFound: themesFound.size,
      behaviorSignals: behaviorCodes.size,
      highConfidence,
      sourceLabels: contributingSources,
      qualityLevel: quality.level,
      qualityScore: quality.score,
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
  recordResult(runId, resultPayload);
  return resultPayload;
}
