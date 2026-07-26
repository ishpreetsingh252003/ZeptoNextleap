import { describe, expect, it } from "vitest";
import type { Evidence } from "@zepto/research-contracts";
import { executeStructuredRequest } from "./ai/execute.js";
import type { AiProvider, AiStageRequest, AiStageResult } from "./ai/types.js";
import {
  clusterEvidence,
  evidenceIdFor,
  themeBatchFingerprint,
  ThemeCompletenessRepairError,
  type ThemeClusteringMetrics
} from "./theme-clustering.js";

class RawResponseProvider implements AiProvider {
  readonly provider = "gemini" as const;
  readonly model = "test-model";
  callCount = 0;
  readonly userPrompts: string[] = [];

  constructor(private readonly responses: string[]) {}

  generateStructured<T>(request: AiStageRequest<T>): Promise<AiStageResult<T>> {
    this.userPrompts.push(request.userPrompt);
    return executeStructuredRequest({
      provider: this.provider,
      model: this.model,
      request,
      invoke: async () => {
        const response = this.responses[Math.min(this.callCount, this.responses.length - 1)];
        this.callCount += 1;
        return response ?? "";
      }
    });
  }
}

function evidence(documentId: string, quote: string, sentiment: Evidence["sentiment"] = "neutral"): Evidence {
  return {
    documentId,
    sourceType: "manual_text",
    supportingQuote: quote,
    sentiment,
    category: "Baby care",
    confidence: 0.9
  };
}

function theme(id: string, title: string, evidenceIds: string[], dominantSentiment: Evidence["sentiment"] = "neutral") {
  return {
    id,
    title,
    description: `Evidence grouped under ${title}.`,
    evidenceIds,
    dominantSentiment,
    evidenceCount: evidenceIds.length
  };
}

function response(themes: unknown[]): string {
  return JSON.stringify({ themes });
}

function repairResponse(
  assignments: Array<{ evidenceId: string; themeId: string }>,
  newTheme: {
    id: string;
    title: string;
    description: string;
    dominantSentiment: Evidence["sentiment"];
  } | null = null
): string {
  return JSON.stringify({ assignments, newTheme });
}

function reference(index: number): string {
  return `E${index + 1}`;
}

