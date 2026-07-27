import { createHash } from "node:crypto";
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep
} from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import {
  interviewConsentStatusSchema,
  publicDocumentSchema,
  researchBehaviorStageSchema,
  researchEvidenceTypeSchema,
  type ProvenanceLevel,
  type PublicDocument,
  type ResearchBehaviorStage,
  type ResearchRelevance
} from "@zepto/research-contracts";
import { findRepositoryRoot } from "@zepto/shared-config";
import {
  parseCsvDocuments,
  type CsvRowDiagnostic
} from "./adapters/csv-import.js";
import { normalizeText } from "./lib/text.js";
import {
  classifyAndPrioritizeResearchDocuments,
  createResearchReadinessReport,
  defaultResearchReadinessThresholds,
  type ReadinessCriterion,
  type ResearchReadinessThresholds
} from "./research-readiness.js";
import {
  classifyProvenance,
  withProvenanceLevel
} from "./research-provenance.js";

type CsvRow = Record<string, string>;

export const interviewEvidenceSchema = z.object({
  interviewId: z.string().trim().min(1),
  interviewDate: z.string().date(),
  category: z.string().trim().min(1).max(120),
  behaviorStage: researchBehaviorStageSchema,
  evidenceType: researchEvidenceTypeSchema,
  participantSegment: z.string().trim().max(160),
  question: z.string().trim().min(1).max(1_000),
  response: z.string().trim().min(1).max(20_000),
  verbatimQuote: z.string().trim().max(2_000),
  researcherObservation: z.string().trim().max(2_000),
  sourceUrl: z.string().url().optional(),
  consentStatus: interviewConsentStatusSchema,
  provenanceNote: z.string().trim().min(1).max(500)
}).strict().superRefine((record, context) => {
  if (
    record.verbatimQuote
    && record.researcherObservation
    && record.verbatimQuote === record.researcherObservation
  ) {
    context.addIssue({
      code: "custom",
      path: ["researcherObservation"],
      message: "Researcher observation must remain distinct from verbatim quote."
    });
  }
});

export type InterviewEvidenceRecord = z.infer<
  typeof interviewEvidenceSchema
>;

export type IntakeDiagnostic = {
  file: string;
  row: number | null;
  code: string;
  field: string | null;
  message: string;
};

export type InterviewParseResult = {
  documents: PublicDocument[];
  interviews: InterviewEvidenceRecord[];
  diagnostics: IntakeDiagnostic[];
};

function deterministicInterviewId(row: CsvRow): string {
  const supplied = normalizeText(row.interview_id ?? "");
  if (supplied) return supplied;
  const identity = JSON.stringify([
    normalizeText(row.interview_date ?? ""),
    normalizeText(row.category ?? ""),
    normalizeText(row.question ?? ""),
    normalizeText(row.response ?? "")
  ]);
  return `interview_${createHash("sha256")
    .update(identity, "utf8")
    .digest("hex")}`;
}

function formulaField(row: CsvRow): string | null {
  return Object.entries(row)
    .find(([, value]) => /^[\s]*[=+\-@]/.test(value ?? ""))?.[0] ?? null;
}

function issueDiagnostic(
  file: string,
  row: number,
  issue: z.core.$ZodIssue
): IntakeDiagnostic {
  return {
    file,
    row,
    code: "INVALID_INTERVIEW_FIELD",
    field: issue.path.map(String).join(".") || null,
    message: issue.message
  };
}

