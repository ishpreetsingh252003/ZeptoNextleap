import { describe, expect, it } from "vitest";
import {
  summarizeStability,
  toStabilityRunRecord
} from "./pipeline-stability-live.js";

describe("pipeline stability harness", () => {
  it("records a sanitized failed Theme run", () => {
    const record = toStabilityRunRecord(1, 1_250, {
      status: "failed",
      corpusResult: "invalid",
      collected: 1_000,
      failedStage: "theme_clustering",
      completedBatchCount: 18,
      totalAiRequests: 22,
      diagnostics: {
        validationCategories: ["UNKNOWN_EVIDENCE_ID"],
        providerAttempts: [],
        privateEvidenceText: "MUST_NOT_BE_RETAINED"
      }
    });

    expect(record).toEqual({
      run: 1,
      corpusFingerprint: "",
      eligibleDocumentCount: 0,
      collection: "success",
      evidence: "success",
      theme: "failed",
      insight: "not_reached",
      corpusValid: false,
      runtimeMilliseconds: 1_250,
      providerAttempts: 22,
      retryCount: 3,
      firstFailureStage: "theme_clustering",
      failureCategory: "UNKNOWN_EVIDENCE_ID",
      failedBatchIndex: null,
      evidenceCount: null,
      themeCount: null,
      insightCount: null,
      failedBatchFingerprint: null,
      themeObservedBatches: 0,
      themeRepairRequests: 0,
      themeInitialIncompleteBatches: 0,
      themeRepairSuccesses: 0,
      themeRepairs: [],
      quoteMismatches: []
    });
    expect(JSON.stringify(record)).not.toContain("MUST_NOT_BE_RETAINED");
  });

  it("records successful corpus counts", () => {
    expect(toStabilityRunRecord(2, 2_000, {
      status: "completed",
      corpusResult: "valid",
      collected: 1_000,
      evidenceCount: 700,
      themeCount: 12,
      insightCount: 18,
      retryCount: 2,
      metrics: { totalAiRequests: 35 }
    })).toMatchObject({
      corpusValid: true,
      evidence: "success",
      theme: "success",
      insight: "success",
      evidenceCount: 700,
      themeCount: 12,
      insightCount: 18,
      providerAttempts: 35,
      retryCount: 2,
      quoteMismatches: []
    });
  });

  it("aggregates success, stage failures, categories, and runtime", () => {
    const records = [
      toStabilityRunRecord(1, 1_000, {
        status: "failed",
        collected: 1_000,
        failedStage: "evidence_extraction",
        diagnostics: { validationCategories: ["QUOTE_NOT_EXACT"] }
      }),
      toStabilityRunRecord(2, 2_000, {
        status: "failed",
        collected: 1_000,
        failedStage: "theme_clustering",
        diagnostics: { validationCategories: ["QUOTE_NOT_EXACT"] }
      }),
      toStabilityRunRecord(3, 3_000, {
        status: "completed",
        corpusResult: "valid",
        collected: 1_000
      })
    ];

    expect(summarizeStability(records)).toEqual({
      totalRuns: 3,
      successfulRuns: 1,
      successRate: 1 / 3,
      evidenceFailureFrequency: 1,
      themeFailureFrequency: 1,
      insightFailureFrequency: 0,
      mostCommonFailureCategory: "QUOTE_NOT_EXACT",
      averageRuntimeMilliseconds: 2_000,
      mismatchAttemptCount: 0,
      mismatchCategoryFrequency: {},
      normalizationAloneMatchCount: 0,
      averageQuoteLength: 0,
      averageSourceLength: 0,
      averageEditDistance: 0,
      fingerprintConsistent: false,
      failedBatchRecurrence: {},
      themeInitialCompletenessRate: 0,
      themeRepairSuccessRate: 0,
      averageAdditionalRepairRequests: 0,
      themeRepairBatchRecurrence: {}
    });
  });

  it("tracks identical fingerprints and recurrent failed Evidence batches", () => {
    const value = {
      status: "failed",
      collected: 1_000,
      fingerprint: "a".repeat(64),
      failedStage: "evidence_extraction",
      failedBatchIndex: 2,
      batchDescriptors: [{ batchIndex: 2, fingerprint: "b".repeat(64) }],
      diagnostics: { validationCategories: ["QUOTE_NOT_EXACT"] }
    };
    const records = [
      toStabilityRunRecord(1, 1_000, value),
      toStabilityRunRecord(2, 1_000, value)
    ];
    expect(summarizeStability(records)).toMatchObject({
      fingerprintConsistent: true,
      failedBatchRecurrence: { ["b".repeat(64)]: 2 }
    });
  });

  it("does not correlate Theme batch indexes with Evidence input batches", () => {
    expect(toStabilityRunRecord(1, 1_000, {
      status: "failed",
      collected: 1_000,
      fingerprint: "a".repeat(64),
      failedStage: "theme_clustering",
      failedBatchIndex: 2,
      batchDescriptors: [{ batchIndex: 2, fingerprint: "b".repeat(64) }],
      diagnostics: { validationCategories: ["MISSING_EVIDENCE_ASSIGNMENT"] }
    }).failedBatchFingerprint).toBeNull();
  });

  it("retains only sanitized Theme repair identity and aggregates recurrence", () => {
    const value = {
      status: "failed",
      collected: 1_000,
      eligible: 757,
      fingerprint: "a".repeat(64),
      failedStage: "insight_generation",
      themeBatchMetrics: [{
        batchIndex: 5,
        batchFingerprint: "c".repeat(64),
        initialMissingCount: 2,
        repairRequestCount: 1,
        repairedAssignmentCount: 2,
        remainingMissingCount: 0,
        finalValidationCategory: "valid",
        privateThemeText: "MUST_NOT_BE_RETAINED"
      }]
    };
    const records = [
      toStabilityRunRecord(1, 1_000, value),
      toStabilityRunRecord(2, 1_000, value)
    ];

    expect(records[0]?.themeRepairs).toEqual([{
      batchIndex: 5,
      batchFingerprint: "c".repeat(64),
      initialMissingCount: 2,
      repairedAssignmentCount: 2,
      remainingMissingCount: 0
    }]);
    expect(JSON.stringify(records)).not.toContain("MUST_NOT_BE_RETAINED");
    expect(summarizeStability(records).themeRepairBatchRecurrence)
      .toEqual({ ["c".repeat(64)]: 2 });
  });

  it("aggregates sanitized quote mismatch metrics", () => {
    const record = toStabilityRunRecord(1, 1_000, {
      status: "failed",
      collected: 1_000,
      failedStage: "evidence_extraction",
      diagnostics: {
        validationCategories: ["QUOTE_NOT_EXACT"],
        providerAttempts: [{
          quoteMismatch: {
            categories: ["PUNCTUATION_DIFFERENCE", "CASE_DIFFERENCE"],
            quoteLength: 10,
            sourceLength: 20,
            editDistance: 2,
            normalizationAloneMatched: true,
            rawQuote: "MUST_NOT_BE_RETAINED"
          }
        }]
      }
    });

    expect(record.quoteMismatches).toEqual([{
      categories: ["PUNCTUATION_DIFFERENCE", "CASE_DIFFERENCE"],
      quoteLength: 10,
      sourceLength: 20,
      editDistance: 2,
      normalizationAloneMatched: true
    }]);
    expect(JSON.stringify(record)).not.toContain("MUST_NOT_BE_RETAINED");
    expect(summarizeStability([record])).toMatchObject({
      mismatchAttemptCount: 1,
      mismatchCategoryFrequency: {
        PUNCTUATION_DIFFERENCE: 1,
        CASE_DIFFERENCE: 1
      },
      normalizationAloneMatchCount: 1,
      averageQuoteLength: 10,
      averageSourceLength: 20,
      averageEditDistance: 2
    });
  });
});
