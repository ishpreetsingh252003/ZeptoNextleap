import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import {
  publicDocumentSchema,
  researchBehaviorStageSchema,
  researchEvidenceTypeSchema,
  type PublicDocument,
  type SourceAdapter
} from "@zepto/research-contracts";
import { normalizeText } from "../lib/text.js";
import { SourceCollectionError } from "./errors.js";

type CsvRow = Record<string, string>;

export type CsvRowDiagnostic = {
  row: number;
  code:
    | "MISSING_TEXT"
    | "INVALID_RATING"
    | "INVALID_DATE"
    | "INVALID_URL"
    | "INVALID_BEHAVIOR_STAGE"
    | "INVALID_EVIDENCE_TYPE"
    | "INVALID_METADATA"
    | "FORMULA_INJECTION";
  field: string;
  message: string;
};

export class CsvImportValidationError extends SourceCollectionError {
  constructor(readonly diagnostics: readonly CsvRowDiagnostic[]) {
    super(
      "CSV_ROW_VALIDATION_FAILED",
      `CSV import rejected ${diagnostics.length} malformed row field${diagnostics.length === 1 ? "" : "s"}.`
    );
  }
}

function stableId(row: CsvRow, text: string): string {
  const supplied = normalizeText(row.external_id ?? row.evidence_id ?? "");
  if (supplied) return supplied;
  const identity = JSON.stringify([
    normalizeText(row.source ?? row.platform ?? "CSV import"),
    text,
    normalizeText(row.created_at ?? row.publication_date ?? ""),
    normalizeText(row.source_url ?? "")
  ]);
  return `csv_${createHash("sha256").update(identity, "utf8").digest("hex")}`;
}

function formulaField(value: string): boolean {
  return /^[\s]*[=+\-@]/.test(value);
}

