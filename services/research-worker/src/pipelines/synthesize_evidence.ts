/**
 * @module [PRODUCTION]
 * Deterministic evidence synthesis pipeline.
 * Reads reviewed evidence CSV and behavioural knowledge CSV files (local only),
 * links evidence to behavioural concepts defined in behavioural_concepts.json,
 * and outputs a JSON file containing an array of EvidenceLink objects.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { parseReviewedEvidenceCsv, parseBehaviourKnowledgeCsv } from "../research/opportunity-scoring.js";

interface BehaviouralConcept {
  id: string;
  name: string;
  description?: string;
}

interface EvidenceLink {
  evidenceId: string;
  conceptId: string;
  relevanceScore: number; // 0‑1 deterministic placeholder
}

async function loadBehaviouralConcepts(path: string): Promise<BehaviouralConcept[]> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as BehaviouralConcept[];
}

async function main() {
  const [,, evidenceCsvPath, behaviourCsvPath, conceptsJsonPath, outputPath] = process.argv;
  if (!evidenceCsvPath || !behaviourCsvPath || !conceptsJsonPath || !outputPath) {
    console.error("Usage: node synthesize_evidence.ts <evidenceCsv> <behaviourCsv> <conceptsJson> <outputJson>");
    process.exit(1);
  }

  // Load data
  const evidenceCsv = await readFile(evidenceCsvPath, "utf8");
  const behaviourCsv = await readFile(behaviourCsvPath, "utf8");
  const concepts = await loadBehaviouralConcepts(conceptsJsonPath);

  const evidence = parseReviewedEvidenceCsv(evidenceCsv);
  const behaviourKnowledge = parseBehaviourKnowledgeCsv(behaviourCsv, "behavioural_theories");

  // Simple deterministic linking: if any behavioural theme of evidence matches a concept name (case‑insensitive), create a link.
  const conceptMap = new Map<string, string>(); // normalized concept name -> id
  for (const c of concepts) {
    conceptMap.set(c.name.trim().toLowerCase(), c.id);
  }

  const links: EvidenceLink[] = [];
  for (const ev of evidence) {
    for (const theme of ev.behaviouralThemes) {
      const conceptId = conceptMap.get(theme);
      if (conceptId) {
        links.push({ evidenceId: ev.evidenceId, conceptId, relevanceScore: 1 });
      }
    }
  }

  // Ensure output directory exists
  await mkdir(dirname(resolve(outputPath)), { recursive: true });
  await writeFile(outputPath, JSON.stringify(links, null, 2), "utf8");
  console.log(`Wrote ${links.length} evidence links to ${outputPath}`);
}

main().catch((err) => {
  console.error("Error in synthesize_evidence:", err);
  process.exit(1);
});
