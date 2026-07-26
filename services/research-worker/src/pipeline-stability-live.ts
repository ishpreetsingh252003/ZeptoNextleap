import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

type StageStatus = "success" | "failed" | "not_reached";

export type StabilityRunRecord = {
  run: number;
  corpusFingerprint: string;
  eligibleDocumentCount: number;
  collection: StageStatus;
  evidence: StageStatus;
  theme: StageStatus;
  insight: StageStatus;
  corpusValid: boolean;
  runtimeMilliseconds: number;
  providerAttempts: number;
  retryCount: number;
  firstFailureStage: string;
  failureCategory: string;
  failedBatchIndex: number | null;
  evidenceCount: number | null;
  themeCount: number | null;
  insightCount: number | null;
  failedBatchFingerprint: string | null;
  themeObservedBatches: number;
  themeRepairRequests: number;
  themeInitialIncompleteBatches: number;
  themeRepairSuccesses: number;
  themeRepairs: Array<{
    batchIndex: number;
    batchFingerprint: string;
    initialMissingCount: number;
    repairedAssignmentCount: number;
    remainingMissingCount: number;
  }>;
  quoteMismatches: Array<{
    categories: string[];
    quoteLength: number;
    sourceLength: number;
    editDistance: number;
    normalizationAloneMatched: boolean;
  }>;
};

type HarnessOptions = {
  runs: number;
  snapshotPath: string;
  maxAiRequests: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function numberField(value: Record<string, unknown>, name: string): number {
  const field = value[name];
  return typeof field === "number" && Number.isFinite(field) ? field : 0;
}

function extractJsonObject(output: string): unknown {
  const start = output.indexOf("{");
  if (start === -1) throw new Error("Live validation did not return a JSON result.");
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < output.length; index += 1) {
    const character = output[index]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === "\"") inString = false;
      continue;
    }
    if (character === "\"") inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return JSON.parse(output.slice(start, index + 1)) as unknown;
    }
  }
  throw new Error("Live validation returned incomplete JSON.");
}

function stageStatuses(
  corpusValid: boolean,
  firstFailureStage: string
): Pick<StabilityRunRecord, "evidence" | "theme" | "insight"> {
  if (corpusValid) return { evidence: "success", theme: "success", insight: "success" };
  if (firstFailureStage === "evidence_extraction") {
    return { evidence: "failed", theme: "not_reached", insight: "not_reached" };
  }
  if (firstFailureStage === "theme_clustering" || firstFailureStage === "theme_consolidation") {
    return { evidence: "success", theme: "failed", insight: "not_reached" };
  }
  if (firstFailureStage === "insight_generation" || firstFailureStage === "insight_aggregation") {
    return { evidence: "success", theme: "success", insight: "failed" };
  }
  return { evidence: "not_reached", theme: "not_reached", insight: "not_reached" };
}

function sanitizedQuoteMismatches(
  diagnostics: Record<string, unknown> | null
): StabilityRunRecord["quoteMismatches"] {
  if (!diagnostics || !Array.isArray(diagnostics.providerAttempts)) return [];
  const mismatches: StabilityRunRecord["quoteMismatches"] = [];
  for (const attempt of diagnostics.providerAttempts) {
    if (!isRecord(attempt) || !isRecord(attempt.quoteMismatch)) continue;
    const mismatch = attempt.quoteMismatch;
    const categories = Array.isArray(mismatch.categories)
      ? mismatch.categories.filter((category): category is string =>
        typeof category === "string"
      )
      : [];
    mismatches.push({
      categories,
      quoteLength: numberField(mismatch, "quoteLength"),
      sourceLength: numberField(mismatch, "sourceLength"),
      editDistance: numberField(mismatch, "editDistance"),
      normalizationAloneMatched: mismatch.normalizationAloneMatched === true
    });
  }
  return mismatches;
}

