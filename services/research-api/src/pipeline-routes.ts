import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { Router } from "express";
import { findRepositoryRoot } from "@zepto/shared-config";

const PIPELINE_STEPS = [
  {
    id: "evidence_collection",
    label: "Evidence Collection",
    description: "Collect behavioral evidence from public sources and pilot datasets.",
    outputs: ["research/pilot/evidence-items.csv", "research/pilot/source-log.csv"],
  },
  {
    id: "candidate_discovery",
    label: "Candidate Discovery",
    description: "Discover category-expansion research candidates.",
    outputs: ["research/discovery-output/category-pilot-candidates.csv"],
  },
  {
    id: "candidate_prioritization",
    label: "Candidate Prioritization",
    description: "Score and prioritize candidates by evidence potential.",
    outputs: ["research/discovery-output/category-pilot-prioritized.csv"],
  },
  {
    id: "opportunity_scoring",
    label: "Opportunity Scoring",
    description: "Score opportunities by behavioural evidence strength and knowledge integration.",
    outputs: [],
  },
  {
    id: "behaviour_knowledge_base",
    label: "Behaviour Knowledge Base",
    description: "Curated behavioural theories, case studies, and interview insights.",
    outputs: [
      "research/behavior/behavioural-theories.csv",
      "research/behavior/commerce-insights.csv",
      "research/behavior/industry-case-studies.csv",
      "research/behavior/industry-findings.csv",
      "research/behavior/interview-insights.csv",
      "research/behavior/research-papers.csv",
      "research/behavior/theories.csv",
    ],
  },
  {
    id: "mvp_recommendation",
    label: "MVP Recommendation",
    description: "Synthesize evidence, analysis, and strategy into the final MVP proposal.",
    outputs: ["docs/MVP_RECOMMENDATION_REPORT.md"],
  },
];

function getRepoRoot(): string {
  const root = findRepositoryRoot();
  if (!root) throw new Error("Could not find repository root. Ensure pnpm-workspace.yaml is reachable.");
  return root;
}

function stepStatus(step: (typeof PIPELINE_STEPS)[number], root: string): "completed" | "data_available" | "pending" {
  if (step.outputs.length === 0) return "pending";
  for (const p of step.outputs) {
    if (existsSync(join(root, p))) return "completed";
  }
  return "pending";
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]!);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]!);
    if (values.length === 1 && values[0] === "") continue;
    const row: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) {
      row[header[j]!] = values[j] ?? "";
    }
    rows.push(row);
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        values.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  values.push(current);
  return values;
}

export function createPipelineRouter(): Router {
  const router = Router();
  const repoRoot = getRepoRoot();

  router.get("/pipeline", (_request, response) => {
    const steps = PIPELINE_STEPS.map((step) => ({
      id: step.id,
      label: step.label,
      description: step.description,
      status: stepStatus(step, repoRoot),
      outputCount: step.outputs.length,
    }));
    response.json({ steps });
  });

  router.get("/pipeline/steps/evidence_collection", async (_request, response) => {
    const filePath = join(repoRoot, "research/pilot/evidence-items.csv");
    if (!existsSync(filePath)) return response.status(404).json({ error: "STEP_DATA_NOT_FOUND", message: "Evidence collection output not found. Run the pilot collection process first." });
    const text = await readFile(filePath, "utf-8");
    response.json({ step: "evidence_collection", label: "Evidence Collection", rows: parseCsv(text) });
  });

  router.get("/pipeline/steps/candidate_discovery", async (_request, response) => {
    const filePath = join(repoRoot, "research/discovery-output/category-pilot-candidates.csv");
    if (!existsSync(filePath)) return response.status(404).json({ error: "STEP_DATA_NOT_FOUND", message: "Candidate discovery output not found." });
    const text = await readFile(filePath, "utf-8");
    response.json({ step: "candidate_discovery", label: "Candidate Discovery", rows: parseCsv(text) });
  });

  router.get("/pipeline/steps/candidate_prioritization", async (_request, response) => {
    const filePath = join(repoRoot, "research/discovery-output/category-pilot-prioritized.csv");
    if (!existsSync(filePath)) return response.status(404).json({ error: "STEP_DATA_NOT_FOUND", message: "Candidate prioritization output not found." });
    const text = await readFile(filePath, "utf-8");
    response.json({ step: "candidate_prioritization", label: "Candidate Prioritization", rows: parseCsv(text) });
  });

  router.get("/pipeline/steps/behaviour_knowledge_base", async (_request, response) => {
    const dir = join(repoRoot, "research/behavior");
    if (!existsSync(dir)) return response.status(404).json({ error: "STEP_DATA_NOT_FOUND", message: "Behaviour knowledge base directory not found." });
    const files = (await readdir(dir)).filter((f) => f.endsWith(".csv"));
    const tables: { file: string; rows: Record<string, string>[] }[] = [];
    for (const file of files) {
      const text = await readFile(join(dir, file), "utf-8");
      tables.push({ file, rows: parseCsv(text) });
    }
    response.json({ step: "behaviour_knowledge_base", label: "Behaviour Knowledge Base", tables });
  });

  router.get("/pipeline/steps/mvp_recommendation", async (_request, response) => {
    const filePath = join(repoRoot, "docs/MVP_RECOMMENDATION_REPORT.md");
    if (!existsSync(filePath)) return response.status(404).json({ error: "STEP_DATA_NOT_FOUND", message: "MVP recommendation report not found." });
    const content = await readFile(filePath, "utf-8");
    response.json({ step: "mvp_recommendation", label: "MVP Recommendation", content });
  });

  return router;
}