function parseDate(value: string): string | null {
  if (!value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function parseCsvDocuments(
  csvText: string,
  options: { capturedAt?: string; maxRecords: number }
): { documents: PublicDocument[]; diagnostics: CsvRowDiagnostic[] } {
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
    throw new SourceCollectionError("CSV_MALFORMED", "CSV syntax or column structure is malformed.");
  }

  const diagnostics: CsvRowDiagnostic[] = [];
  const documents: PublicDocument[] = [];
  const capturedAt = options.capturedAt ?? new Date().toISOString();

  for (const [index, row] of rows.slice(0, options.maxRecords).entries()) {
    const rowNumber = index + 2;
    const rawText = row.text ?? row.neutral_paraphrase ?? "";
    const text = normalizeText(rawText).slice(0, 20_000);
    if (!text) {
      diagnostics.push({
        row: rowNumber,
        code: "MISSING_TEXT",
        field: "text",
        message: "A non-empty text value is required."
      });
      continue;
    }

    const formulaEntry = Object.entries(row)
      .find(([, value]) => formulaField(value ?? ""));
    if (formulaEntry) {
      diagnostics.push({
        row: rowNumber,
        code: "FORMULA_INJECTION",
        field: formulaEntry[0]!,
        message: "Spreadsheet formula-leading values are not accepted."
      });
      continue;
    }

    const ratingValue = (row.rating ?? "").trim();
    const rating = ratingValue ? Number(ratingValue) : undefined;
    if (rating !== undefined && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
      diagnostics.push({
        row: rowNumber,
        code: "INVALID_RATING",
        field: "rating",
        message: "Rating must be an integer from 1 to 5."
      });
      continue;
    }

    const rawDate = row.created_at ?? row.publication_date ?? "";
    const publicationDate = parseDate(rawDate);
    if (rawDate.trim() && !publicationDate) {
      diagnostics.push({
        row: rowNumber,
        code: "INVALID_DATE",
        field: "created_at",
        message: "Date must be parseable and is normalized to ISO-8601."
      });
      continue;
    }
    const rawCaptureDate = row.capture_date ?? "";
    const parsedCaptureDate = parseDate(rawCaptureDate);
    if (rawCaptureDate.trim() && !parsedCaptureDate) {
      diagnostics.push({
        row: rowNumber,
        code: "INVALID_DATE",
        field: "capture_date",
        message: "Date must be parseable and is normalized to ISO-8601."
      });
      continue;
    }

    const rawBehaviorStage = (row.behavior_stage ?? "").trim();
    const behaviorStage = rawBehaviorStage
      ? researchBehaviorStageSchema.safeParse(rawBehaviorStage)
      : null;
    if (behaviorStage && !behaviorStage.success) {
      diagnostics.push({
        row: rowNumber,
        code: "INVALID_BEHAVIOR_STAGE",
        field: "behavior_stage",
        message: "Behavior stage is not in the approved category-expansion taxonomy."
      });
      continue;
    }

    const rawEvidenceType = (row.evidence_type ?? "").trim();
    const evidenceType = rawEvidenceType
      ? researchEvidenceTypeSchema.safeParse(rawEvidenceType)
      : null;
    if (evidenceType && !evidenceType.success) {
      diagnostics.push({
        row: rowNumber,
        code: "INVALID_EVIDENCE_TYPE",
        field: "evidence_type",
        message: "Evidence type is not in the approved category-expansion taxonomy."
      });
      continue;
    }

    const externalId = stableId(row, text);
    const rawUrl = (row.source_url ?? "").trim();
    const fallbackUrl = `manual://csv-import/${encodeURIComponent(externalId)}`;
    let canonicalUrl = fallbackUrl;
    if (rawUrl) {
      try {
        canonicalUrl = new URL(rawUrl).href;
      } catch {
        diagnostics.push({
          row: rowNumber,
          code: "INVALID_URL",
          field: "source_url",
          message: "Source URL must be an absolute URL when supplied."
        });
        continue;
      }
    }

    const sourceName = normalizeText(
      row.source ?? row.platform ?? row.source_type ?? "CSV import"
    ).slice(0, 120) || "CSV import";
    const parsedDocument = publicDocumentSchema.safeParse({
      externalId,
      url: canonicalUrl,
      canonicalUrl,
      sourceType: "csv_import",
      sourceName,
      platform: sourceName,
      title: normalizeText(row.title ?? "").slice(0, 500) || null,
      publicationDate,
      capturedAt: parsedCaptureDate ?? capturedAt,
      normalizedText: text,
      accessMethod: "manual_import",
      policyNote: "Imported from a user-supplied CSV; public accessibility, reuse permission, and provenance remain subject to human review.",
      sourceMetadata: {
        ...(rating === undefined ? {} : { rating }),
        ...((row.locale ?? "").trim() ? { locale: row.locale!.trim() } : {}),
        ...((row.country ?? "").trim() ? { country: row.country!.trim() } : {}),
        ...((row.version ?? row.app_version ?? "").trim()
          ? { appVersion: (row.version ?? row.app_version)!.trim() }
          : {}),
        sourceLabel: sourceName,
        sourceUrlAvailable: Boolean(rawUrl),
        ...((row.category ?? row.category_group ?? "").trim()
          ? { category: (row.category ?? row.category_group)!.trim() }
          : {}),
        ...(behaviorStage?.success ? { behaviorStage: behaviorStage.data } : {}),
        ...(evidenceType?.success ? { evidenceType: evidenceType.data } : {}),
        ...((row.provenance_note ?? row.notes_or_limitations ?? "").trim()
          ? {
              provenanceNote:
                (row.provenance_note ?? row.notes_or_limitations)!.trim()
            }
          : {}),
        provenanceMethod: "csv_import"
      }
    });
    if (!parsedDocument.success) {
      diagnostics.push({
        row: rowNumber,
        code: "INVALID_METADATA",
        field: "source_metadata",
        message: "One or more optional metadata fields exceed the normalized contract."
      });
      continue;
    }
    documents.push(parsedDocument.data);
  }
  return { documents, diagnostics };
}

export class CsvImportAdapter implements SourceAdapter {
  readonly type = "csv_import" as const;

  async collect(
    input: Parameters<SourceAdapter["collect"]>[0],
    context: Parameters<SourceAdapter["collect"]>[1]
  ): Promise<PublicDocument[]> {
    if (!input.csvText) {
      throw new SourceCollectionError("MISSING_CSV", "CSV content is required.");
    }
    const result = parseCsvDocuments(input.csvText, {
      maxRecords: Math.min(input.maxRecords, context.maxRecords)
    });
    if (result.diagnostics.length > 0) {
      throw new CsvImportValidationError(result.diagnostics);
    }
    if (result.documents.length === 0) {
      throw new SourceCollectionError("CSV_EMPTY", "CSV import contains no usable records.");
    }
    return result.documents;
  }
}