export function toStabilityRunRecord(
  run: number,
  runtimeMilliseconds: number,
  value: unknown
): StabilityRunRecord {
  if (!isRecord(value)) throw new Error("Live validation result must be an object.");
  const corpusValid = value.status === "completed" && value.corpusResult === "valid";
  const firstFailureStage = corpusValid
    ? "none"
    : typeof value.failedStage === "string"
      ? value.failedStage
      : typeof value.stage === "string"
        ? value.stage
        : "unknown";
  const diagnostics = isRecord(value.diagnostics) ? value.diagnostics : null;
  const categories = diagnostics && Array.isArray(diagnostics.validationCategories)
    ? diagnostics.validationCategories
    : [];
  const failureCategory = corpusValid
    ? "none"
    : typeof categories[0] === "string"
      ? categories[0]
      : "OTHER";
  const providerAttempts = numberField(value, "totalAiRequests")
    || (isRecord(value.metrics) ? numberField(value.metrics, "totalAiRequests") : 0);
  const completedBatchCount = numberField(value, "completedBatchCount");
  const retryCount = corpusValid
    ? numberField(value, "retryCount")
    : Math.max(0, providerAttempts - (completedBatchCount + (providerAttempts > 0 ? 1 : 0)));
  const collection = numberField(value, "collected") > 0
    ? "success"
    : firstFailureStage === "collection_or_configuration"
      ? "failed"
      : "not_reached";
  const batchDescriptors = Array.isArray(value.batchDescriptors) ? value.batchDescriptors : [];
  const failedBatchIndex = typeof value.failedBatchIndex === "number"
    ? value.failedBatchIndex
    : null;
  const failedDescriptor = firstFailureStage !== "evidence_extraction"
    || failedBatchIndex === null
    ? null
    : batchDescriptors.find((descriptor) =>
      isRecord(descriptor) && descriptor.batchIndex === failedBatchIndex
    );
  const themeBatchMetrics = Array.isArray(value.themeBatchMetrics)
    ? value.themeBatchMetrics.filter(isRecord)
    : isRecord(value.metrics) && Array.isArray(value.metrics.themeBatchMetrics)
      ? value.metrics.themeBatchMetrics.filter(isRecord)
      : [];
  const themeRepairRequests = themeBatchMetrics.reduce(
    (total, metric) => total + numberField(metric, "repairRequestCount"),
    0
  );
  const themeInitialIncompleteBatches = themeBatchMetrics.filter(
    (metric) => numberField(metric, "initialMissingCount") > 0
  ).length;
  const themeRepairSuccesses = themeBatchMetrics.filter(
    (metric) => numberField(metric, "repairRequestCount") > 0
      && numberField(metric, "remainingMissingCount") === 0
      && metric.finalValidationCategory === "valid"
  ).length;
  const themeRepairs = themeBatchMetrics
    .filter((metric) => numberField(metric, "repairRequestCount") > 0)
    .map((metric) => ({
      batchIndex: numberField(metric, "batchIndex"),
      batchFingerprint: typeof metric.batchFingerprint === "string"
        ? metric.batchFingerprint
        : "",
      initialMissingCount: numberField(metric, "initialMissingCount"),
      repairedAssignmentCount: numberField(metric, "repairedAssignmentCount"),
      remainingMissingCount: numberField(metric, "remainingMissingCount")
    }));

  return {
    run,
    corpusFingerprint: typeof value.fingerprint === "string" ? value.fingerprint : "",
    eligibleDocumentCount: numberField(value, "eligible"),
    collection,
    ...stageStatuses(corpusValid, firstFailureStage),
    corpusValid,
    runtimeMilliseconds,
    providerAttempts,
    retryCount,
    firstFailureStage,
    failureCategory,
    failedBatchIndex,
    evidenceCount: corpusValid ? numberField(value, "evidenceCount") : null,
    themeCount: corpusValid ? numberField(value, "themeCount") : null,
    insightCount: corpusValid ? numberField(value, "insightCount") : null,
    failedBatchFingerprint: isRecord(failedDescriptor)
      && typeof failedDescriptor.fingerprint === "string"
      ? failedDescriptor.fingerprint
      : null,
    themeObservedBatches: themeBatchMetrics.length,
    themeRepairRequests,
    themeInitialIncompleteBatches,
    themeRepairSuccesses,
    themeRepairs,
    quoteMismatches: sanitizedQuoteMismatches(diagnostics)
  };
}

