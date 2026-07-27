import { describe, expect, it } from "vitest";
import {
  publicDocumentSchema,
  researchBehaviorStageSchema,
  researchEvidenceTypeSchema,
  type PublicDocument
} from "@zepto/research-contracts";
import { parseCsvDocuments } from "./adapters/csv-import.js";
import {
  classifyAndPrioritizeResearchDocuments,
  classifyResearchRelevance,
  createResearchReadinessReport,
  type ResearchReadinessThresholds
} from "./research-readiness.js";

function document(
  externalId: string,
  sourceName: string,
  normalizedText: string,
  metadata: NonNullable<PublicDocument["sourceMetadata"]> = {}
): PublicDocument {
  return publicDocumentSchema.parse({
    externalId,
    url: `https://example.com/${externalId}`,
    canonicalUrl: `https://example.com/${externalId}`,
    sourceType: "csv_import",
    sourceName,
    platform: sourceName,
    title: null,
    publicationDate: "2026-07-01T00:00:00.000Z",
    capturedAt: "2026-07-02T00:00:00.000Z",
    normalizedText,
    accessMethod: "manual_import",
    policyNote: "Synthetic test fixture.",
    sourceMetadata: {
      sourceUrlAvailable: true,
      provenanceMethod: "csv_import",
      ...metadata
    }
  });
}

const permissiveThresholds: ResearchReadinessThresholds = {
  minRelevantRecords: 6,
  minSources: 3,
  maxSourceConcentration: 0.5,
  minCategories: 3,
  maxCategoryConcentration: 0.5,
  minBarriersOrRisks: 2,
  minTriggersOrTrustSignals: 2,
  minAbandonmentOrWorkarounds: 2
};

