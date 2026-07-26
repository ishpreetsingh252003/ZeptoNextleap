import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { serverEnvSchema } from "@zepto/shared-config";
import { describe, expect, it, vi } from "vitest";
import type { AiProvider } from "./ai/types.js";
import type { ScaledAnalysisResult } from "./analysis-scale.js";
import { createFrozenCorpusSnapshot, writeFrozenCorpusSnapshot } from "./corpus-snapshot.js";
import { parseFrozenCorpusOptions, runFrozenCorpusCommand } from "./frozen-corpus-live.js";

describe("frozen corpus replay", () => {
  it("accepts the pnpm argument separator", () => {
    expect(parseFrozenCorpusOptions(["--", "replay", "--input", "snapshot.json"]))
      .toMatchObject({ mode: "replay", maxAiRequests: 64 });
  });

  it("replays a verified snapshot without resolving a live adapter", async () => {
    const directory = await mkdtemp(join(tmpdir(), "zepto-replay-"));
    const path = join(directory, "snapshot.json");
    await writeFrozenCorpusSnapshot(path, createFrozenCorpusSnapshot({
      requestedCount: 1,
      collectedCount: 1,
      paginationDepth: 1,
      invalid: 0,
      normalizedEmpty: 0,
      exactDuplicates: 0,
      eligibleDocuments: [{
        externalId: "com.example:r1",
        url: "https://play.google.com/store/apps/details?id=com.example",
        canonicalUrl: "https://play.google.com/store/apps/details?id=com.example",
        sourceType: "google_play",
        platform: "Google Play",
        title: null,
        publicationDate: null,
        capturedAt: "2026-01-01T00:00:00.000Z",
        normalizedText: "A public review.",
        accessMethod: "public_page",
        policyNote: "Public review.",
        sourceMetadata: { rating: 4, locale: "en-IN", packageId: "com.example" }
      }],
      collectionTimestamp: "2026-01-01T00:00:00.000Z"
    }));
    const getAdapterFn = vi.fn(() => {
      throw new Error("Live collection must not be reached.");
    });
    const runPipelineFn = vi.fn(async (documents): Promise<ScaledAnalysisResult> => ({
      evidence: [],
      themes: [],
      insights: [],
      metrics: {
        documentCount: documents.length,
        totalCharacters: 16,
        minimumDocumentLength: 16,
        maximumDocumentLength: 16,
        averageDocumentLength: 16,
        medianDocumentLength: 16,
        estimatedPromptTokens: 4,
        normalizedEmptyCount: 0,
        exactDuplicateCount: 0,
        eligibleDocumentCount: documents.length,
        successfullyAnalyzedDocumentCount: documents.length,
        evidenceBatchCount: 1,
        estimatedMaximumEvidenceBatchPromptTokens: 300,
        totalAiRequests: 0,
        failedBatchCount: 0,
        completedBatches: [],
        themeBatchMetrics: [],
        elapsedMillisecondsByStage: {
          evidence_extraction: 0,
          theme_clustering: 0,
          theme_consolidation: 0,
          insight_generation: 0,
          insight_aggregation: 0
        }
      }
    }));
    const env = serverEnvSchema.parse({
      DATABASE_URL: "postgresql://example.invalid/test",
      AI_PROVIDER: "gemini"
    });

    const result = await runFrozenCorpusCommand({
      mode: "replay",
      input: path,
      maxAiRequests: 64
    }, {
      env,
      getAdapterFn,
      createAiProviderFn: vi.fn((): AiProvider => ({
        provider: "gemini",
        model: "test-model",
        generateStructured: vi.fn()
      })),
      runPipelineFn
    });

    expect(result).toMatchObject({
      status: "completed",
      sourceMode: "frozen_replay",
      eligible: 1
    });
    expect(getAdapterFn).not.toHaveBeenCalled();
    expect(runPipelineFn).toHaveBeenCalledOnce();
  });
});
