import {
  getServerEnv,
  loadRootEnv
} from "@zepto/shared-config";
import type { CreateCollectionRunInput } from "@zepto/research-contracts";
import { createAiProvider } from "./ai/factory.js";
import { getAdapter } from "./adapters/index.js";
import {
  AnalysisBatchError,
  analysisScaleConfigFromEnv,
  completedDocumentCountForStage,
  createBoundedBatches,
  estimateAnalysisRequestCount,
  prepareCorpusForAnalysis,
  runScaledAnalysisPipeline,
  type AnalysisScaleConfig
} from "./analysis-scale.js";

type CliOptions = {
  source: "google_play";
  packageId: string;
  reviewCount: number;
  dateFrom?: string;
  dateTo?: string;
  dryRun: boolean;
  maxAiRequests?: number;
};

function valueAfter(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function positiveInteger(value: string | undefined, name: string, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function parseOptions(args: readonly string[]): CliOptions {
  const source = valueAfter(args, "--source") ?? "google_play";
  if (source !== "google_play") {
    throw new Error("The live scale command currently supports only --source google_play.");
  }
  const dryRun = args.includes("--dry-run");
  const maxAiRequestsValue = valueAfter(args, "--max-ai-requests");
  const dateFrom = valueAfter(args, "--date-from");
  const dateTo = valueAfter(args, "--date-to");
  if (!dryRun && maxAiRequestsValue === undefined) {
    throw new Error("A non-dry live run requires --max-ai-requests.");
  }

  return {
    source,
    packageId: valueAfter(args, "--package") ?? "com.zeptoconsumerapp",
    reviewCount: positiveInteger(valueAfter(args, "--review-count"), "--review-count", 100),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    dryRun,
    ...(maxAiRequestsValue
      ? { maxAiRequests: positiveInteger(maxAiRequestsValue, "--max-ai-requests") }
      : {})
  };
}

function withCliOverrides(
  base: AnalysisScaleConfig,
  args: readonly string[]
): AnalysisScaleConfig {
  return {
    evidence: {
      maxItems: positiveInteger(
        valueAfter(args, "--evidence-max-records"),
        "--evidence-max-records",
        base.evidence.maxItems
      ),
      maxEstimatedPromptTokens: positiveInteger(
        valueAfter(args, "--evidence-max-prompt-tokens"),
        "--evidence-max-prompt-tokens",
        base.evidence.maxEstimatedPromptTokens
      )
    },
    themes: {
      maxItems: positiveInteger(
        valueAfter(args, "--theme-max-records"),
        "--theme-max-records",
        base.themes.maxItems
      ),
      maxEstimatedPromptTokens: positiveInteger(
        valueAfter(args, "--theme-max-prompt-tokens"),
        "--theme-max-prompt-tokens",
        base.themes.maxEstimatedPromptTokens
      )
    },
    themeMerge: {
      maxItems: positiveInteger(
        valueAfter(args, "--theme-merge-max-records"),
        "--theme-merge-max-records",
        base.themeMerge.maxItems
      ),
      maxEstimatedPromptTokens: base.themeMerge.maxEstimatedPromptTokens
    },
    insights: {
      maxItems: positiveInteger(
        valueAfter(args, "--insight-max-records"),
        "--insight-max-records",
        base.insights.maxItems
      ),
      maxEstimatedPromptTokens: positiveInteger(
        valueAfter(args, "--insight-max-prompt-tokens"),
        "--insight-max-prompt-tokens",
        base.insights.maxEstimatedPromptTokens
      )
    }
  };
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

loadRootEnv();

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseOptions(args);
  const env = getServerEnv();
  const config = withCliOverrides(analysisScaleConfigFromEnv(env), args);
  const adapter = getAdapter(options.source, env);
  const input: CreateCollectionRunInput = {
    projectId: "00000000-0000-4000-8000-000000000001",
    sourceType: "google_play",
    urlOrQuery: options.packageId,
    policyConfirmed: true,
    maxRecords: options.reviewCount,
    ...(options.dateFrom ? { dateFrom: options.dateFrom } : {}),
    ...(options.dateTo ? { dateTo: options.dateTo } : {})
  };
  let paginationDepth = 0;
  const collected = await adapter.collect(input, {
    maxRecords: options.reviewCount,
    ...(options.dateFrom ? { dateFrom: options.dateFrom } : {}),
    ...(options.dateTo ? { dateTo: options.dateTo } : {}),
    onPageCollected: ({ pageNumber }) => {
      paginationDepth = Math.max(paginationDepth, pageNumber);
    }
  });
  const {
    measurement,
    eligibleDocuments,
    duplicateCount
  } = prepareCorpusForAnalysis(collected);
  const evidenceBatches = createBoundedBatches(
    eligibleDocuments,
    config.evidence,
    (document) => JSON.stringify({
      documentId: document.externalId,
      sourceType: document.sourceType,
      text: document.normalizedText
    })
  );
  const invalid = 0;
  const eligible = eligibleDocuments.length;
  const requestEstimate = estimateAnalysisRequestCount(
    eligibleDocuments.length,
    evidenceBatches.length,
    config
  );

  if (options.dryRun) {
    print({
      status: "dry_run_complete",
      sourceAvailability: "Unknown: Google Play does not expose a reliable total written-review count.",
      requested: options.reviewCount,
      collected: collected.length,
      paginationDepth,
      invalid,
      normalizedEmpty: measurement.normalizedEmptyCount,
      exactDuplicates: duplicateCount,
      eligible,
      evidenceBatchCount: evidenceBatches.length,
      estimatedThemeBatchCount: Math.ceil(eligible / config.themes.maxItems),
      estimatedInsightBatchCount: Math.ceil(eligible / config.insights.maxItems),
      planningGeminiRequestEstimate: requestEstimate,
      estimateAssumptions: [
        "one Evidence record per eligible document",
        "one provisional Theme per evidence-clustering batch",
        "one final Theme for insight-window estimation",
        "actual structured-output retries may increase requests"
      ],
      batchLimits: config,
      corpus: measurement,
      aiExecuted: false
    });
    return;
  }

  try {
    const result = await runScaledAnalysisPipeline(
      collected,
      createAiProvider(env),
      {
        ...config,
        ...(options.maxAiRequests !== undefined
          ? { maxAiRequests: options.maxAiRequests }
          : {})
      }
    );
    print({
      status: "completed",
      corpusResult: "valid",
      requested: options.reviewCount,
      collected: collected.length,
      paginationDepth,
      invalid,
      normalizedEmpty: result.metrics.normalizedEmptyCount,
      exactDuplicates: result.metrics.exactDuplicateCount,
      eligible: result.metrics.eligibleDocumentCount,
      failedAnalysisDocuments: 0,
      successfullyAnalyzed: result.metrics.successfullyAnalyzedDocumentCount,
      evidenceCount: result.evidence.length,
      themeCount: result.themes.length,
      insightCount: result.insights.length,
      retryCount: Math.max(
        0,
        result.metrics.totalAiRequests - result.metrics.completedBatches.length
      ),
      metrics: result.metrics
    });
  } catch (error) {
    const batchError = error instanceof AnalysisBatchError ? error : null;
    const completedBatches = batchError?.completedBatches ?? [];
    const documentsProcessedThroughFailedStage = batchError
      ? completedDocumentCountForStage(completedBatches, batchError.failedStage)
      : 0;
    const successfullyAnalyzed = completedDocumentCountForStage(
      completedBatches,
      "insight_generation"
    );
    print({
      status: "failed",
      corpusResult: "invalid",
      requested: options.reviewCount,
      collected: collected.length,
      paginationDepth,
      invalid,
      normalizedEmpty: measurement.normalizedEmptyCount,
      exactDuplicates: measurement.exactDuplicateCount,
      eligible,
      documentsProcessedThroughFailedStage,
      successfullyAnalyzed,
      documentsRemaining: eligible - successfullyAnalyzed,
      failedAnalysisDocuments: eligible - successfullyAnalyzed,
      failedStage: batchError?.failedStage ?? "before_batched_analysis",
      failedBatchIndex: batchError?.failedBatchIndex ?? null,
      failedBatchDocumentCount: batchError?.documentIds.length ?? 0,
      completedBatchCount: batchError?.completedBatches.length ?? 0,
      totalAiRequests: batchError?.totalAiRequests ?? 0,
      diagnostics: batchError?.diagnostics ?? null,
      restartBehavior: batchError?.restartBehavior ?? "full_run_required"
    });
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  print({
    status: "failed",
    stage: "collection_or_configuration",
    message: error instanceof Error ? error.message : "Live scale command failed."
  });
  process.exitCode = 1;
});
