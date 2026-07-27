import { describe, expect, it } from "vitest";
import type { PublicDocument } from "@zepto/research-contracts";
import { AiProviderError } from "./ai/errors.js";
import type { AiProvider, AiStageRequest, AiStageResult } from "./ai/types.js";
import {
  createLocalMvpEvidence,
  createMvpThemes,
  generateMvpTaxonomy,
  mvpEvidenceIdFor,
  runMvpAnalysis,
  validateMvpClassificationOutput
} from "./mvp-analysis.js";
import { selectDeterministicMvpDocuments } from "./mvp-analysis-live.js";

const narrative = {
  overallSummary: "Users report a mix of delivery and usability experiences.",
  topUserPainPoints: ["Late delivery"],
  positivePatterns: ["Convenient ordering"],
  requestedImprovements: ["Clearer status updates"],
  operationalIssues: ["Order handling inconsistency"],
  deliveryIssues: ["Late delivery"],
  paymentIssues: [],
  applicationUxIssues: ["Unclear order status"],
  retentionRisks: ["Repeated delivery failures"],
  productOpportunities: ["Improve proactive order communication"],
  analysisLimitations: ["Directional public-review evidence only"]
};

function taxonomy(keyPrefix = "temporary") {
  return {
    themes: Array.from({ length: 5 }, (_, index) => ({
      key: `${keyPrefix}-${index + 1}`,
      title: [
        "Delivery reliability",
        "Application experience",
        "Payments and refunds",
        "Product availability",
        "Positive convenience"
      ][index]!,
      description: `Taxonomy description ${index + 1}.`,
      inclusionCriteria: `Include matching reports for Theme ${index + 1}.`,
      exclusionCriteria: `Exclude unrelated reports from Theme ${index + 1}.`,
      dominantIssueCategory: index === 4 ? null : `category-${index + 1}`
    }))
  };
}

type ClassificationFactory = (
  request: AiStageRequest<unknown>,
  callIndex: number
) => unknown | Error;

class SyntheticMvpProvider implements AiProvider {
  readonly provider = "gemini" as const;
  readonly model = "offline-mvp";
  readonly requests: AiStageRequest<unknown>[] = [];
  private classificationCalls = 0;

  constructor(
    private readonly taxonomyPayload: unknown = taxonomy(),
    private readonly classificationFactory?: ClassificationFactory
  ) {}

  async generateStructured<T>(request: AiStageRequest<T>): Promise<AiStageResult<T>> {
    this.requests.push(request as AiStageRequest<unknown>);
    let payload: unknown;
    if (request.schemaName === "mvp_theme_taxonomy") {
      payload = this.taxonomyPayload;
    } else if (request.schemaName === "mvp_evidence_classification") {
      const callIndex = this.classificationCalls++;
      payload = this.classificationFactory
        ? this.classificationFactory(request as AiStageRequest<unknown>, callIndex)
        : defaultAssignments(request as AiStageRequest<unknown>);
    } else {
      payload = narrative;
    }
    if (payload instanceof Error) throw payload;
    return {
      data: request.validate(payload),
      provider: this.provider,
      model: this.model,
      attemptCount: 1
    };
  }
}

function promptPayload(request: AiStageRequest<unknown>): {
  taxonomy: Array<{ themeId: string }>;
  evidence: Array<{ evidenceId: string }>;
} {
  return JSON.parse(request.userPrompt.split("\n\n")[0]!) as {
    taxonomy: Array<{ themeId: string }>;
    evidence: Array<{ evidenceId: string }>;
  };
}

function defaultAssignments(request: AiStageRequest<unknown>) {
  const payload = promptPayload(request);
  return {
    assignments: payload.evidence.map(({ evidenceId }, index) => ({
      evidenceId,
      themeId: payload.taxonomy[index % payload.taxonomy.length]!.themeId
    }))
  };
}

function document(
  index: number,
  text = `Canonical review ${index}.`,
  rating: number | undefined = index % 5 + 1,
  reviewDate = `2026-01-${String(index % 28 + 1).padStart(2, "0")}T00:00:00.000Z`
): PublicDocument {
  return {
    externalId: `review-${index}`,
    url: `https://example.com/review-${index}`,
    canonicalUrl: `https://example.com/review-${index}`,
    sourceType: "google_play",
    platform: "Google Play",
    title: null,
    publicationDate: reviewDate,
    capturedAt: "2026-02-01T00:00:00.000Z",
    normalizedText: text,
    accessMethod: "public_page",
    policyNote: "Synthetic public review fixture.",
    sourceMetadata: {
      ...(rating === undefined ? {} : { rating }),
      locale: "en-IN",
      packageId: "com.example"
    }
  };
}

function corpus(selectedReviewCount: number) {
  return {
    sourceMode: "frozen_replay" as const,
    corpusFingerprint: "a".repeat(64),
    collectedReviewCount: 1_000,
    eligibleCount: 757,
    selectedReviewCount,
    duplicatesRemoved: 243
  };
}

