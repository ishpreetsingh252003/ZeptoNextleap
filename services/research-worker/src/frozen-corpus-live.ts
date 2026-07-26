import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getServerEnv,
  loadRootEnv,
  type ServerEnv
} from "@zepto/shared-config";
import type { CreateCollectionRunInput } from "@zepto/research-contracts";
import { createAiProvider } from "./ai/factory.js";
import { getAdapter } from "./adapters/index.js";
import {
  AnalysisBatchError,
  analysisScaleConfigFromEnv,
  completedDocumentCountForStage,
  runScaledAnalysisPipeline
} from "./analysis-scale.js";
import {
  createFrozenCorpusSnapshot,
  documentsFromFrozenCorpus,
  evidenceInputBatchDescriptors,
  loadFrozenCorpusSnapshot,
  writeFrozenCorpusSnapshot
} from "./corpus-snapshot.js";
import { prepareCorpusForAnalysis } from "./analysis-scale.js";

type SnapshotOptions = {
  mode: "snapshot";
  output: string;
  packageId: string;
  reviewCount: number;
};

type ReplayOptions = {
  mode: "replay";
  input: string;
  maxAiRequests: number;
};

function valueAfter(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function positiveInteger(value: string | undefined, name: string, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

export function parseFrozenCorpusOptions(args: readonly string[]): SnapshotOptions | ReplayOptions {
  const normalizedArgs = args[0] === "--" ? args.slice(1) : args;
  const mode = normalizedArgs[0];
  if (mode === "snapshot") {
    const output = valueAfter(normalizedArgs, "--output");
    if (!output) throw new Error("Snapshot mode requires --output.");
    return {
      mode,
      output: resolve(output),
      packageId: valueAfter(normalizedArgs, "--package") ?? "com.zeptoconsumerapp",
      reviewCount: positiveInteger(valueAfter(normalizedArgs, "--review-count"), "--review-count", 1_000)
    };
  }
  if (mode === "replay") {
    const input = valueAfter(normalizedArgs, "--input");
    if (!input) throw new Error("Replay mode requires --input.");
    return {
      mode,
      input: resolve(input),
      maxAiRequests: positiveInteger(valueAfter(normalizedArgs, "--max-ai-requests"), "--max-ai-requests", 64)
    };
  }
  throw new Error("Use either snapshot or replay mode.");
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export async function runFrozenCorpusCommand(
  options: SnapshotOptions | ReplayOptions,
  dependencies: {
    env?: ServerEnv;
    getAdapterFn?: typeof getAdapter;
    createAiProviderFn?: typeof createAiProvider;
    runPipelineFn?: typeof runScaledAnalysisPipeline;
  } = {}
): Promise<Record<string, unknown>> {
  const env = dependencies.env ?? getServerEnv();
  const config = analysisScaleConfigFromEnv(env);

  if (options.mode === "snapshot") {
    const adapter = (dependencies.getAdapterFn ?? getAdapter)("google_play", env);
    const input: CreateCollectionRunInput = {
      projectId: "00000000-0000-4000-8000-000000000001",
      sourceType: "google_play",
      urlOrQuery: options.packageId,
      policyConfirmed: true,
      maxRecords: options.reviewCount
    };
    let paginationDepth = 0;
    const collected = await adapter.collect(input, {
      maxRecords: options.reviewCount,
      onPageCollected: ({ pageNumber }) => {
        paginationDepth = Math.max(paginationDepth, pageNumber);
      }
    });
    const { measurement, eligibleDocuments, duplicateCount } = prepareCorpusForAnalysis(collected);
    const snapshot = createFrozenCorpusSnapshot({
      requestedCount: options.reviewCount,
      collectedCount: collected.length,
      paginationDepth,
      invalid: 0,
      normalizedEmpty: measurement.normalizedEmptyCount,
      exactDuplicates: duplicateCount,
      eligibleDocuments
    });
    await writeFrozenCorpusSnapshot(options.output, snapshot);
    return {
      status: "snapshot_created",
      sourceMode: snapshot.sourceMode,
      snapshotPath: options.output,
      fingerprint: snapshot.fingerprint.value,
      requested: snapshot.requestedCount,
      collected: snapshot.collectedCount,
      paginationDepth: snapshot.paginationDepth,
      ...snapshot.reconciliation,
      eligible: snapshot.eligibleCount,
      batchDescriptors: evidenceInputBatchDescriptors(snapshot.records, config.evidence),
      aiExecuted: false
    };
  }

  const snapshot = await loadFrozenCorpusSnapshot(options.input);
  const documents = documentsFromFrozenCorpus(snapshot);
  const batchDescriptors = evidenceInputBatchDescriptors(snapshot.records, config.evidence);
  try {
    const result = await (dependencies.runPipelineFn ?? runScaledAnalysisPipeline)(
      documents,
      (dependencies.createAiProviderFn ?? createAiProvider)(env),
      { ...config, maxAiRequests: options.maxAiRequests }
    );
    return {
      status: "completed",
      corpusResult: "valid",
      sourceMode: "frozen_replay",
      snapshotPath: options.input,
      fingerprint: snapshot.fingerprint.value,
      collected: snapshot.collectedCount,
      eligible: snapshot.eligibleCount,
      paginationDepth: snapshot.paginationDepth,
      evidenceCount: result.evidence.length,
      themeCount: result.themes.length,
      insightCount: result.insights.length,
      retryCount: Math.max(0, result.metrics.totalAiRequests - result.metrics.completedBatches.length),
      batchDescriptors,
      metrics: result.metrics
    };
  } catch (error) {
    const batchError = error instanceof AnalysisBatchError ? error : null;
    const completedBatches = batchError?.completedBatches ?? [];
    const successfullyAnalyzed = completedDocumentCountForStage(completedBatches, "insight_generation");
    return {
      status: "failed",
      corpusResult: "invalid",
      sourceMode: "frozen_replay",
      snapshotPath: options.input,
      fingerprint: snapshot.fingerprint.value,
      collected: snapshot.collectedCount,
      eligible: snapshot.eligibleCount,
      paginationDepth: snapshot.paginationDepth,
      successfullyAnalyzed,
      documentsRemaining: snapshot.eligibleCount - successfullyAnalyzed,
      failedStage: batchError?.failedStage ?? "before_batched_analysis",
      failedBatchIndex: batchError?.failedBatchIndex ?? null,
      completedBatchCount: batchError?.completedBatches.length ?? 0,
      totalAiRequests: batchError?.totalAiRequests ?? 0,
      diagnostics: batchError?.diagnostics ?? null,
      themeBatchMetrics: batchError?.themeBatchMetrics ?? [],
      batchDescriptors,
      restartBehavior: batchError?.restartBehavior ?? "full_run_required"
    };
  }
}

async function main(): Promise<void> {
  loadRootEnv();
  const result = await runFrozenCorpusCommand(parseFrozenCorpusOptions(process.argv.slice(2)));
  print(result);
  if (result.status === "failed") process.exitCode = 1;
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    print({
      status: "failed",
      stage: "snapshot_or_replay_configuration",
      message: error instanceof Error ? error.message : "Frozen corpus command failed."
    });
    process.exitCode = 1;
  });
}
