import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import { describe, expect, it } from "vitest";
import {
  publicDocumentSchema,
  researchBehaviorStageSchema,
  researchEvidenceTypeSchema,
  type PublicDocument,
  type ResearchBehaviorStage,
  type ResearchEvidenceType
} from "@zepto/research-contracts";
import {
  createCollectionProgressReport,
  parseInterviewEvidenceCsv,
  runResearchIntake,
  selectCategoryResearchCorpus
} from "./category-evidence-intake.js";
import { classifyProvenance } from "./research-provenance.js";
import type { ResearchReadinessThresholds } from "./research-readiness.js";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

function document(
  id: string,
  options: {
    source?: string;
    category?: string;
    stage?: ResearchBehaviorStage;
    evidenceType?: ResearchEvidenceType;
    publicationDate?: string | null;
    sourceUrlAvailable?: boolean;
    provenanceNote?: string;
  } = {}
): PublicDocument {
  const source = options.source ?? "Forum";
  const sourceUrlAvailable = options.sourceUrlAvailable ?? true;
  const url = sourceUrlAvailable
    ? `https://example.com/${id}`
    : `manual://untraceable/${id}`;
  return publicDocumentSchema.parse({
    externalId: id,
    url,
    canonicalUrl: url,
    sourceType: "csv_import",
    sourceName: source,
    platform: source,
    title: null,
    publicationDate:
      options.publicationDate === undefined
        ? "2026-07-01T00:00:00.000Z"
        : options.publicationDate,
    capturedAt: "2026-07-27T00:00:00.000Z",
    normalizedText: `First time category purchase evidence ${id}.`,
    accessMethod: "manual_import",
    policyNote: "Synthetic test fixture.",
    sourceMetadata: {
      sourceUrlAvailable,
      provenanceMethod: "csv_import",
      ...(options.category ? { category: options.category } : {}),
      ...(options.stage ? { behaviorStage: options.stage } : {}),
      ...(options.evidenceType
        ? { evidenceType: options.evidenceType }
        : {}),
      ...(options.provenanceNote
        ? { provenanceNote: options.provenanceNote }
        : {})
    }
  });
}

const smallReadyThresholds: ResearchReadinessThresholds = {
  minRelevantRecords: 4,
  minSources: 2,
  maxSourceConcentration: 0.5,
  minCategories: 2,
  maxCategoryConcentration: 0.5,
  minBarriersOrRisks: 1,
  minTriggersOrTrustSignals: 1,
  minAbandonmentOrWorkarounds: 1
};