describe("theme clustering", () => {
  it("returns valid clustering with every evidence record assigned once", async () => {
    const first = evidence("doc-1", "I needed more detail before buying.");
    const second = evidence("doc-2", "The product information answered my questions.", "positive");
    const clusteredTheme = theme("theme-1", "Information needs", [
      evidenceIdFor(first),
      evidenceIdFor(second)
    ], "mixed");

    const provider = new RawResponseProvider([
      response([theme("theme-1", "Information needs", [
        reference(0),
        reference(1)
      ], "mixed")])
    ]);

    const metrics: ThemeClusteringMetrics[] = [];
    await expect(clusterEvidence([first, second], provider, (value) => metrics.push(value)))
      .resolves.toEqual([clusteredTheme]);
    expect(metrics).toMatchObject([{
      initialMissingCount: 0,
      repairRequestCount: 0,
      finalValidationCategory: "valid"
    }]);
    expect(provider.callCount).toBe(1);
    expect(provider.userPrompts[0]).toContain('"evidenceId":"E1"');
    expect(provider.userPrompts[0]).toContain('"evidenceId":"E2"');
    expect(provider.userPrompts[0]).not.toContain(evidenceIdFor(first));
  });

  it("returns immediately for an empty evidence list", async () => {
    const provider = new RawResponseProvider([response([])]);

    await expect(clusterEvidence([], provider)).resolves.toEqual([]);
    expect(provider.callCount).toBe(0);
  });

  it("rejects invalid JSON", async () => {
    await expect(clusterEvidence([
      evidence("doc-1", "I needed more detail before buying.")
    ], new RawResponseProvider(["not JSON"]))).rejects.toMatchObject({
      code: "AI_STAGE_FAILED",
      attemptCount: 2
    });
  });

  it("rejects an unknown evidence ID", async () => {
    const error = await clusterEvidence([
      evidence("doc-1", "I needed more detail before buying.")
    ], new RawResponseProvider([
      response([theme("theme-1", "Information needs", ["unknown-evidence"])])
    ])).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: "AI_STAGE_FAILED",
      attemptDiagnostics: [
        { categories: ["UNKNOWN_EVIDENCE_ID"], failureLocation: "evidence_assignment" },
        { categories: ["UNKNOWN_EVIDENCE_ID"], failureLocation: "evidence_assignment" }
      ]
    });
  });

  it("rejects duplicate evidence assignments", async () => {
    const item = evidence("doc-1", "I needed more detail before buying.");
    const evidenceId = reference(0);

    const error = await clusterEvidence([item], new RawResponseProvider([
      response([
        theme("theme-1", "Information needs", [evidenceId]),
        theme("theme-2", "Purchase uncertainty", [evidenceId])
      ])
    ])).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: "AI_STAGE_FAILED",
      attemptDiagnostics: [
        { categories: ["DUPLICATE_EVIDENCE_ASSIGNMENT"] },
        { categories: ["DUPLICATE_EVIDENCE_ASSIGNMENT"] }
      ]
    });
  });

  it("rejects duplicate theme titles", async () => {
    const first = evidence("doc-1", "I needed more detail before buying.");
    const second = evidence("doc-2", "I searched elsewhere for answers.");

    await expect(clusterEvidence([first, second], new RawResponseProvider([
      response([
        theme("theme-1", "Information needs", [reference(0)]),
        theme("theme-2", " information NEEDS ", [reference(1)])
      ])
    ]))).rejects.toMatchObject({ code: "AI_STAGE_FAILED" });
  });

  it("rejects duplicate theme IDs", async () => {
    const first = evidence("doc-1", "I needed more detail before buying.");
    const second = evidence("doc-2", "A discount encouraged me to try it.", "positive");

    await expect(clusterEvidence([first, second], new RawResponseProvider([
      response([
        theme("theme-1", "Information needs", [reference(0)]),
        theme("theme-1", "Trial incentives", [reference(1)], "positive")
      ])
    ]))).rejects.toMatchObject({ code: "AI_STAGE_FAILED" });
  });

  it("rejects an empty theme", async () => {
    const error = await clusterEvidence([
      evidence("doc-1", "I needed more detail before buying.")
    ], new RawResponseProvider([
      response([theme("theme-1", "Empty theme", [])])
    ])).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: "AI_STAGE_FAILED",
      attemptDiagnostics: [
        { categories: expect.arrayContaining(["SCHEMA_VALIDATION_FAILED", "EMPTY_THEME"]) },
        { categories: expect.arrayContaining(["SCHEMA_VALIDATION_FAILED", "EMPTY_THEME"]) }
      ]
    });
  });

  it("rejects an incorrect evidence count", async () => {
    const item = evidence("doc-1", "I needed more detail before buying.");
    const invalidTheme = {
      ...theme("theme-1", "Information needs", [reference(0)]),
      evidenceCount: 2
    };

    await expect(clusterEvidence([item], new RawResponseProvider([
      response([invalidTheme])
    ]))).rejects.toMatchObject({ code: "AI_STAGE_FAILED" });
  });

  it("accepts a single evidence record in one theme", async () => {
    const item = evidence("doc-1", "I trusted the detailed ingredient list.", "positive");
    const singleTheme = theme("theme-1", "Trust through detail", [evidenceIdFor(item)], "positive");

    await expect(clusterEvidence([item], new RawResponseProvider([
      response([theme("theme-1", "Trust through detail", [reference(0)], "positive")])
    ]))).resolves.toEqual([singleTheme]);
  });

  it("accepts multiple complete themes", async () => {
    const first = evidence("doc-1", "I needed more detail before buying.");
    const second = evidence("doc-2", "A discount encouraged me to try it.", "positive");
    const themes = [
      theme("theme-1", "Information needs", [evidenceIdFor(first)]),
      theme("theme-2", "Trial incentives", [evidenceIdFor(second)], "positive")
    ];

    await expect(clusterEvidence([first, second], new RawResponseProvider([
      response([
        theme("theme-1", "Information needs", [reference(0)]),
        theme("theme-2", "Trial incentives", [reference(1)], "positive")
      ])
    ]))).resolves.toEqual(themes);
  });

  it("rejects malformed theme responses", async () => {
    await expect(clusterEvidence([
      evidence("doc-1", "I needed more detail before buying.")
    ], new RawResponseProvider([
      JSON.stringify({ groups: [] })
    ]))).rejects.toMatchObject({ code: "AI_STAGE_FAILED" });
  });

  it("rejects clustering that leaves evidence unassigned", async () => {
    const first = evidence("doc-1", "I needed more detail before buying.");
    const second = evidence("doc-2", "A discount encouraged me to try it.", "positive");

    const error = await clusterEvidence([first, second], new RawResponseProvider([
      response([theme("theme-1", "Information needs", [reference(0)])]),
      repairResponse([], null)
    ])).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ThemeCompletenessRepairError);
    expect(error).toMatchObject({
      metrics: {
        initialMissingCount: 1,
        repairRequestCount: 1,
        remainingMissingCount: 1,
        finalValidationCategory: "MISSING_EVIDENCE_ASSIGNMENT"
      },
      cause: {
        code: "AI_STAGE_FAILED",
        attemptDiagnostics: [
          { categories: ["MISSING_EVIDENCE_ASSIGNMENT"] },
          { categories: ["MISSING_EVIDENCE_ASSIGNMENT"] }
        ]
      }
    });
    const serialized = JSON.stringify(error);
    expect(serialized).not.toContain("I needed more detail before buying.");
    expect(serialized).not.toContain("A discount encouraged me to try it.");
    expect(serialized).not.toContain("Information needs");
  });

  it("repairs one missing ID into an existing theme", async () => {
    const items = [
      evidence("doc-1", "I needed more detail."),
      evidence("doc-2", "I searched elsewhere.")
    ];
    const provider = new RawResponseProvider([
      response([theme("theme-1", "Information needs", [reference(0)])]),
      repairResponse([{ evidenceId: reference(1), themeId: "theme-1" }])
    ]);
    const metrics: ThemeClusteringMetrics[] = [];

    const result = await clusterEvidence(items, provider, (value) => metrics.push(value));

    expect(result[0]?.evidenceIds).toEqual(items.map(evidenceIdFor));
    expect(result[0]?.evidenceCount).toBe(2);
    expect(provider.callCount).toBe(2);
    expect(metrics).toMatchObject([{
      initialMissingCount: 1,
      repairRequestCount: 1,
      repairProviderAttempts: 1,
      repairedAssignmentCount: 1,
      remainingMissingCount: 0,
      newThemeCreated: false,
      finalValidationCategory: "valid"
    }]);
    expect(provider.userPrompts[1]).toContain('"allowedMissingEvidenceIds":["E2"]');
    expect(provider.userPrompts[1]).not.toContain('"evidenceId":"E1","documentId"');
  });

  it("repairs multiple missing IDs deterministically", async () => {
    const items = [
      evidence("doc-1", "Existing evidence."),
      evidence("doc-2", "Second evidence."),
      evidence("doc-3", "Third evidence.")
    ];
    const result = await clusterEvidence(items, new RawResponseProvider([
      response([theme("theme-1", "Shared theme", [reference(0)])]),
      repairResponse([
        { evidenceId: reference(2), themeId: "theme-1" },
        { evidenceId: reference(1), themeId: "theme-1" }
      ])
    ]));

    expect(result[0]?.evidenceIds).toEqual(items.map(evidenceIdFor));
  });

  it("creates one explicitly returned new theme for missing evidence", async () => {
    const items = [
      evidence("doc-1", "Existing evidence."),
      evidence("doc-2", "Different evidence.", "positive")
    ];
    const result = await clusterEvidence(items, new RawResponseProvider([
      response([theme("theme-1", "Existing theme", [reference(0)])]),
      repairResponse(
        [{ evidenceId: reference(1), themeId: "theme-new" }],
        {
          id: "theme-new",
          title: "Distinct positive behavior",
          description: "A separate supplied pattern.",
          dominantSentiment: "positive"
        }
      )
    ]));

    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({
      id: "theme-new",
      evidenceIds: [evidenceIdFor(items[1]!)],
      evidenceCount: 1
    });
  });

  it.each([
    {
      name: "already assigned IDs",
      repair: repairResponse([{ evidenceId: reference(0), themeId: "theme-1" }]),
      category: "DUPLICATE_EVIDENCE_ASSIGNMENT"
    },
    {
      name: "unknown IDs",
      repair: repairResponse([{ evidenceId: "E999", themeId: "theme-1" }]),
      category: "UNKNOWN_EVIDENCE_ID"
    },
    {
      name: "duplicate repair assignments",
      repair: repairResponse([
        { evidenceId: reference(1), themeId: "theme-1" },
        { evidenceId: reference(1), themeId: "theme-1" }
      ]),
      category: "DUPLICATE_EVIDENCE_ASSIGNMENT"
    }
  ])("rejects $name without changing existing membership", async ({ repair, category }) => {
    const items = [
      evidence("doc-1", "Existing evidence."),
      evidence("doc-2", "Missing evidence.")
    ];
    const error = await clusterEvidence(items, new RawResponseProvider([
      response([theme("theme-1", "Existing theme", [reference(0)])]),
      repair
    ])).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ThemeCompletenessRepairError);
    expect(error).toMatchObject({
      cause: {
        attemptDiagnostics: [
          { categories: [category] },
          { categories: [category] }
        ]
      }
    });
  });

  it("produces stable, identity-sensitive sanitized Theme batch fingerprints", () => {
    const items = [
      evidence("doc-1", "PRIVATE_EVIDENCE_TEXT"),
      evidence("doc-2", "Other evidence.")
    ];
    const fingerprint = themeBatchFingerprint(items);

    expect(fingerprint).toBe(themeBatchFingerprint([...items].reverse()));
    expect(fingerprint).toHaveLength(64);
    expect(themeBatchFingerprint([{ ...items[0]!, supportingQuote: "Changed" }, items[1]!]))
      .not.toBe(fingerprint);
    expect(JSON.stringify({ fingerprint })).not.toContain("PRIVATE_EVIDENCE_TEXT");
  });

  it("generates stable, identity-sensitive evidence IDs", () => {
    const item = evidence("doc-1", "I needed more detail before buying.");

    expect(evidenceIdFor({ ...item })).toBe(evidenceIdFor(item));
    expect(evidenceIdFor({ ...item, documentId: "doc-2" })).not.toBe(evidenceIdFor(item));
    expect(evidenceIdFor({ ...item, sourceType: "google_play" })).not.toBe(evidenceIdFor(item));
    expect(evidenceIdFor({ ...item, supportingQuote: "I found enough detail before buying." })).not.toBe(evidenceIdFor(item));
  });
});
