import { NextRequest, NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";
import { resolveInput, repoDir, latestFileIn } from "@/lib/repo-paths";

function parseCsv(path: string | null): Record<string, string>[] {
  if (!path) return [];
  try {
    return parse(readFileSync(path, "utf-8"), { columns: true, skip_empty_lines: true, bom: true, trim: true }) as Record<string, string>[];
  } catch (error) {
    console.error(`[reviews] Could not parse CSV source (${path}):`, error);
    return [];
  }
}

export async function GET(request: NextRequest) {
  console.log("[reviews] Loading latest run...");
  const evidencePath = resolveInput("research/pilot/evidence-items.csv", "pilot/evidence-items.csv");
  const sourceLogPath = resolveInput("research/pilot/source-log.csv", "pilot/source-log.csv");
  if (!evidencePath) {
    console.log("[reviews] Evidence corpus is missing — returning empty reviews.");
  } else {
    console.log(`[reviews] Loading bundled reviews from ${evidencePath}.`);
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query")?.toLowerCase() ?? "";
  const category = searchParams.get("category") ?? "";
  const source = searchParams.get("source") ?? "";
  const sentiment = searchParams.get("sentiment") ?? "";

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

  const sourceLogRows = parseCsv(sourceLogPath);
  const sourceMap = new Map(sourceLogRows.map((row) => [row.source_id, row]));

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

  return NextResponse.json({ reviews });
}
