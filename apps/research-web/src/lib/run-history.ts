import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import { runtimeRoot } from "./data-paths";
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

/**
 * Runs are persisted under the runtime root so the directory is always
 * writable (repo root locally, OS temp on serverless). All filesystem
 * operations below are defensive: a missing or unwritable runs directory
 * must never crash an endpoint — callers fall back to bundled data instead.
 */
function runsDir(): string {
  const dir = join(runtimeRoot(), "apps", "research-web", "data", "runs");
  try {
    mkdirSync(dir, { recursive: true });
  } catch (error) {
    console.error(`[run-history] runs directory is not writable (${dir}):`, error);
  }
  return dir;
}

export function runDir(runId: string): string {
  const dir = join(runsDir(), runId);
  try {
    mkdirSync(dir, { recursive: true });
  } catch (error) {
    console.error(`[run-history] run directory is not writable (${dir}):`, error);
  }
  return dir;
}

export function recordRun(manifest: RunManifest): string {
  const file = join(runDir(manifest.id), "run.json");
  try {
    writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  } catch (error) {
    console.error(`[run-history] failed to persist run manifest (${file}):`, error);
  }
  return file;
}

export function writeSynthesis(runId: string, payload: unknown): string {
  const file = join(runDir(runId), "synthesis.json");
  try {
    writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  } catch (error) {
    console.error(`[run-history] failed to persist synthesis (${file}):`, error);
  }
  return file;
}

export function listRuns(): RunManifest[] {
  const dir = runsDir();
  let ids: string[];
  try {
    ids = readdirSync(dir).filter((name) => existsSync(join(dir, name, "run.json")));
  } catch (error) {
    console.error(`[run-history] could not read runs directory (${dir}):`, error);
    return [];
  }
  const runs: RunManifest[] = [];
  for (const id of ids) {
    try {
      runs.push(JSON.parse(readFileSync(join(dir, id, "run.json"), "utf8")) as RunManifest);
    } catch (error) {
      console.error(`[run-history] skipping unreadable run manifest (${id}):`, error);
    }
  }
  return runs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function getLatestRun(): RunManifest | null {
  return listRuns()[0] ?? null;
}

export function latestSynthesis(): { runId: string; payload: unknown } | null {
  const dir = runsDir();
  let ids: string[];
  try {
    ids = readdirSync(dir)
      .filter((name) => existsSync(join(dir, name, "synthesis.json")))
      .sort((a, b) => b.localeCompare(a));
  } catch (error) {
    console.error(`[run-history] could not read runs directory (${dir}):`, error);
    return null;
  }
  if (ids.length === 0) return null;
  const runId = ids[0]!;
  try {
    return { runId, payload: JSON.parse(readFileSync(join(dir, runId, "synthesis.json"), "utf8")) };
  } catch (error) {
    console.error(`[run-history] skipping unreadable synthesis (${runId}):`, error);
    return null;
  }
}
