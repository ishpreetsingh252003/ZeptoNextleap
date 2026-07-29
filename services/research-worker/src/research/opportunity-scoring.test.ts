import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseBehaviourKnowledgeCsv,
  parseReviewedEvidenceCsv,
  runOpportunityReport,
  scoreOpportunities,
  type ReviewedEvidence
} from "./opportunity-scoring.js";

const temporaryDirectories: string[] = [];

function evidence(
  overrides: Partial<ReviewedEvidence> = {}
): ReviewedEvidence {
  return {
    evidenceId: "evidence_1",
    opportunityId: "opportunity_b",
    opportunityTitle: "Trust in category quality",
    sourceType: "reddit",
    category: "pet care",
    relevanceTags: ["trust_risk"],
    behaviouralThemes: ["trust"],
    ...overrides
  };
}

function csv(records: readonly ReviewedEvidence[]): string {
  return [
    "evidence_id,opportunity_id,opportunity_title,source_type,category,relevance_tags,reviewed",
    ...records.map((record) => [
      record.evidenceId,
      record.opportunityId,
      record.opportunityTitle,
      record.sourceType,
      record.category,
      record.relevanceTags.join(";"),
      "true"
    ].join(","))
  ].join("\n");
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("opportunity scoring", () => {
  it("breaks equal evidence scores by opportunity ID", () => {
    const report = scoreOpportunities([
      evidence({ opportunityId: "opportunity_b", evidenceId: "evidence_b" }),
      evidence({
        opportunityId: "opportunity_a",
        opportunityTitle: "Alternate trust opportunity",
        evidenceId: "evidence_a"
      })
    ]);
    expect(report.topOpportunities.map(({ opportunityId }) => opportunityId))
      .toEqual(["opportunity_a", "opportunity_b"]);
  });

  it("flags weak single-source evidence and lowers confidence", () => {
    const opportunity = scoreOpportunities([evidence()]).topOpportunities[0]!;
    expect(opportunity.weakEvidenceFlags).toEqual(expect.arrayContaining([
      "SINGLE_SOURCE",
      "LOW_SOURCE_DIVERSITY",
      "INTERVIEW_GAP"
    ]));
    expect(opportunity.confidenceScore).toBeLessThan(opportunity.score);
  });

  it("flags category imbalance from structured category values", () => {
    const opportunity = scoreOpportunities([
      evidence({ evidenceId: "evidence_1", category: "pet care" }),
      evidence({ evidenceId: "evidence_2", category: "pet care" }),
      evidence({ evidenceId: "evidence_3", category: "pet care" }),
      evidence({ evidenceId: "evidence_4", category: "pet care" }),
      evidence({ evidenceId: "evidence_5", category: "baby care" })
    ]).topOpportunities[0]!;
    expect(opportunity.weakEvidenceFlags).toContain("CATEGORY_IMBALANCE");
    expect(opportunity.criteria.categoryConcentration).toBe(8);
  });

  it("returns an empty deterministic report for no evidence", () => {
    expect(parseReviewedEvidenceCsv(
      "evidence_id,opportunity_id,opportunity_title,source_type,category,relevance_tags,reviewed\n"
    )).toEqual([]);
    expect(scoreOpportunities([])).toMatchObject({
      evidenceCount: 0,
      sourceDistribution: {},
      topOpportunities: [],
      weakEvidenceFlags: { _corpus: ["NO_EVIDENCE"] },
      interviewGaps: []
    });
  });

  it("generates a report from reviewed structured CSV without network access", async () => {
    const directory = await mkdtemp(join(tmpdir(), "opportunity-report-"));
    temporaryDirectories.push(directory);
    const inputPath = join(directory, "reviewed-evidence.csv");
    await writeFile(inputPath, csv([
      evidence({
        relevanceTags: ["trust_risk", "purchase_elsewhere"],
        sourceType: "trustpilot"
      }),
      evidence({
        evidenceId: "evidence_2",
        sourceType: "reddit",
        relevanceTags: ["positive_counterevidence"]
      })
    ]), "utf8");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const report = await runOpportunityReport({ inputPath });
    expect(report.evidenceCount).toBe(2);
    expect(report.topOpportunities[0]).toMatchObject({
      evidenceCount: 2,
      sourceDistribution: { reddit: 1, trustpilot: 1 }
    });
    expect(report.outputPath).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("requires reviewed rows and explicit structured tags", () => {
    expect(() => parseReviewedEvidenceCsv([
      "evidence_id,opportunity_id,opportunity_title,source_type,category,relevance_tags,reviewed",
      "evidence_1,opportunity_a,Title,reddit,pet care,unknown_tag,true"
    ].join("\n"))).toThrow("unsupported relevance_tags");
  });

  it("joins reviewed knowledge only when opportunity and behavioural theme match", () => {
    const knowledge = parseBehaviourKnowledgeCsv([
      "record_id,theme,summary,source,opportunity_ids,reviewed,notes",
      "theory_1,trust,Manual summary,reviewed source,opportunity_b,true,"
    ].join("\n"), "behavioural_theories");
    const opportunity = scoreOpportunities([evidence()], knowledge)
      .topOpportunities[0]!;
    expect(opportunity).toMatchObject({
      behaviourKnowledgeSupportCount: 1,
      behaviourKnowledgeThemes: ["trust"],
      behaviourKnowledgeDatasets: ["behavioural_theories"],
      confidenceUplift: 5
    });
    expect(opportunity.weakEvidenceFlags).not.toContain("BEHAVIOURAL_RESEARCH_GAP");
  });

  it("does not uplift confidence for an explicit opportunity link with a mismatched theme", () => {
    const knowledge = parseBehaviourKnowledgeCsv([
      "record_id,theme,summary,source,opportunity_ids,reviewed,notes",
      "paper_1,habit,Manual summary,reviewed source,opportunity_b,true,"
    ].join("\n"), "research_papers");
    const report = scoreOpportunities([evidence()], knowledge);
    expect(report.opportunitiesSupportedOnlyByReviews).toEqual(["opportunity_b"]);
    expect(report.opportunitiesSupportedByReviewsAndBehaviour).toEqual([]);
    expect(report.remainingEvidenceGaps.opportunity_b).toEqual(expect.arrayContaining([
      "BEHAVIOURAL_RESEARCH_GAP",
      "KNOWLEDGE_THEME_UNMATCHED"
    ]));
  });

  it("caps deterministic behavioural confidence uplift", () => {
    const knowledge = parseBehaviourKnowledgeCsv([
      "record_id,theme,summary,source,opportunity_ids,reviewed,notes",
      "k1,trust,Manual,source,opportunity_b,true,",
      "k2,trust,Manual,source,opportunity_b,true,",
      "k3,trust,Manual,source,opportunity_b,true,",
      "k4,trust,Manual,source,opportunity_b,true,",
      "k5,trust,Manual,source,opportunity_b,true,"
    ].join("\n"), "commerce_insights");
    const opportunity = scoreOpportunities([evidence()], knowledge)
      .topOpportunities[0]!;
    expect(opportunity.confidenceUplift).toBe(15);
  });

  it("rejects knowledge rows that have not been manually reviewed", () => {
    expect(() => parseBehaviourKnowledgeCsv([
      "record_id,theme,summary,source,opportunity_ids,reviewed,notes",
      "case_1,risk,Manual,source,opportunity_b,false,"
    ].join("\n"), "industry_case_studies")).toThrow("reviewed must be true");
  });

  it("rejects knowledge records with more than one theme", () => {
    expect(() => parseBehaviourKnowledgeCsv([
      "record_id,theme,summary,source,opportunity_ids,reviewed,notes",
      "paper_1,trust;risk,Manual,source,opportunity_b,true,"
    ].join("\n"), "research_papers")).toThrow("exactly one controlled value");
  });
});