export function parseInterviewEvidenceCsv(
  csvText: string,
  options: { fileLabel?: string; capturedAt?: string } = {}
): InterviewParseResult {
  const file = options.fileLabel ?? "interview.csv";
  let rows: CsvRow[];
  try {
    rows = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      relax_column_count: false,
      trim: false
    }) as CsvRow[];
  } catch {
    return {
      documents: [],
      interviews: [],
      diagnostics: [{
        file,
        row: null,
        code: "CSV_MALFORMED",
        field: null,
        message: "CSV syntax or column structure is malformed."
      }]
    };
  }

  const documents: PublicDocument[] = [];
  const interviews: InterviewEvidenceRecord[] = [];
  const diagnostics: IntakeDiagnostic[] = [];
  const capturedAt = options.capturedAt ?? new Date().toISOString();

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    const formula = formulaField(row);
    if (formula) {
      diagnostics.push({
        file,
        row: rowNumber,
        code: "FORMULA_INJECTION",
        field: formula,
        message: "Spreadsheet formula-leading values are not accepted."
      });
      continue;
    }

    const sourceUrl = normalizeText(row.source_url ?? "");
    const parsed = interviewEvidenceSchema.safeParse({
      interviewId: deterministicInterviewId(row),
      interviewDate: normalizeText(row.interview_date ?? ""),
      category: normalizeText(row.category ?? ""),
      behaviorStage: normalizeText(row.behavior_stage ?? ""),
      evidenceType: normalizeText(row.evidence_type ?? ""),
      participantSegment: normalizeText(row.participant_segment ?? ""),
      question: normalizeText(row.question ?? ""),
      response: normalizeText(row.response ?? ""),
      verbatimQuote: normalizeText(row.verbatim_quote ?? ""),
      researcherObservation: normalizeText(
        row.researcher_observation ?? ""
      ),
      ...(sourceUrl ? { sourceUrl } : {}),
      consentStatus: normalizeText(row.consent_status ?? ""),
      provenanceNote: normalizeText(row.provenance_note ?? "")
    });
    if (!parsed.success) {
      diagnostics.push(
        ...parsed.error.issues.map((issue) =>
          issueDiagnostic(file, rowNumber, issue)
        )
      );
      continue;
    }

    const interview = parsed.data;
    const canonicalUrl =
      interview.sourceUrl
      ?? `interview://controlled/${encodeURIComponent(interview.interviewId)}`;
    const document = publicDocumentSchema.parse({
      externalId: interview.interviewId,
      url: canonicalUrl,
      canonicalUrl,
      sourceType: "user_interview",
      sourceName: "User interview",
      platform: "Controlled interview record",
      title: interview.question,
      publicationDate: new Date(
        `${interview.interviewDate}T00:00:00.000Z`
      ).toISOString(),
      capturedAt,
      normalizedText: interview.response,
      accessMethod: "manual_import",
      policyNote:
        "Controlled primary-research record; it is not public-source evidence.",
      sourceMetadata: {
        category: interview.category,
        behaviorStage: interview.behaviorStage,
        evidenceType: interview.evidenceType,
        provenanceNote: interview.provenanceNote,
        provenanceMethod: "manual_entry",
        consentStatus: interview.consentStatus,
        participantSegment: interview.participantSegment || undefined,
        interviewDate: interview.interviewDate,
        verbatimQuoteAvailable: Boolean(interview.verbatimQuote),
        researcherObservationAvailable: Boolean(
          interview.researcherObservation
        ),
        sourceLabel: "Controlled interview record",
        sourceUrlAvailable: Boolean(interview.sourceUrl)
      }
    });
    interviews.push(interview);
    documents.push(withProvenanceLevel(document));
  }

  return { documents, interviews, diagnostics };
}

function toIntakeDiagnostic(
  file: string,
  diagnostic: CsvRowDiagnostic
): IntakeDiagnostic {
  return {
    file,
    row: diagnostic.row,
    code: diagnostic.code,
    field: diagnostic.field,
    message: diagnostic.message
  };
}

function csvHeaders(csvText: string): string[] {
  try {
    const rows = parse(csvText, {
      to_line: 1,
      skip_empty_lines: true,
      bom: true
    }) as string[][];
    return rows[0]?.map((value) => value.trim()) ?? [];
  } catch {
    return [];
  }
}

export type CollectionProgressReport = {
  status: "READY" | "NOT_READY";
  importedRecordCount: number;
  acceptedRows: number;
  rejectedRows: number;
  recordsByProvenance: Record<ProvenanceLevel, number>;
  recordsByCategory: Record<string, number>;
  recordsBySource: Record<string, number>;
  recordsByBehaviorStage: Record<string, number>;
  recordsByEvidenceType: Record<string, number>;
  directlyRelevantCount: number;
  potentiallyRelevantCount: number;
  readinessCriteriaMet: string[];
  readinessCriteriaRemaining: Array<{
    criterion: string;
    actual: number;
    required: number;
    comparison: string;
  }>;
  recommendedNextEvidenceGaps: string[];
  diagnostics: IntakeDiagnostic[];
};