describe("simplified MVP analysis", () => {
  it("creates one deterministic local Evidence record per document with zero provider calls", () => {
    const provider = new SyntheticMvpProvider();
    const input = [document(1), document(2)];
    const first = createLocalMvpEvidence(input);
    const second = createLocalMvpEvidence(input);

    expect(first).toEqual(second);
    expect(first).toHaveLength(input.length);
    expect(new Set(first.map(({ id }) => id)).size).toBe(input.length);
    expect(first.map(({ canonicalText }) => canonicalText))
      .toEqual(input.map(({ normalizedText }) => normalizedText));
    expect(first[0]?.id).toBe(mvpEvidenceIdFor(input[0]!));
    expect(provider.requests).toHaveLength(0);
  });

  it("selects a deterministic local excerpt without rewriting source words", () => {
    const source = "alpha beta gamma delta";
    const [evidence] = createLocalMvpEvidence(
      [document(1, source)],
      { maxEvidenceTextCharacters: 12 }
    );
    expect(evidence?.canonicalText).toBe("alpha beta");
    expect(source.startsWith(evidence!.canonicalText)).toBe(true);
  });

  it("generates a taxonomy without Evidence assignments or model-owned final IDs", async () => {
    const evidence = createLocalMvpEvidence([document(1)]);
    const firstProvider = new SyntheticMvpProvider(taxonomy("first"));
    const secondProvider = new SyntheticMvpProvider(taxonomy("second"));
    const first = await generateMvpTaxonomy(evidence, firstProvider);
    const second = await generateMvpTaxonomy(evidence, secondProvider);

    expect(first.themes.map(({ id }) => id)).toEqual(second.themes.map(({ id }) => id));
    expect(first.themes.every(({ id }) => /^mvp_theme_[a-f0-9]{64}$/.test(id))).toBe(true);
    expect(firstProvider.requests[0]?.userPrompt).not.toContain(evidence[0]!.id);
    expect(firstProvider.requests[0]?.systemPrompt).toContain("Do not assign Evidence");
    expect(JSON.stringify(taxonomy())).not.toContain("evidenceIds");
  });

  it("uses disjoint bounded classification batches", async () => {
    const evidence = createLocalMvpEvidence(
      Array.from({ length: 85 }, (_, index) => document(index))
    );
    const provider = new SyntheticMvpProvider();
    const result = await createMvpThemes(evidence, provider);
    const classificationRequests = provider.requests.filter(
      ({ schemaName }) => schemaName === "mvp_evidence_classification"
    );
    const batches = classificationRequests.map((request) =>
      promptPayload(request).evidence.map(({ evidenceId }) => evidenceId)
    );

    expect(result.classificationBatchCount).toBe(3);
    expect(batches.map((batch) => batch.length)).toEqual([40, 40, 5]);
    expect(new Set(batches.flat()).size).toBe(evidence.length);
  });

  it("rejects unknown Evidence and Theme references", () => {
    const evidenceIds = new Set(["evidence-1"]);
    const themeIds = new Set(["theme-1"]);
    expect(() => validateMvpClassificationOutput({
      assignments: [{ evidenceId: "invented", themeId: "theme-1" }]
    }, evidenceIds, themeIds)).toThrowError(
      expect.objectContaining({ categories: ["UNKNOWN_EVIDENCE_ID"] })
    );
    expect(() => validateMvpClassificationOutput({
      assignments: [{ evidenceId: "evidence-1", themeId: "invented" }]
    }, evidenceIds, themeIds)).toThrowError(
      expect.objectContaining({ categories: ["UNKNOWN_THEME_REFERENCE"] })
    );
  });

  it("keeps unrelated assignments and sends persistent duplicate conflicts to Uncategorized", async () => {
    const evidence = createLocalMvpEvidence([document(1), document(2), document(3)]);
    const provider = new SyntheticMvpProvider(taxonomy(), (request) => {
      const payload = promptPayload(request);
      const [first, second, third] = payload.evidence;
      return {
        assignments: [
          { evidenceId: first!.evidenceId, themeId: payload.taxonomy[0]!.themeId },
          { evidenceId: first!.evidenceId, themeId: payload.taxonomy[1]!.themeId },
          { evidenceId: second!.evidenceId, themeId: payload.taxonomy[0]!.themeId },
          { evidenceId: third!.evidenceId, themeId: payload.taxonomy[2]!.themeId }
        ]
      };
    });
    const result = await createMvpThemes(evidence, provider);

    expect(result.classificationProviderRequestCount).toBe(2);
    expect(result.categorizedCount).toBe(2);
    expect(result.duplicateConflictFallbackCount).toBe(1);
    expect(result.missingAssignmentFallbackCount).toBe(0);
    expect(result.themes.at(-1)).toMatchObject({
      id: "mvp_theme_uncategorized",
      evidenceIds: [evidence[0]!.id]
    });
  });

  it("moves omitted Evidence to Uncategorized without discarding valid assignments", async () => {
    const evidence = createLocalMvpEvidence([document(1), document(2), document(3)]);
    const provider = new SyntheticMvpProvider(taxonomy(), (request) => {
      const output = defaultAssignments(request);
      return { assignments: output.assignments.slice(0, 2) };
    });
    const result = await createMvpThemes(evidence, provider);

    expect(result.categorizedCount).toBe(2);
    expect(result.uncategorizedCount).toBe(1);
    expect(result.missingAssignmentFallbackCount).toBe(1);
    expect(result.themes.flatMap(({ evidenceIds }) => evidenceIds).sort())
      .toEqual(evidence.map(({ id }) => id).sort());
  });

  it("degrades a failed classification batch while retaining a complete partition", async () => {
    const evidence = createLocalMvpEvidence([document(1), document(2)]);
    const provider = new SyntheticMvpProvider(taxonomy(), () =>
      new AiProviderError("gemini", 2, "theme_clustering")
    );
    const artifact = await runMvpAnalysis(evidence.map((item, index) =>
      document(index + 1, item.canonicalText, item.rating ?? undefined)
    ), corpus(2), provider);

    expect(artifact.corpusStatus).toBe("valid_with_uncategorized");
    expect(artifact.categorizedCount).toBe(0);
    expect(artifact.uncategorizedCount).toBe(2);
    expect(artifact.providerFailureFallbackCount).toBe(2);
    expect(artifact.classificationDiagnostics[0]?.status)
      .toBe("provider_failure_fallback");
    expect(artifact.categorizedCount + artifact.uncategorizedCount)
      .toBe(artifact.selectedReviewCount);
  });

  it("calculates Theme membership, counts, ratings, sentiment, and representatives locally", async () => {
    const input = [
      document(1, "short", 5, "2026-01-01T00:00:00.000Z"),
      document(2, "A much longer negative and informative review.", 1, "2026-01-02T00:00:00.000Z"),
      document(3, "medium negative review", 2, "2026-01-03T00:00:00.000Z")
    ];
    const evidence = createLocalMvpEvidence(input);
    const provider = new SyntheticMvpProvider(taxonomy(), (request) => {
      const payload = promptPayload(request);
      return {
        assignments: payload.evidence.map(({ evidenceId }) => ({
          evidenceId,
          themeId: payload.taxonomy[0]!.themeId
        }))
      };
    });
    const result = await createMvpThemes(evidence, provider);
    const theme = result.themes.find(({ evidenceCount }) => evidenceCount === 3)!;

    expect(theme.percentage).toBe(100);
    expect(theme.ratingDistribution).toEqual({
      one: 1, two: 1, three: 0, four: 0, five: 1, unknown: 0
    });
    expect(theme.dominantSentiment).toBe("negative");
    expect(theme.representativeEvidenceIds[0]).toBe(evidence[1]!.id);
  });

  it("business synthesis cannot modify local membership, counts, or canonical reviews", async () => {
    const input = [document(1), document(2)];
    const provider = new SyntheticMvpProvider();
    const artifact = await runMvpAnalysis(input, corpus(input.length), provider);
    const assigned = artifact.themes.flatMap(({ evidenceIds }) => evidenceIds);

    expect(new Set(assigned).size).toBe(input.length);
    expect(artifact.themes.reduce((total, theme) => total + theme.evidenceCount, 0))
      .toBe(input.length);
    expect(artifact.representativeReviews.map(({ canonicalText }) => canonicalText).sort())
      .toEqual(input.map(({ normalizedText }) => normalizedText).sort());
    const businessRequest = provider.requests.find(
      ({ schemaName }) => schemaName === "mvp_business_analysis"
    )!;
    expect(businessRequest.systemPrompt).toContain("Do not invent");
    expect(businessRequest.userPrompt).not.toContain("evidenceIds");
  });

  it("produces the same non-timing artifact for the same input", async () => {
    const input = [document(1), document(2)];
    const first = await runMvpAnalysis(input, corpus(2), new SyntheticMvpProvider());
    const second = await runMvpAnalysis(input, corpus(2), new SyntheticMvpProvider());
    const { runtimeMilliseconds: firstRuntime, ...firstStable } = first;
    const { runtimeMilliseconds: secondRuntime, ...secondStable } = second;

    expect(firstStable).toEqual(secondStable);
    expect(firstRuntime).toBeGreaterThanOrEqual(0);
    expect(secondRuntime).toBeGreaterThanOrEqual(0);
  });

  it("selects the same bounded corpus regardless of input ordering", () => {
    const input = Array.from({ length: 20 }, (_, index) => document(index));
    const first = selectDeterministicMvpDocuments(input, 10);
    const second = selectDeterministicMvpDocuments([...input].reverse(), 10);
    expect(first.map(({ externalId }) => externalId))
      .toEqual(second.map(({ externalId }) => externalId));
  });
});