describe("category-expansion research readiness", () => {
  it("accepts every approved behavior stage and evidence type in CSV metadata", () => {
    const stages = researchBehaviorStageSchema.options;
    const evidenceTypes = researchEvidenceTypeSchema.options;
    const rows = stages.map((stage, index) => [
      `Source ${index % 3}`,
      `row-${index}`,
      "pet care",
      stage,
      evidenceTypes[index % evidenceTypes.length],
      `Research record ${index}`,
      "2026-07-01",
      `https://example.com/${index}`,
      "Manually reviewed source record"
    ].join(","));
    const result = parseCsvDocuments([
      "source,external_id,category,behavior_stage,evidence_type,text,created_at,source_url,provenance_note",
      ...rows
    ].join("\n"), {
      capturedAt: "2026-07-02T00:00:00.000Z",
      maxRecords: 100
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.documents).toHaveLength(stages.length);
    expect(result.documents[0]?.sourceMetadata).toMatchObject({
      category: "pet care",
      behaviorStage: stages[0],
      evidenceType: evidenceTypes[0],
      provenanceMethod: "csv_import",
      provenanceNote: "Manually reviewed source record"
    });
  });

  it("rejects invalid research metadata with sanitized row diagnostics", () => {
    const result = parseCsvDocuments([
      "source,category,behavior_stage,evidence_type,text,source_url,provenance_note",
      "Forum,pet care,guessing,barrier,Record one,https://example.com/1,Reviewed",
      "Forum,pet care,trial,opinion,Record two,https://example.com/2,Reviewed",
      "Forum,pet care,trial,barrier,Record three,https://example.com/3,=SECRET"
    ].join("\n"), { maxRecords: 10 });

    expect(result.documents).toEqual([]);
    expect(result.diagnostics.map(({ code, field }) => [code, field]))
      .toEqual([
        ["INVALID_BEHAVIOR_STAGE", "behavior_stage"],
        ["INVALID_EVIDENCE_TYPE", "evidence_type"],
        ["FORMULA_INJECTION", "provenance_note"]
      ]);
    expect(JSON.stringify(result.diagnostics)).not.toContain("SECRET");
  });

  it("classifies explicit and rule-based relevance deterministically", () => {
    const direct = document(
      "direct",
      "Forum",
      "I bought this category elsewhere because I did not trust freshness.",
      {
        category: "fresh produce",
        behaviorStage: "purchase_elsewhere",
        evidenceType: "perceived_risk"
      }
    );
    const potential = document(
      "potential",
      "Forum",
      "A discussion about baby care products."
    );
    const broad = document(
      "broad",
      "Google Play",
      "The delivery was late and customer support did not answer."
    );
    const irrelevant = document(
      "irrelevant",
      "Forum",
      "A general statement without shopping behavior."
    );

    expect(classifyResearchRelevance(direct).relevance)
      .toBe("directly_relevant");
    expect(classifyResearchRelevance(potential).relevance)
      .toBe("potentially_relevant");
    expect(classifyResearchRelevance(broad).relevance)
      .toBe("broad_service_feedback");
    expect(classifyResearchRelevance(irrelevant).relevance)
      .toBe("irrelevant");
    expect(classifyResearchRelevance(direct))
      .toEqual(classifyResearchRelevance(direct));
  });

  it("prioritizes research relevance without discarding any record", () => {
    const records = [
      document("irrelevant", "Forum", "No shopping behavior here."),
      document("broad", "Google Play", "The app crashed during login."),
      document("direct", "Reddit", "I bought elsewhere because I did not trust it."),
      document("potential", "Forum", "Pet care category discussion.")
    ];
    const classified = classifyAndPrioritizeResearchDocuments(records);

    expect(classified.map(({ relevance }) => relevance)).toEqual([
      "directly_relevant",
      "potentially_relevant",
      "broad_service_feedback",
      "irrelevant"
    ]);
    expect(new Set(classified.map(({ document: item }) => item.externalId)))
      .toEqual(new Set(records.map(({ externalId }) => externalId)));
  });

  it("reports a ready corpus with provenance and concentration checks", () => {
    const records = [
      document("a1", "Reddit", "Tried this category for the first time.", {
        category: "pet care",
        behaviorStage: "trial",
        evidenceType: "barrier"
      }),
      document("a2", "Reddit", "Bought elsewhere after comparison.", {
        category: "baby care",
        behaviorStage: "purchase_elsewhere",
        evidenceType: "workaround"
      }),
      document("b1", "Forum", "A trust signal enabled first purchase.", {
        category: "baby care",
        behaviorStage: "first_purchase",
        evidenceType: "trust_signal"
      }),
      document("b2", "Forum", "A quality concern prevented trial.", {
        category: "beauty and skincare",
        behaviorStage: "abandonment",
        evidenceType: "perceived_risk"
      }),
      document("c1", "Apple App Store", "Information enabled repeat purchase.", {
        category: "beauty and skincare",
        behaviorStage: "repeat_purchase",
        evidenceType: "trigger"
      }),
      document("c2", "Apple App Store", "Compared the category before buying.", {
        category: "pet care",
        behaviorStage: "comparison",
        evidenceType: "decision_criterion"
      })
    ];
    const report = createResearchReadinessReport(
      records,
      permissiveThresholds
    );

    expect(report.status).toBe("ready");
    expect(report.unmetCriteria).toEqual([]);
    expect(report.sourceConcentration.ratio).toBeCloseTo(1 / 3);
    expect(report.categoryConcentration.ratio).toBeCloseTo(1 / 3);
    expect(report.provenance).toMatchObject({
      complete: 6,
      incomplete: 0,
      completenessRatio: 1,
      eligibleComplete: 6,
      eligibleIncomplete: 0
    });
  });

  it("reports not_ready for concentration, coverage, and provenance gaps", () => {
    const records = [
      document("one", "Google Play", "Tried pet care for the first time.", {
        category: "pet care",
        behaviorStage: "trial",
        evidenceType: "barrier"
      }),
      publicDocumentSchema.parse({
        ...document(
          "two",
          "Google Play",
          "Avoided ordering pet care due to quality concern.",
          {
            category: "pet care",
            behaviorStage: "abandonment",
            evidenceType: "perceived_risk"
          }
        ),
        url: "manual://missing-source/two",
        canonicalUrl: "manual://missing-source/two",
        sourceMetadata: {
          category: "pet care",
          behaviorStage: "abandonment",
          evidenceType: "perceived_risk",
          sourceUrlAvailable: false,
          provenanceMethod: "csv_import"
        }
      })
    ];
    const report = createResearchReadinessReport(
      records,
      permissiveThresholds
    );

    expect(report.status).toBe("not_ready");
    expect(report.sourceConcentration.ratio).toBe(1);
    expect(report.categoryConcentration.ratio).toBe(1);
    expect(report.provenance.incomplete).toBe(1);
    expect(report.provenance.eligibleIncomplete).toBe(1);
    expect(report.unmetCriteria.map(({ criterion }) => criterion))
      .toEqual(expect.arrayContaining([
        "relevant_records",
        "source_diversity",
        "source_concentration",
        "category_diversity",
        "category_concentration",
        "triggers_or_trust_signals",
        "provenance_completeness"
      ]));
  });

  it("never includes review text in the sanitized readiness report", () => {
    const sensitiveText =
      "UNIQUE_RAW_REVIEW_TEXT should never appear in readiness output.";
    const report = createResearchReadinessReport([
      document("safe-id", "Forum", sensitiveText, {
        category: "pet care",
        behaviorStage: "consideration",
        evidenceType: "information_need"
      })
    ]);

    expect(JSON.stringify(report)).not.toContain(sensitiveText);
    expect(JSON.stringify(report)).not.toContain("UNIQUE_RAW_REVIEW_TEXT");
  });
});