describe("category evidence collection", () => {
  it("keeps the query pack within approved taxonomy and category coverage", async () => {
    const text = await readFile(
      join(
        repositoryRoot,
        "research/templates/category-research-query-pack.csv"
      ),
      "utf8"
    );
    const rows = parse(text, { columns: true }) as Array<
      Record<string, string>
    >;
    const categories = new Map<string, number>();
    for (const row of rows) {
      expect(researchBehaviorStageSchema.safeParse(row.behavior_stage).success)
        .toBe(true);
      expect(researchEvidenceTypeSchema.safeParse(
        row.expected_evidence_type
      ).success).toBe(true);
      categories.set(
        row.category!,
        (categories.get(row.category!) ?? 0) + 1
      );
    }
    expect(categories.size).toBe(8);
    expect([...categories.values()].every((count) => count >= 8)).toBe(true);
    for (const category of categories.keys()) {
      const categoryRows = rows.filter((row) => row.category === category);
      expect(categoryRows.some(
        ({ behavior_stage }) => behavior_stage === "abandonment"
      )).toBe(true);
      expect(categoryRows.some(
        ({ behavior_stage }) => behavior_stage === "repeat_purchase"
      )).toBe(true);
      expect(categoryRows.some(
        ({ expected_evidence_type }) =>
          expected_evidence_type === "barrier"
          || expected_evidence_type === "perceived_risk"
      )).toBe(true);
      expect(categoryRows.some(
        ({ expected_evidence_type }) =>
          expected_evidence_type === "trigger"
          || expected_evidence_type === "trust_signal"
          || expected_evidence_type === "positive_signal"
      )).toBe(true);
    }
  });

  it("keeps the interview template empty except for its approved header", async () => {
    const text = await readFile(
      join(
        repositoryRoot,
        "research/templates/category-user-interviews.csv"
      ),
      "utf8"
    );
    expect(text.trim().split(/\r?\n/u)).toHaveLength(1);
    expect(text).toContain("verbatim_quote,researcher_observation");
  });

  it("validates interviews with deterministic IDs and a distinct source type", () => {
    const csv = [
      "interview_id,interview_date,category,behavior_stage,evidence_type,participant_segment,question,response,verbatim_quote,researcher_observation,source_url,consent_status,provenance_note",
      ",2026-07-20,pet care,trial,barrier,current customer,What blocked trial?,I needed expiry details,Expiry details were missing,Researcher observed hesitation,,consent_given,Controlled interview record"
    ].join("\n");
    const first = parseInterviewEvidenceCsv(csv, {
      capturedAt: "2026-07-27T00:00:00.000Z"
    });
    const second = parseInterviewEvidenceCsv(csv, {
      capturedAt: "2026-07-27T00:00:00.000Z"
    });

    expect(first.diagnostics).toEqual([]);
    expect(first.interviews).toEqual(second.interviews);
    expect(first.documents[0]).toMatchObject({
      sourceType: "user_interview",
      accessMethod: "manual_import",
      sourceMetadata: {
        consentStatus: "consent_given",
        verbatimQuoteAvailable: true,
        researcherObservationAvailable: true,
        provenanceLevel: "VERIFIED"
      }
    });
    expect(first.interviews[0]?.verbatimQuote)
      .not.toBe(first.interviews[0]?.researcherObservation);
  });

  it("requires consent and rejects an observation copied as a quote", () => {
    const header =
      "interview_id,interview_date,category,behavior_stage,evidence_type,participant_segment,question,response,verbatim_quote,researcher_observation,source_url,consent_status,provenance_note";
    const result = parseInterviewEvidenceCsv([
      header,
      "i1,2026-07-20,pet care,trial,barrier,,Question,Response,Quote,Observation,,,Controlled record",
      "i2,2026-07-20,pet care,trial,barrier,,Question,Response,Same text,Same text,,consent_given,Controlled record"
    ].join("\n"));

    expect(result.documents).toEqual([]);
    expect(result.diagnostics.map(({ field }) => field))
      .toEqual(expect.arrayContaining([
        "consentStatus",
        "researcherObservation"
      ]));
    expect(JSON.stringify(result.diagnostics)).not.toContain("Same text");
  });

  it("classifies provenance deterministically", () => {
    const verified = document("verified", {
      category: "pet care",
      stage: "trial",
      evidenceType: "barrier",
      provenanceNote: "Public source was manually reviewed."
    });
    const partial = document("partial", {
      category: "pet care",
      stage: "trial",
      evidenceType: "barrier",
      publicationDate: null
    });
    const insufficient = document("insufficient", {
      category: "pet care",
      stage: "trial",
      evidenceType: "barrier",
      sourceUrlAvailable: false
    });

    expect(classifyProvenance(verified)).toBe("VERIFIED");
    expect(classifyProvenance(partial)).toBe("PARTIAL");
    expect(classifyProvenance(insufficient)).toBe("INSUFFICIENT");
    expect(classifyProvenance(verified)).toBe(classifyProvenance(verified));
  });

  it("keeps insufficient records visible but excludes them from readiness", () => {
    const insufficient = document("insufficient", {
      category: "pet care",
      stage: "trial",
      evidenceType: "barrier",
      sourceUrlAvailable: false
    });
    const report = createCollectionProgressReport({
      documents: [insufficient],
      diagnostics: []
    });

    expect(report.acceptedRows).toBe(1);
    expect(report.recordsByProvenance.INSUFFICIENT).toBe(1);
    expect(report.directlyRelevantCount).toBe(1);
    expect(report.status).toBe("NOT_READY");
    expect(report.readinessCriteriaRemaining).toContainEqual(
      expect.objectContaining({
        criterion: "relevant_records",
        actual: 0
      })
    );
  });

  it("report-only mode writes no normalized evidence file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "zepto-intake-report-"));
    try {
      const input = join(directory, "input.csv");
      await writeFile(input, [
        "source,external_id,category,behavior_stage,evidence_type,title,text,rating,created_at,source_url,locale,provenance_note",
        "Forum,e1,pet care,trial,barrier,,First time category trial,,2026-07-01,https://example.com/e1,en-IN,Reviewed public record"
      ].join("\n"));
      const result = await runResearchIntake({
        inputPaths: [input],
        capturedAt: "2026-07-27T00:00:00.000Z"
      });

      expect(result.outputPath).toBeNull();
      expect(await readdir(directory)).toEqual(["input.csv"]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("combines approved files and reports malformed input without raw content", async () => {
    const directory = await mkdtemp(join(tmpdir(), "zepto-intake-multi-"));
    try {
      const valid = join(directory, "valid.csv");
      const malformed = join(directory, "malformed.csv");
      await writeFile(valid, [
        "source,external_id,category,behavior_stage,evidence_type,title,text,rating,created_at,source_url,locale,provenance_note",
        "Forum,e1,pet care,trial,barrier,,First time category trial,,2026-07-01,https://example.com/e1,en-IN,Reviewed public record"
      ].join("\n"));
      await writeFile(
        malformed,
        "source,text\nForum,\"UNTERMINATED_PRIVATE_TEXT"
      );
      const result = await runResearchIntake({
        inputPaths: [valid, malformed],
        capturedAt: "2026-07-27T00:00:00.000Z"
      });

      expect(result.report).toMatchObject({
        importedRecordCount: 2,
        acceptedRows: 1,
        rejectedRows: 1
      });
      expect(result.report.diagnostics[0]).toMatchObject({
        file: "malformed.csv",
        code: "CSV_MALFORMED"
      });
      expect(JSON.stringify(result.report))
        .not.toContain("UNTERMINATED_PRIVATE_TEXT");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("explicit output mode writes only to the requested path", async () => {
    const directory = await mkdtemp(join(tmpdir(), "zepto-intake-output-"));
    try {
      const input = join(directory, "input.csv");
      const output = join(directory, "normalized.json");
      await writeFile(input, [
        "source,external_id,category,behavior_stage,evidence_type,title,text,rating,created_at,source_url,locale,provenance_note",
        "Forum,e1,pet care,trial,barrier,,First time category trial,,2026-07-01,https://example.com/e1,en-IN,Reviewed public record"
      ].join("\n"));
      const result = await runResearchIntake({
        inputPaths: [input],
        outputPath: output,
        capturedAt: "2026-07-27T00:00:00.000Z"
      });

      expect(result.outputPath).toBe(output);
      expect((await readdir(directory)).sort())
        .toEqual(["input.csv", "normalized.json"]);
      expect(JSON.parse(await readFile(output, "utf8")))
        .toMatchObject({ schemaVersion: "category-evidence-intake-v1" });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("refuses repository-local output outside configured ignored paths", async () => {
    const directory = await mkdtemp(join(tmpdir(), "zepto-intake-safe-path-"));
    try {
      const input = join(directory, "input.csv");
      await writeFile(input, [
        "source,external_id,category,behavior_stage,evidence_type,title,text,rating,created_at,source_url,locale,provenance_note",
        "Forum,e1,pet care,trial,barrier,,First time category trial,,2026-07-01,https://example.com/e1,en-IN,Reviewed public record"
      ].join("\n"));
      await expect(runResearchIntake({
        inputPaths: [input],
        outputPath: join(repositoryRoot, "unignored-research-output.json"),
        capturedAt: "2026-07-27T00:00:00.000Z"
      })).rejects.toThrow("Git-ignored research path");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("keeps imported research datasets under Git-ignored paths", async () => {
    const ignore = await readFile(join(repositoryRoot, ".gitignore"), "utf8");
    expect(ignore).toContain("research/imports/");
    expect(ignore).toContain("research/intake-output/");
    expect(ignore).toContain("**/*category-evidence-import*.json");
  });

  it("never exposes raw evidence text in collection reports", () => {
    const raw = "UNIQUE_PRIVATE_RESEARCH_RESPONSE";
    const item = publicDocumentSchema.parse({
      ...document("safe-report", {
        category: "pet care",
        stage: "trial",
        evidenceType: "barrier",
        provenanceNote: "Reviewed."
      }),
      normalizedText: raw
    });
    const report = createCollectionProgressReport({
      documents: [item],
      diagnostics: []
    });

    expect(JSON.stringify(report)).not.toContain(raw);
  });

  it("samples deterministically while respecting category and stage controls", () => {
    const records = [
      document("p1", {
        source: "Reddit",
        category: "pet care",
        stage: "consideration",
        evidenceType: "barrier",
        provenanceNote: "Reviewed."
      }),
      document("p2", {
        source: "Forum",
        category: "pet care",
        stage: "trial",
        evidenceType: "trust_signal",
        provenanceNote: "Reviewed."
      }),
      document("b1", {
        source: "Reddit",
        category: "baby care",
        stage: "consideration",
        evidenceType: "perceived_risk",
        provenanceNote: "Reviewed."
      }),
      document("b2", {
        source: "Forum",
        category: "baby care",
        stage: "trial",
        evidenceType: "trigger",
        provenanceNote: "Reviewed."
      }),
      document("extra", {
        source: "Reddit",
        category: "pet care",
        stage: "trial",
        evidenceType: "barrier",
        provenanceNote: "Reviewed."
      })
    ];
    const config = {
      maxRecordsPerSource: 2,
      maxRecordsPerCategory: 2,
      minRecordsPerCategory: { "pet care": 2, "baby care": 2 },
      minRecordsPerBehaviorStage: { consideration: 2, trial: 2 }
    } as const;
    const first = selectCategoryResearchCorpus(records, config);
    const second = selectCategoryResearchCorpus(
      [...records].reverse(),
      config
    );

    expect(first).toEqual(second);
    expect(first.selectedDocuments).toHaveLength(4);
    expect(first.unmetMinimums).toEqual([]);
    expect(first.selectedDocuments.filter(
      ({ sourceName }) => sourceName === "Reddit"
    )).toHaveLength(2);
    expect(first.selectedDocuments.filter(
      ({ sourceMetadata }) => sourceMetadata?.category === "pet care"
    )).toHaveLength(2);
  });

  it("reconciles READY and NOT_READY checklist outcomes", () => {
    const records = [
      document("p1", {
        source: "Reddit",
        category: "pet care",
        stage: "abandonment",
        evidenceType: "barrier",
        provenanceNote: "Reviewed."
      }),
      document("p2", {
        source: "Forum",
        category: "pet care",
        stage: "repeat_purchase",
        evidenceType: "trigger",
        provenanceNote: "Reviewed."
      }),
      document("b1", {
        source: "Reddit",
        category: "baby care",
        stage: "purchase_elsewhere",
        evidenceType: "workaround",
        provenanceNote: "Reviewed."
      }),
      document("b2", {
        source: "Forum",
        category: "baby care",
        stage: "trial",
        evidenceType: "trust_signal",
        provenanceNote: "Reviewed."
      })
    ];
    const ready = createCollectionProgressReport({
      documents: records,
      diagnostics: [],
      thresholds: smallReadyThresholds
    });
    const notReady = createCollectionProgressReport({
      documents: records.slice(0, 1),
      diagnostics: [],
      thresholds: smallReadyThresholds
    });

    expect(ready.status).toBe("READY");
    expect(ready.readinessCriteriaRemaining).toEqual([]);
    expect(ready.readinessCriteriaMet).toHaveLength(9);
    expect(notReady.status).toBe("NOT_READY");
    expect(notReady.readinessCriteriaRemaining.length).toBeGreaterThan(0);
  });
});