function nextEvidenceGaps(
  remaining: CollectionProgressReport["readinessCriteriaRemaining"]
): string[] {
  const messages: Record<string, string> = {
    relevant_records:
      "Collect more records with explicit category consideration, trial, abandonment, channel-switching, or repeat behavior.",
    source_diversity:
      "Add approved evidence from additional genuine source types.",
    source_concentration:
      "Collect from underrepresented sources before selecting the next corpus.",
    category_diversity:
      "Collect traceable evidence for additional target categories.",
    category_concentration:
      "Collect from underrepresented categories before analysis.",
    barriers_or_risks:
      "Collect more barriers and perceived-risk records.",
    triggers_or_trust_signals:
      "Collect more triggers and trust-signal records.",
    abandonment_or_workarounds:
      "Collect more abandonment, purchase-elsewhere, and workaround records.",
    provenance_completeness:
      "Resolve provenance gaps before selecting records."
  };
  return [...new Set(
    remaining.map(({ criterion }) =>
      messages[criterion] ?? "Review the remaining readiness criterion."
    )
  )];
}

export function createCollectionProgressReport(input: {
  documents: readonly PublicDocument[];
  diagnostics: readonly IntakeDiagnostic[];
  thresholds?: ResearchReadinessThresholds;
}): CollectionProgressReport {
  const readiness = createResearchReadinessReport(
    input.documents,
    input.thresholds ?? defaultResearchReadinessThresholds
  );
  const allCriteria: ReadinessCriterion[] = [
    "relevant_records",
    "source_diversity",
    "source_concentration",
    "category_diversity",
    "category_concentration",
    "barriers_or_risks",
    "triggers_or_trust_signals",
    "abandonment_or_workarounds",
    "provenance_completeness"
  ];
  const remaining = readiness.unmetCriteria.map((item) => ({
    criterion: item.criterion,
    actual: item.actual,
    required: item.required,
    comparison: item.comparison
  }));
  const failed = new Set(remaining.map(({ criterion }) => criterion));

  return {
    status: readiness.status === "ready" ? "READY" : "NOT_READY",
    importedRecordCount:
      input.documents.length
      + new Set(
        input.diagnostics.map(({ file, row }) => `${file}:${row ?? "file"}`)
      ).size,
    acceptedRows: input.documents.length,
    rejectedRows: new Set(
      input.diagnostics.map(({ file, row }) => `${file}:${row ?? "file"}`)
    ).size,
    recordsByProvenance: readiness.recordsByProvenance,
    recordsByCategory: readiness.recordsByCategory,
    recordsBySource: readiness.recordsBySource,
    recordsByBehaviorStage: readiness.recordsByBehaviorStage,
    recordsByEvidenceType: readiness.recordsByEvidenceType,
    directlyRelevantCount:
      readiness.recordsByRelevance.directly_relevant,
    potentiallyRelevantCount:
      readiness.recordsByRelevance.potentially_relevant,
    readinessCriteriaMet: allCriteria.filter((item) => !failed.has(item)),
    readinessCriteriaRemaining: remaining,
    recommendedNextEvidenceGaps: nextEvidenceGaps(remaining),
    diagnostics: [...input.diagnostics]
  };
}

export type IntakeResult = {
  documents: PublicDocument[];
  interviews: InterviewEvidenceRecord[];
  report: CollectionProgressReport;
  outputPath: string | null;
};

