import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import { dataDir } from "./data-paths";
import type { DiscoveryConfig } from "./api";

export type RunManifest = {
  id: string;
  timestamp: string;
  status: "completed" | "failed";
  config: DiscoveryConfig;
  durationMs: number;
  reviewsCollected: number;
  opportunitiesFound: number;
  outputs: Record<string, string>;
};

function runsDir(): string {
  const dir = join(dataDir(), "runs");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function runDir(runId: string): string {
  const dir = join(runsDir(), runId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function recordRun(manifest: RunManifest): string {
  const file = join(runDir(manifest.id), "run.json");
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return file;
}

export function writeSynthesis(runId: string, payload: unknown): string {
  const file = join(runDir(runId), "synthesis.json");
  writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return file;
}

export function listRuns(): RunManifest[] {
  const dir = runsDir();
  const ids = readdirSync(dir).filter((name) => existsSync(join(dir, name, "run.json")));
  const runs: RunManifest[] = [];
  for (const id of ids) {
    try {
      runs.push(JSON.parse(readFileSync(join(dir, id, "run.json"), "utf8")) as RunManifest);
    } catch {
      // skip unreadable manifests
    }
  }
  return runs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function getLatestRun(): RunManifest | null {
  return listRuns()[0] ?? null;
}

export function latestSynthesis(): { runId: string; payload: unknown } | null {
  const dir = runsDir();
  const ids = readdirSync(dir)
    .filter((name) => existsSync(join(dir, name, "synthesis.json")))
    .sort((a, b) => b.localeCompare(a));
  if (ids.length === 0) return null;
  const runId = ids[0]!;
  try {
    return { runId, payload: JSON.parse(readFileSync(join(dir, runId, "synthesis.json"), "utf8")) };
  } catch {
    return null;
  }
}
