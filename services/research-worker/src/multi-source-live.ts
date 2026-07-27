import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getServerEnv, loadRootEnv } from "@zepto/shared-config";
import { createAiProvider } from "./ai/factory.js";
import { parseCsvDocuments } from "./adapters/csv-import.js";
import {
  documentsFromFrozenCorpus,
  loadFrozenCorpusSnapshot
} from "./corpus-snapshot.js";
import {
  defaultMvpAnalysisConfig,
  runMvpAnalysis
} from "./mvp-analysis.js";
import { analyzeMultiSourceQuality } from "./multi-source-quality.js";
import {
  createMultiSourceSnapshot,
  writeMultiSourceSnapshot
} from "./multi-source-snapshot.js";

type Options = {
  googleSnapshot: string;
  pilotCsv: string;
  output: string;
};

function valueAfter(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

export function parseMultiSourceOptions(args: readonly string[]): Options {
  const normalized = args[0] === "--" ? args.slice(1) : args;
  const googleSnapshot = valueAfter(normalized, "--google-snapshot");
  const pilotCsv = valueAfter(normalized, "--pilot-csv");
  const output = valueAfter(normalized, "--output");
  if (!googleSnapshot || !pilotCsv || !output) {
    throw new Error("--google-snapshot, --pilot-csv, and --output are required.");
  }
  return {
    googleSnapshot: resolve(googleSnapshot),
    pilotCsv: resolve(pilotCsv),
    output: resolve(output)
  };
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main(): Promise<void> {
  loadRootEnv();
  const env = getServerEnv();
  const options = parseMultiSourceOptions(process.argv.slice(2));
  const [googleSnapshot, pilotCsv] = await Promise.all([
    loadFrozenCorpusSnapshot(options.googleSnapshot),
    readFile(options.pilotCsv, "utf8")
  ]);
  const googleDocuments = documentsFromFrozenCorpus(googleSnapshot);
  const pilotResult = parseCsvDocuments(pilotCsv, {
    maxRecords: 100,
    capturedAt: googleSnapshot.collectionTimestamp
  });
  if (pilotResult.diagnostics.length > 0) {
    throw new Error(
      `Approved pilot CSV produced ${pilotResult.diagnostics.length} row validation errors.`
    );
  }

  const quality = analyzeMultiSourceQuality(
    [...googleDocuments, ...pilotResult.documents],
    {
      sourceCaps: {
        "Google Play": 200,
        "Apple App Store": 100,
        Reddit: 50,
        Trustpilot: 25
      },
      defaultCap: 25
    }
  );
  const capRemoved = Object.values(quality.capRemovedBySource)
    .reduce((total, count) => total + count, 0);
  const snapshot = createMultiSourceSnapshot({
    documents: quality.selectedDocuments,
    inputCount: quality.inputCount,
    exactDuplicatesRemoved: quality.exactDuplicatesRemoved,
    capRemoved
  });
  await writeMultiSourceSnapshot(options.output, snapshot);

  const artifact = await runMvpAnalysis(
    snapshot.records,
    {
      sourceMode: "multi_source_snapshot",
      corpusFingerprint: snapshot.fingerprint.value,
      collectedReviewCount: quality.inputCount,
      eligibleCount:
        quality.inputCount - quality.exactDuplicatesRemoved,
      selectedReviewCount: snapshot.records.length,
      duplicatesRemoved: quality.exactDuplicatesRemoved
    },
    createAiProvider(env),
    {
      ...defaultMvpAnalysisConfig,
      sourceConcentrationWarningThreshold:
        env.MVP_SOURCE_CONCENTRATION_WARNING_THRESHOLD
    }
  );

  print({
    status: artifact.corpusStatus,
    snapshotPath: options.output,
    snapshotFingerprint: snapshot.fingerprint.value,
    sourceComposition: snapshot.sourceComposition,
    sourceQuality: quality.sourceDistribution,
    duplicateReport: {
      exactDuplicatesRemoved: quality.exactDuplicatesRemoved,
      exactDuplicatesBySource: quality.exactDuplicatesBySource,
      crossSourceExactDuplicates: quality.crossSourceExactDuplicates,
      nearDuplicateCandidateCount: quality.nearDuplicateCandidates.length,
      nearDuplicatesRemoved: 0,
      capRemovedBySource: quality.capRemovedBySource
    },
    providerRequestCount: artifact.providerRequestCount,
    runtimeMilliseconds: artifact.runtimeMilliseconds,
    reconciliation: {
      selected: artifact.selectedReviewCount,
      categorized: artifact.categorizedCount,
      uncategorized: artifact.uncategorizedCount
    },
    themes: artifact.themes.map((theme) => ({
      id: theme.id,
      title: theme.title,
      evidenceCount: theme.evidenceCount,
      sourceCounts: theme.sourceCounts,
      sourceConcentrationWarning: theme.sourceConcentrationWarning,
      representativeSources: [...new Set(
        artifact.representativeReviews
          .filter(({ themeId }) => themeId === theme.id)
          .map(({ sourceName }) => sourceName)
      )]
    })),
    businessOutputSample: {
      overallSummary: artifact.businessAnalysis.overallSummary,
      topUserPainPoints: artifact.businessAnalysis.topUserPainPoints.slice(0, 3),
      productOpportunities: artifact.businessAnalysis.productOpportunities.slice(0, 3)
    },
    representativeReviewTextEmitted: false,
    limitations: artifact.limitations
  });
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    print({
      status: "failed",
      message: error instanceof Error ? error.message : "Multi-source validation failed."
    });
    process.exitCode = 1;
  });
}