export async function runResearchIntake(options: {
  inputPaths: readonly string[];
  outputPath?: string;
  capturedAt?: string;
  thresholds?: ResearchReadinessThresholds;
}): Promise<IntakeResult> {
  if (options.inputPaths.length === 0) {
    throw new Error("At least one --input CSV file is required.");
  }
  const documents: PublicDocument[] = [];
  const interviews: InterviewEvidenceRecord[] = [];
  const diagnostics: IntakeDiagnostic[] = [];
  const seenIds = new Set<string>();

  for (const path of options.inputPaths) {
    const file = basename(path);
    let csvText: string;
    try {
      csvText = await readFile(path, "utf8");
    } catch {
      diagnostics.push({
        file,
        row: null,
        code: "FILE_UNREADABLE",
        field: null,
        message: "Input file could not be read."
      });
      continue;
    }
    const headers = csvHeaders(csvText);
    let result: InterviewParseResult;
    if (headers.includes("interview_id")) {
      result = parseInterviewEvidenceCsv(csvText, {
        fileLabel: file,
        ...(options.capturedAt ? { capturedAt: options.capturedAt } : {})
      });
    } else {
      try {
        const parsed = parseCsvDocuments(csvText, {
          maxRecords: 5_000,
          ...(options.capturedAt ? { capturedAt: options.capturedAt } : {})
        });
        result = {
          documents: parsed.documents.map(withProvenanceLevel),
          interviews: [],
          diagnostics: parsed.diagnostics.map((item) =>
            toIntakeDiagnostic(file, item)
          )
        };
      } catch {
        result = {
          documents: [],
          interviews: [],
          diagnostics: [{
            file,
            row: null,
            code: "CSV_MALFORMED",
            field: null,
            message: "CSV syntax or column structure is malformed."
          }]
        };
      }
    }

    diagnostics.push(...result.diagnostics);
    for (const document of result.documents) {
      const key = `${document.sourceType}:${document.externalId}`;
      if (seenIds.has(key)) {
        diagnostics.push({
          file,
          row: null,
          code: "DUPLICATE_EXTERNAL_ID",
          field: "external_id",
          message: "Duplicate source type and external ID was not imported."
        });
        continue;
      }
      seenIds.add(key);
      documents.push(document);
      const interview = result.interviews.find(
        ({ interviewId }) => interviewId === document.externalId
      );
      if (interview) interviews.push(interview);
    }
  }

  const report = createCollectionProgressReport({
    documents,
    diagnostics,
    ...(options.thresholds ? { thresholds: options.thresholds } : {})
  });
  if (options.outputPath) {
    const outputPath = resolve(options.outputPath);
    const repositoryRoot = findRepositoryRoot();
    if (repositoryRoot) {
      const repositoryRelative = relative(repositoryRoot, outputPath);
      const insideRepository =
        repositoryRelative !== ""
        && !repositoryRelative.startsWith(`..${sep}`)
        && !isAbsolute(repositoryRelative);
      const normalizedRelative = repositoryRelative.replaceAll("\\", "/");
      const ignoredLocation =
        normalizedRelative.startsWith("research/imports/")
        || normalizedRelative.startsWith("research/intake-output/")
        || /(^|\/)[^/]*category-evidence-import[^/]*\.json$/u
          .test(normalizedRelative);
      if (insideRepository && !ignoredLocation) {
        throw new Error(
          "Repository-local output must use a configured Git-ignored research path."
        );
      }
    }
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify({
      schemaVersion: "category-evidence-intake-v1",
      createdAt: options.capturedAt ?? new Date().toISOString(),
      documents,
      interviews
    }, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx"
    });
  }
  return {
    documents,
    interviews,
    report,
    outputPath: options.outputPath ? resolve(options.outputPath) : null
  };
}

export type CategorySamplingConfig = {
  maxRecordsPerSource?: number | Readonly<Record<string, number>>;
  maxRecordsPerCategory?: number | Readonly<Record<string, number>>;
  minRecordsPerCategory?: Readonly<Record<string, number>>;
  minRecordsPerBehaviorStage?: Partial<
    Readonly<Record<ResearchBehaviorStage, number>>
  >;
  eligibleProvenance?: readonly ProvenanceLevel[];
  eligibleRelevance?: readonly ResearchRelevance[];
};

export type CategorySamplingResult = {
  selectedDocuments: PublicDocument[];
  excludedRecords: Array<{
    documentId: string;
    reason: "provenance" | "relevance" | "source_cap" | "category_cap";
  }>;
  unmetMinimums: Array<{
    dimension: "category" | "behavior_stage";
    value: string;
    actual: number;
    required: number;
  }>;
};

function configuredLimit(
  setting: number | Readonly<Record<string, number>> | undefined,
  value: string
): number {
  if (setting === undefined) return Number.POSITIVE_INFINITY;
  return typeof setting === "number"
    ? setting
    : setting[value] ?? Number.POSITIVE_INFINITY;
}