export function summarizeStability(records: readonly StabilityRunRecord[]): {
  totalRuns: number;
  successfulRuns: number;
  successRate: number;
  evidenceFailureFrequency: number;
  themeFailureFrequency: number;
  insightFailureFrequency: number;
  mostCommonFailureCategory: string;
  averageRuntimeMilliseconds: number;
  mismatchAttemptCount: number;
  mismatchCategoryFrequency: Record<string, number>;
  normalizationAloneMatchCount: number;
  averageQuoteLength: number;
  averageSourceLength: number;
  averageEditDistance: number;
  fingerprintConsistent: boolean;
  failedBatchRecurrence: Record<string, number>;
  themeInitialCompletenessRate: number;
  themeRepairSuccessRate: number;
  averageAdditionalRepairRequests: number;
  themeRepairBatchRecurrence: Record<string, number>;
} {
  const failures = records.filter(({ corpusValid }) => !corpusValid);
  const categoryCounts = new Map<string, number>();
  for (const { failureCategory } of failures) {
    categoryCounts.set(failureCategory, (categoryCounts.get(failureCategory) ?? 0) + 1);
  }
  const mostCommonFailureCategory = [...categoryCounts.entries()]
    .sort(([firstCategory, firstCount], [secondCategory, secondCount]) =>
      secondCount - firstCount || firstCategory.localeCompare(secondCategory)
    )[0]?.[0] ?? "none";
  const successfulRuns = records.filter(({ corpusValid }) => corpusValid).length;
  const quoteMismatches = records.flatMap(({ quoteMismatches }) => quoteMismatches);
  const observedThemeBatches = records.reduce(
    (total, { themeObservedBatches }) => total + themeObservedBatches,
    0
  );
  const incompleteThemeBatches = records.reduce(
    (total, { themeInitialIncompleteBatches }) => total + themeInitialIncompleteBatches,
    0
  );
  const repairRequests = records.reduce(
    (total, { themeRepairRequests }) => total + themeRepairRequests,
    0
  );
  const repairSuccesses = records.reduce(
    (total, { themeRepairSuccesses }) => total + themeRepairSuccesses,
    0
  );
  const themeRepairBatchRecurrence: Record<string, number> = {};
  for (const repair of records.flatMap(({ themeRepairs }) => themeRepairs)) {
    if (repair.batchFingerprint) {
      themeRepairBatchRecurrence[repair.batchFingerprint] =
        (themeRepairBatchRecurrence[repair.batchFingerprint] ?? 0) + 1;
    }
  }
  const mismatchCategoryFrequency: Record<string, number> = {};
  const failedBatchRecurrence: Record<string, number> = {};
  for (const { failedBatchFingerprint } of failures) {
    if (failedBatchFingerprint) {
      failedBatchRecurrence[failedBatchFingerprint] =
        (failedBatchRecurrence[failedBatchFingerprint] ?? 0) + 1;
    }
  }
  for (const { categories } of quoteMismatches) {
    for (const category of categories) {
      mismatchCategoryFrequency[category] = (mismatchCategoryFrequency[category] ?? 0) + 1;
    }
  }
  const mismatchAverage = (
    value: (mismatch: StabilityRunRecord["quoteMismatches"][number]) => number
  ): number => quoteMismatches.length === 0
    ? 0
    : quoteMismatches.reduce((total, mismatch) => total + value(mismatch), 0)
      / quoteMismatches.length;
  return {
    totalRuns: records.length,
    successfulRuns,
    successRate: records.length === 0 ? 0 : successfulRuns / records.length,
    evidenceFailureFrequency: records.filter(({ evidence }) => evidence === "failed").length,
    themeFailureFrequency: records.filter(({ theme }) => theme === "failed").length,
    insightFailureFrequency: records.filter(({ insight }) => insight === "failed").length,
    mostCommonFailureCategory,
    averageRuntimeMilliseconds: records.length === 0
      ? 0
      : records.reduce((total, { runtimeMilliseconds }) =>
        total + runtimeMilliseconds, 0) / records.length,
    mismatchAttemptCount: quoteMismatches.length,
    mismatchCategoryFrequency,
    normalizationAloneMatchCount: quoteMismatches.filter(
      ({ normalizationAloneMatched }) => normalizationAloneMatched
    ).length,
    averageQuoteLength: mismatchAverage(({ quoteLength }) => quoteLength),
    averageSourceLength: mismatchAverage(({ sourceLength }) => sourceLength),
    averageEditDistance: mismatchAverage(({ editDistance }) => editDistance),
    fingerprintConsistent: new Set(records.map(({ corpusFingerprint }) => corpusFingerprint)).size <= 1
      && records.every(({ corpusFingerprint }) => corpusFingerprint.length === 64),
    failedBatchRecurrence,
    themeInitialCompletenessRate: observedThemeBatches === 0
      ? 0
      : (observedThemeBatches - incompleteThemeBatches) / observedThemeBatches,
    themeRepairSuccessRate: repairRequests === 0 ? 0 : repairSuccesses / repairRequests,
    averageAdditionalRepairRequests: records.length === 0
      ? 0
      : repairRequests / records.length,
    themeRepairBatchRecurrence
  };
}

