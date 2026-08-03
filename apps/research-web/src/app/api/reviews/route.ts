import { NextRequest, NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";
import { resolveInput, repoDir, latestFileIn } from "@/lib/repo-paths";
import { getLatestRun, loadResult } from "@/lib/run-history";
import type { DiscoveryRunPayload, ReviewMeta } from "@/lib/api";

function parseCsv(path: string | null): Record<string, string>[] {
  if (!path) return [];
  try {
    return parse(readFileSync(path, "utf-8"), { columns: true, skip_empty_lines: true, bom: true, trim: true }) as Record<string, string>[];
  } catch (error) {
    console.error(`[reviews] Could not parse CSV source (${path}):`, error);
    return [];
  }
}

function inDateRange(date: string | undefined, dateFrom: string | null, dateTo: string | null): boolean {
  const value = (date ?? "").trim().slice(0, 10);
  if (!value) return dateFrom === null && dateTo === null;
  if (dateFrom && value < dateFrom) return false;
  if (dateTo && value > dateTo) return false;
  return true;
}

function filtersFor(searchParams: URLSearchParams) {
  return {
    query: searchParams.get("query")?.toLowerCase() ?? "",
    category: searchParams.get("category") ?? "",
    source: searchParams.get("source") ?? "",
    sentiment: searchParams.get("sentiment") ?? "",
    dateFrom: searchParams.get("dateFrom"),
    dateTo: searchParams.get("dateTo"),
  };
}

function toReviewMeta(mode: ReviewMeta["mode"], label: string, total: number, shown: number, dateFilterApplied: boolean): ReviewMeta {
  return { mode, label, total, shown, dateFilterApplied };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const { query, category, source, sentiment, dateFrom, dateTo } = filtersFor(searchParams);

  const matches = (text: string | undefined, needle: string) => needle === "" || (text ?? "").toLowerCase().includes(needle);

  // Prefer the latest run's analysed dataset — the single source of truth.
  // As long as a run payload exists (even with zero evidence) it is served, so
  // every stage stays anchored to the same dataset. Bundled data is only used
  // when no run has been recorded yet.
  const latestRun = getLatestRun();
  const runResult = latestRun ? loadResult(latestRun.id) : null;
  const hasRunPayload = runResult !== null && Array.isArray((runResult as DiscoveryRunPayload).evidence);
  if (hasRunPayload) {
    const runEvidence = (runResult as DiscoveryRunPayload).evidence;
    const mode: ReviewMeta["mode"] = (runResult as DiscoveryRunPayload).summary?.mode ?? "verified";
    const label = mode === "live" ? "Live Reviews" : mode === "cached" ? "Cached Research Dataset" : "Verified Research Dataset";
    const dateFilterApplied = mode === "live" || mode === "cached";
    console.log(`[reviews] Loading ${runEvidence.length} reviews from latest run ${latestRun?.id} (${label}).`);

    const reviews = runEvidence
      .filter((e) => {
        if (query) {
          const text = `${e.paraphrase ?? ""} ${e.excerpt ?? ""} ${e.behavioralCodes?.join(" ") ?? ""}`.toLowerCase();
          if (!text.includes(query)) return false;
        }
        if (category && e.category?.toLowerCase() !== category.toLowerCase()) return false;
        if (source && e.sourceType?.toLowerCase() !== source.toLowerCase()) return false;
        if (sentiment && e.sentiment !== sentiment) return false;
        if (dateFilterApplied && !inDateRange(e.date, dateFrom, dateTo)) return false;
        return true;
      })
      .map((e) => ({
        id: e.id,
        excerpt: e.excerpt,
        paraphrase: e.paraphrase,
        category: e.category,
        mission: e.mission,
        behavioralCodes: e.behavioralCodes ?? [],
        sentiment: e.sentiment,
        certainty: e.certainty,
        confidence: e.confidence,
        sourceType: e.sourceType,
        sourceUrl: e.sourceUrl,
        date: e.date,
        reviewerStatus: e.reviewerStatus,
        source: e.source ? { title: e.source.title, platform: e.source.platform } : null,
      }));

    return NextResponse.json({
      reviews,
      meta: toReviewMeta(mode, label, runEvidence.length, reviews.length, dateFilterApplied),
    });
  }

  // No run has been recorded yet: fall back to the bundled verified dataset.
  // Date filters do NOT apply to the verified research dataset.
  console.log("[reviews] No run recorded yet — loading the bundled verified research dataset.");
  const evidencePath = resolveInput("research/pilot/evidence-items.csv", "pilot/evidence-items.csv");
  const sourceLogPath = resolveInput("research/pilot/source-log.csv", "pilot/source-log.csv");
  const sourceLogRows = parseCsv(sourceLogPath);
  const sourceMap = new Map(sourceLogRows.map((row) => [row.source_id, row]));

  const reviews: {
    id: string;
    excerpt: string;
    paraphrase: string;
    category: string;
    mission: string;
    behavioralCodes: string[];
    sentiment: string;
    certainty: string;
    confidence: number;
    sourceType: string;
    sourceUrl: string;
    date: string;
    reviewerStatus: string;
    source: { title: string; platform: string } | null;
    generated?: boolean;
    priorityScore?: number;
    priorityBand?: string;
    recommendedAction?: string;
  }[] = [];

  for (const row of parseCsv(evidencePath)) {
    if (query) {
      const text = `${row.neutral_paraphrase ?? ""} ${row.minimal_permitted_excerpt ?? ""} ${row.behavioral_codes ?? ""}`.toLowerCase();
      if (!text.includes(query)) continue;
    }
    if (category && row.category_group?.toLowerCase() !== category.toLowerCase()) continue;
    if (source && row.source_type?.toLowerCase() !== source.toLowerCase()) continue;
    if (sentiment && row.evidence_valence !== sentiment) continue;
    const src = sourceMap.get(row.source_id ?? "");
    reviews.push({
      id: row.evidence_id ?? "",
      excerpt: row.minimal_permitted_excerpt ?? "",
      paraphrase: row.neutral_paraphrase ?? "",
      category: row.category_group ?? "",
      mission: row.shopping_mission ?? "",
      behavioralCodes: (row.behavioral_codes ?? "").split(";").map((c) => c.trim()).filter(Boolean),
      sentiment: row.evidence_valence ?? "",
      certainty: row.interpretation_certainty ?? "",
      confidence: row.interpretation_certainty === "Explicit" ? 0.9 : row.interpretation_certainty === "Strongly implied" ? 0.7 : 0.5,
      sourceType: row.source_type ?? "",
      sourceUrl: row.source_url ?? "",
      date: row.publication_date ?? "",
      reviewerStatus: row.reviewer_status ?? "",
      source: src ? { title: src.source_title ?? "", platform: src.platform ?? "" } : null,
    });
  }

  const discoveryDir = repoDir("research/discovery-output");
  if (discoveryDir) {
    const prioritizedPath = latestFileIn(discoveryDir, { suffix: "-prioritized.csv" });
    if (prioritizedPath) {
      for (const row of parseCsv(prioritizedPath)) {
        if (query) {
          const text = `${row.title ?? ""} ${row.snippet ?? ""}`.toLowerCase();
          if (!text.includes(query)) continue;
        }
        if (category && row.category?.toLowerCase() !== category.toLowerCase()) continue;
        if (source && row.source_type?.toLowerCase() !== source.toLowerCase()) continue;
        if (sentiment) continue;
        reviews.push({
          id: row.candidate_id ?? "",
          excerpt: row.snippet ?? "",
          paraphrase: row.title ?? "",
          category: row.category ?? "",
          mission: row.behavior_focus ?? "",
          behavioralCodes: [],
          sentiment: "",
          certainty: "",
          confidence: Number(row.priority_score ?? 0) / 100,
          sourceType: row.source_type ?? "",
          sourceUrl: row.url ?? "",
          date: "",
          reviewerStatus: "Generated candidate",
          source: null,
          generated: true,
          priorityScore: Number(row.priority_score ?? 0),
          priorityBand: row.priority_band ?? "",
          recommendedAction: row.recommended_action ?? "",
        });
      }
    }
  }

  console.log(`[reviews] Returning ${reviews.length} reviews from the bundled verified research dataset.`);
  return NextResponse.json({
    reviews,
    meta: toReviewMeta("verified", "Verified Research Dataset", reviews.length, reviews.length, false),
  });
}