export function selectCategoryResearchCorpus(
  documents: readonly PublicDocument[],
  config: CategorySamplingConfig = {}
): CategorySamplingResult {
  const eligibleProvenance = new Set(
    config.eligibleProvenance ?? ["VERIFIED", "PARTIAL"]
  );
  const eligibleRelevance = new Set(
    config.eligibleRelevance
    ?? ["directly_relevant", "potentially_relevant"]
  );
  const classified = classifyAndPrioritizeResearchDocuments(documents);
  const provenanceRank: Record<ProvenanceLevel, number> = {
    VERIFIED: 0,
    PARTIAL: 1,
    INSUFFICIENT: 2
  };
  const relevanceRank: Record<ResearchRelevance, number> = {
    directly_relevant: 0,
    potentially_relevant: 1,
    broad_service_feedback: 2,
    irrelevant: 3
  };
  const candidates = classified
    .filter(({ document, relevance }) =>
      eligibleRelevance.has(relevance)
      && eligibleProvenance.has(classifyProvenance(document))
    )
    .sort((first, second) =>
      relevanceRank[first.relevance] - relevanceRank[second.relevance]
      || provenanceRank[classifyProvenance(first.document)]
        - provenanceRank[classifyProvenance(second.document)]
      || first.document.externalId.localeCompare(second.document.externalId)
    );
  const selected: PublicDocument[] = [];
  const selectedIds = new Set<string>();
  const sourceCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  const canAdd = (document: PublicDocument) => {
    const category = document.sourceMetadata?.category ?? "unknown";
    return (
      (sourceCounts.get(document.sourceName) ?? 0)
        < configuredLimit(config.maxRecordsPerSource, document.sourceName)
      && (categoryCounts.get(category) ?? 0)
        < configuredLimit(config.maxRecordsPerCategory, category)
    );
  };
  const add = (document: PublicDocument) => {
    const key = `${document.sourceType}:${document.externalId}`;
    if (selectedIds.has(key) || !canAdd(document)) return false;
    selectedIds.add(key);
    selected.push(document);
    sourceCounts.set(
      document.sourceName,
      (sourceCounts.get(document.sourceName) ?? 0) + 1
    );
    const category = document.sourceMetadata?.category ?? "unknown";
    categoryCounts.set(
      category,
      (categoryCounts.get(category) ?? 0) + 1
    );
    return true;
  };

  for (const [stage, minimum] of Object.entries(
    config.minRecordsPerBehaviorStage ?? {}
  ).sort(([first], [second]) => first.localeCompare(second))) {
    for (const candidate of candidates) {
      const actual = selected.filter(
        ({ sourceMetadata }) => sourceMetadata?.behaviorStage === stage
      ).length;
      if (actual >= minimum) break;
      if (candidate.document.sourceMetadata?.behaviorStage === stage) {
        add(candidate.document);
      }
    }
  }
  for (const [category, minimum] of Object.entries(
    config.minRecordsPerCategory ?? {}
  ).sort(([first], [second]) => first.localeCompare(second))) {
    for (const candidate of candidates) {
      if ((categoryCounts.get(category) ?? 0) >= minimum) break;
      if (candidate.document.sourceMetadata?.category === category) {
        add(candidate.document);
      }
    }
  }
  for (const candidate of candidates) add(candidate.document);

  const excludedRecords = classified
    .filter(({ document }) =>
      !selectedIds.has(`${document.sourceType}:${document.externalId}`)
    )
    .map(({ document, relevance }) => {
      const provenance = classifyProvenance(document);
      if (!eligibleProvenance.has(provenance)) {
        return { documentId: document.externalId, reason: "provenance" as const };
      }
      if (!eligibleRelevance.has(relevance)) {
        return { documentId: document.externalId, reason: "relevance" as const };
      }
      const category = document.sourceMetadata?.category ?? "unknown";
      const sourceAtCap =
        (sourceCounts.get(document.sourceName) ?? 0)
        >= configuredLimit(config.maxRecordsPerSource, document.sourceName);
      return {
        documentId: document.externalId,
        reason: sourceAtCap ? "source_cap" as const : "category_cap" as const
      };
    });
  const unmetMinimums: CategorySamplingResult["unmetMinimums"] = [];
  for (const [category, required] of Object.entries(
    config.minRecordsPerCategory ?? {}
  )) {
    const actual = selected.filter(
      ({ sourceMetadata }) => sourceMetadata?.category === category
    ).length;
    if (actual < required) {
      unmetMinimums.push({
        dimension: "category",
        value: category,
        actual,
        required
      });
    }
  }
  for (const [stage, required] of Object.entries(
    config.minRecordsPerBehaviorStage ?? {}
  )) {
    const actual = selected.filter(
      ({ sourceMetadata }) => sourceMetadata?.behaviorStage === stage
    ).length;
    if (actual < required) {
      unmetMinimums.push({
        dimension: "behavior_stage",
        value: stage,
        actual,
        required
      });
    }
  }

  return {
    selectedDocuments: selected,
    excludedRecords,
    unmetMinimums: unmetMinimums.sort((first, second) =>
      first.dimension.localeCompare(second.dimension)
      || first.value.localeCompare(second.value)
    )
  };
}
