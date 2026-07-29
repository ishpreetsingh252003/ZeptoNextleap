/**
 * @module [LEGACY RUNTIME]
 * Long-running database worker loop processing collection runs via PostgreSQL.
 * Retained for database-driven execution mode; offline MVP pipeline uses CLI/deterministic commands.
 */
import { closeDb } from "@zepto/research-database";

import { getServerEnv, loadRootEnv } from "@zepto/shared-config";
import { claimNextRun, processRun } from "./pipeline.js";

loadRootEnv();
const env = getServerEnv();
let stopping = false;

async function loop(): Promise<void> {
  while (!stopping) {
    const run = await claimNextRun();
    if (run) await processRun(run, env);
    else await new Promise((resolve) => setTimeout(resolve, env.WORKER_POLL_INTERVAL_MS));
  }
}

async function stop(): Promise<void> {
  stopping = true;
  await closeDb();
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

loop().catch(async (error) => {
  console.error("Research worker stopped unexpectedly.");
  await closeDb();
  process.exitCode = 1;
});