function positiveInteger(value: string | undefined, name: string, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

function parseOptions(args: readonly string[]): HarnessOptions {
  const valueAfter = (name: string): string | undefined => {
    const index = args.indexOf(name);
    return index === -1 ? undefined : args[index + 1];
  };
  const snapshotPath = valueAfter("--snapshot");
  if (!snapshotPath) throw new Error("--snapshot is required; stability runs never collect live data.");
  return {
    runs: positiveInteger(valueAfter("--runs"), "--runs", 10),
    snapshotPath: resolve(snapshotPath),
    maxAiRequests: positiveInteger(valueAfter("--max-ai-requests"), "--max-ai-requests", 64)
  };
}

async function executeLiveRun(options: HarnessOptions): Promise<{
  runtimeMilliseconds: number;
  value: unknown;
}> {
  const pnpmPath = process.env.npm_execpath;
  if (!pnpmPath) throw new Error("pnpm execution path is unavailable.");
  const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const startedAt = performance.now();
  const stdout = await new Promise<string>((resolveOutput, reject) => {
    const child = spawn(process.execPath, [
      pnpmPath,
      "--filter",
      "@zepto/research-worker",
      "corpus:live",
      "--",
      "replay",
      "--input",
      options.snapshotPath,
      "--max-ai-requests",
      String(options.maxAiRequests)
    ], {
      cwd: workspaceRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
    });
    child.stderr.resume();
    child.on("error", reject);
    child.on("close", () => resolveOutput(output));
  });
  return {
    runtimeMilliseconds: performance.now() - startedAt,
    value: extractJsonObject(stdout)
  };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const records: StabilityRunRecord[] = [];
  let expectedFingerprint: string | null = null;
  for (let run = 1; run <= options.runs; run += 1) {
    try {
      const result = await executeLiveRun(options);
      const record = toStabilityRunRecord(run, result.runtimeMilliseconds, result.value);
      if (!record.corpusFingerprint || (
        expectedFingerprint !== null
        && record.corpusFingerprint !== expectedFingerprint
      )) {
        throw new Error("Frozen corpus fingerprint changed between replay runs.");
      }
      expectedFingerprint ??= record.corpusFingerprint;
      records.push(record);
      process.stdout.write(`${JSON.stringify({ type: "stability_run", ...record })}\n`);
    } catch {
      const record = toStabilityRunRecord(run, 0, {
        status: "failed",
        stage: "harness_execution",
        diagnostics: { validationCategories: ["OTHER"] }
      });
      records.push(record);
      process.stdout.write(`${JSON.stringify({ type: "stability_run", ...record })}\n`);
    }
  }
  process.stdout.write(`${JSON.stringify({
    type: "stability_summary",
    configuration: options,
    summary: summarizeStability(records)
  }, null, 2)}\n`);
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stdout.write(`${JSON.stringify({
      type: "stability_summary",
      status: "failed",
      failureCategory: "OTHER"
    })}\n`);
    process.exitCode = 1;
  });
}
