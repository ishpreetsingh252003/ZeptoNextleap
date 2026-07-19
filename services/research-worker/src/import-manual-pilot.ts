import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "csv-parse/sync";
import { eq } from "drizzle-orm";
import { collectionRuns, closeDb, evidenceItems, getDb, projects, sources } from "@zepto/research-database";
import { contentHash } from "./lib/text.js";

type CsvRow = Record<string, string>;

async function main(): Promise<void> {
  const db = getDb();
  const existing = await db.select({ id: projects.id }).from(projects).where(eq(projects.datasetLabel, "Manual Pilot v1")).limit(1);
  if (existing[0]) {
    console.log(`Manual Pilot v1 is already imported as project ${existing[0].id}.`);
    return;
  }
  const pilotRoot = resolve(import.meta.dirname, "../../../research/pilot");
  const [sourceCsv, evidenceCsv] = await Promise.all([
    readFile(resolve(pilotRoot, "source-log.csv"), "utf8"),
    readFile(resolve(pilotRoot, "evidence-items.csv"), "utf8")
  ]);
  const sourceRows = parse(sourceCsv, { columns: true, skip_empty_lines: true }) as CsvRow[];
  const evidenceRows = parse(evidenceCsv, { columns: true, skip_empty_lines: true }) as CsvRow[];

  await db.transaction(async (tx) => {
    const [project] = await tx.insert(projects).values({ name: "Manual Pilot v1", description: "Approved first-batch evidence imported without automated collection or AI analysis.", datasetLabel: "Manual Pilot v1" }).returning({ id: projects.id });
    if (!project) throw new Error("Could not create the Manual Pilot v1 project.");
    const [run] = await tx.insert(collectionRuns).values({ projectId: project.id, sourceType: "manual_pilot", input: { label: "Manual Pilot v1", import: "research/pilot/*.csv" }, status: "completed", currentStage: "human_review", maxRecords: sourceRows.length, sourceCount: sourceRows.filter((row) => row.review_status === "Retained").length, evidenceCount: evidenceRows.length, completedAt: new Date() }).returning({ id: collectionRuns.id });
    if (!run) throw new Error("Could not create the Manual Pilot v1 run.");

    const sourceIds = new Map<string, string>();
    for (const row of sourceRows.filter((candidate) => candidate.review_status === "Retained")) {
      const [source] = await tx.insert(sources).values({ projectId: project.id, collectionRunId: run.id, externalId: row.source_id ?? "", sourceType: "manual_pilot", platform: row.platform ?? "Unknown", url: row.source_url ?? "", canonicalUrl: row.source_url ?? "", title: row.source_title || null, publicationDate: row.publication_date ? new Date(row.publication_date) : null, capturedAt: new Date(row.capture_date ?? new Date().toISOString()), normalizedContent: null, contentHash: contentHash(`${row.source_id}:${row.source_url}`), accessMethod: "manual_import", policyNote: row.policy_status || "Imported from the approved manual pilot; see source log." }).returning({ id: sources.id });
      if (source) sourceIds.set(row.source_id ?? "", source.id);
    }

    for (const row of evidenceRows) {
      const sourceId = sourceIds.get(row.source_id ?? "");
      if (!sourceId) throw new Error(`Evidence ${row.evidence_id} references an unavailable retained source.`);
      await tx.insert(evidenceItems).values({ sourceId, neutralParaphrase: row.neutral_paraphrase ?? "", minimalExcerpt: row.minimal_permitted_excerpt ?? "", categoryGroup: row.category_group ?? "Unknown", shoppingMission: row.shopping_mission ?? "Unknown", behavioralCodes: (row.behavioral_codes ?? "").split(";").map((value) => value.trim()).filter(Boolean), interpretationCertainty: (row.interpretation_certainty ?? "unknown").toLowerCase(), outcome: row.outcome_if_stated || null, applicability: row.applicability ?? "Category-general contextual", transferRationale: row.transfer_rationale ?? "Not recorded.", evidenceValence: row.evidence_valence ?? "mixed", reviewerStatus: "pending", limitations: `${row.notes_or_limitations ?? ""} Original pilot evidence ID: ${row.evidence_id}.`.trim() });
    }
    console.log(`Imported Manual Pilot v1: ${sourceIds.size} sources and ${evidenceRows.length} evidence items.`);
  });
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(closeDb);
