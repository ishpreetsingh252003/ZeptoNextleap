import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getServerEnv, loadRootEnv } from "@zepto/shared-config";
import { createAiProvider } from "./ai/factory.js";
import { AiProviderError } from "./ai/errors.js";
import {
  documentsFromFrozenCorpus,
  loadFrozenCorpusSnapshot
} from "./corpus-snapshot.js";
import {
  DEFAULT_MVP_EVIDENCE_TEXT_LIMIT,
  defaultMvpAnalysisConfig,
  runMvpAnalysis
} from "./mvp-analysis.js";

type CliOptions = {
  input: string;
  reviewCount: number;
  maxEvidenceTextCharacters: number;
};

function valueAfter(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function positiveInteger(value: string | undefined, name: string, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

export function parseMvpLiveOptions(args: readonly string[]): CliOptions {
  const normalizedArgs = args[0] === "--" ? args.slice(1) : args;
  const input = valueAfter(normalizedArgs, "--input");
  if (!input) throw new Error("--input is required; MVP validation never collects live data.");
  return {
    input: resolve(input),
    reviewCount: positiveInteger(
      valueAfter(normalizedArgs, "--review-count"),
      "--review-count",
      250
    ),
    maxEvidenceTextCharacters: positiveInteger(
      valueAfter(normalizedArgs, "--max-evidence-characters"),
      "--max-evidence-characters",
      DEFAULT_MVP_EVIDENCE_TEXT_LIMIT
    )
  };
}

function selectionKey(documentId: string): string {
  return createHash("sha256").update(documentId, "utf8").digest("hex");
}

export function selectDeterministicMvpDocuments<T extends { externalId: string }>(
  documents: readonly T[],
  count: number
): T[] {
  if (documents.length < count) {
    throw new Error(`Frozen corpus contains ${documents.length} eligible reviews; ${count} were requested.`);
  }
  return [...documents]
    .sort((first, second) =>
      selectionKey(first.externalId).localeCompare(selectionKey(second.externalId))
      || first.externalId.localeCompare(second.externalId)
    )
    .slice(0, count);
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main(): Promise<void> {
  loadRootEnv();
  const options = parseMvpLiveOptions(process.argv.slice(2));
  const snapshot = await loadFrozenCorpusSnapshot(options.input);
  const allDocuments = documentsFromFrozenCorpus(snapshot);
  const selectedDocuments = selectDeterministicMvpDocuments(
    allDocuments,
    options.reviewCount
  );
  const artifact = await runMvpAnalysis(
    selectedDocuments,
    {
      sourceMode: "frozen_replay",
      corpusFingerprint: snapshot.fingerprint.value,
      collectedReviewCount: snapshot.collectedCount,
      eligibleCount: snapshot.eligibleCount,
      selectedReviewCount: selectedDocuments.length,
      duplicatesRemoved: snapshot.reconciliation.exactDuplicates
    },
    createAiProvider(getServerEnv()),
    {
      ...defaultMvpAnalysisConfig,
      maxEvidenceTextCharacters: options.maxEvidenceTextCharacters
    }
  );

  print({
    status: "completed",
    corpusStatus: artifact.corpusStatus,
    sourceMode: artifact.sourceMode,
    corpusFingerprint: artifact.corpusFingerprint,
    collectedReviewCount: artifact.collectedReviewCount,
    eligibleCount: artifact.eligibleCount,
    selectedReviewCount: artifact.selectedReviewCount,
    duplicatesRemoved: artifact.duplicatesRemoved,
    evidenceCount: artifact.evidenceCount,
    categorizedCount: artifact.categorizedCount,
    uncategorizedCount: artifact.uncategorizedCount,
    themeCount: artifact.themeCount,
    insightCount: artifact.insightCount,
    providerRequestCount: artifact.providerRequestCount,
    taxonomyThemeCount: artifact.themes.filter(
      ({ id }) => id !== "mvp_theme_uncategorized"
    ).length,
    taxonomyProviderAttempts: artifact.taxonomyProviderRequestCount,
    classificationBatchCount: artifact.classificationBatchCount,
    classificationProviderAttempts: artifact.classificationProviderRequestCount,
    duplicateConflictFallbackCount: artifact.duplicateConflictFallbackCount,
    missingAssignmentFallbackCount: artifact.missingAssignmentFallbackCount,
    providerFailureFallbackCount: artifact.providerFailureFallbackCount,
    businessSynthesisProviderAttempts: artifact.businessSynthesisProviderRequestCount,
    reconciliation: {
      selected: artifact.selectedReviewCount,
      categorized: artifact.categorizedCount,
      uncategorized: artifact.uncategorizedCount,
      reconciled:
        artifact.selectedReviewCount
        === artifact.categorizedCount + artifact.uncategorizedCount
    },
    sentimentDistribution: artifact.sentimentDistribution,
    runtimeMilliseconds: artifact.runtimeMilliseconds,
    themes: artifact.themes.map(({ id, title, evidenceCount, representativeEvidenceIds }) => ({
      id,
      title,
      evidenceCount,
      representativeEvidenceIds
    })),
    businessOutputSample: {
      overallSummary: artifact.businessAnalysis.overallSummary,
      topUserPainPoints: artifact.businessAnalysis.topUserPainPoints.slice(0, 3),
      productOpportunities: artifact.businessAnalysis.productOpportunities.slice(0, 3),
      analysisLimitations: artifact.businessAnalysis.analysisLimitations
    },
    representativeReviewCount: artifact.representativeReviews.length,
    representativeReviewTextEmitted: false,
    limitations: artifact.limitations
  });
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    const providerError = error instanceof AiProviderError ? error : null;
    print({
      status: "failed",
      corpusStatus: "invalid",
      failureCategory: providerError
        ? [...new Set(providerError.attemptDiagnostics.flatMap(({ categories }) => categories))]
        : ["OTHER"],
      providerAttempts: providerError?.attemptCount ?? 0,
      message: error instanceof Error ? error.message : "MVP analysis failed."
    });
    process.exitCode = 1;
  });
}
