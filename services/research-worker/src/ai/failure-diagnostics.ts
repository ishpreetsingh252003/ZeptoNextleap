import { ZodError, type ZodIssue } from "zod";
import type { QuoteMismatchDiagnostic } from "../quote-mismatch.js";

export const structuredFailureCategories = [
  "INVALID_JSON",
  "SCHEMA_VALIDATION_FAILED",
  "UNKNOWN_DOCUMENT",
  "QUOTE_NOT_EXACT",
  "DUPLICATE_EVIDENCE",
  "EMPTY_RESPONSE",
  "MISSING_REQUIRED_FIELD",
  "INVALID_ENUM",
  "UNKNOWN_EVIDENCE_REFERENCE",
  "UNKNOWN_EVIDENCE_ID",
  "DUPLICATE_EVIDENCE_ASSIGNMENT",
  "MISSING_EVIDENCE_ASSIGNMENT",
  "EMPTY_THEME",
  "UNKNOWN_THEME_REFERENCE",
  "PROVIDER_ERROR",
  "TIMEOUT",
  "OTHER"
] as const;

export type StructuredFailureCategory = typeof structuredFailureCategories[number];

export type SanitizedValidationIssue = {
  fieldPath: string;
  validationRule: string;
  expectedType: string;
  actualType: string;
};

export type StructuredAttemptDiagnostic = {
  attempt: number;
  categories: StructuredFailureCategory[];
  failureLocation:
    | "provider"
    | "json_parse"
    | "schema_validation"
    | "evidence_reference"
    | "quote_validation"
    | "duplicate_validation"
    | "evidence_assignment"
    | "theme_reference"
    | "unknown";
  jsonFailure:
    | "invalid_json"
    | "truncated_response"
    | "empty_response"
    | "unexpected_termination"
    | null;
  validationIssues: SanitizedValidationIssue[];
  quoteMismatch?: QuoteMismatchDiagnostic;
};

export class StructuredValidationError extends Error {
  constructor(
    readonly categories: StructuredFailureCategory[],
    readonly failureLocation: StructuredAttemptDiagnostic["failureLocation"],
    readonly quoteMismatch?: QuoteMismatchDiagnostic
  ) {
    super("Structured response failed semantic validation.");
    this.name = "StructuredValidationError";
  }
}

function typeOf(value: unknown): string {
  if (value === undefined) return "missing";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isNaN(value)) return "nan";
  return typeof value;
}

function valueAtPath(value: unknown, path: readonly PropertyKey[]): unknown {
  let current = value;
  for (const segment of path) {
    if (typeof current !== "object" || current === null) return undefined;
    current = Reflect.get(current, segment);
  }
  return current;
}

function expectedType(issue: ZodIssue): string {
  const expected = Reflect.get(issue, "expected");
  if (typeof expected === "string") return expected;
  if (issue.code === "invalid_value") return "enum";
  if (issue.code === "too_small" || issue.code === "too_big") {
    const origin = Reflect.get(issue, "origin");
    return typeof origin === "string" ? origin : "constrained value";
  }
  if (issue.code === "custom") return "custom rule";
  return "schema-defined type";
}

function issueCategories(issue: ZodIssue, actual: unknown): StructuredFailureCategory[] {
  const categories: StructuredFailureCategory[] = ["SCHEMA_VALIDATION_FAILED"];
  if (issue.code === "invalid_type" && actual === undefined) {
    categories.push("MISSING_REQUIRED_FIELD");
  }
  if (issue.code === "invalid_value") categories.push("INVALID_ENUM");
  if (issue.code === "custom" && issue.message === "Duplicate evidence is not allowed.") {
    categories.push("DUPLICATE_EVIDENCE");
  }
  if (
    issue.code === "too_small"
    && issue.path.at(-1) === "evidenceIds"
    && issue.path.includes("themes")
  ) {
    categories.push("EMPTY_THEME");
  }
  return categories;
}

function uniqueCategories(
  categories: readonly StructuredFailureCategory[]
): StructuredFailureCategory[] {
  return [...new Set(categories)];
}

function isTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = Reflect.get(error, "code");
  return error.name === "AbortError"
    || code === "ETIMEDOUT"
    || code === "UND_ERR_CONNECT_TIMEOUT"
    || /\btime(?:d)?\s*out\b/i.test(error.message);
}

export function classifyProviderFailure(
  error: unknown,
  attempt: number
): StructuredAttemptDiagnostic {
  const emptyResponse = error instanceof Error
    && error.message === "Provider returned no structured content.";
  return {
    attempt,
    categories: emptyResponse
      ? ["EMPTY_RESPONSE"]
      : isTimeout(error)
        ? ["TIMEOUT"]
        : ["PROVIDER_ERROR"],
    failureLocation: "provider",
    jsonFailure: emptyResponse ? "empty_response" : null,
    validationIssues: []
  };
}

export function classifyJsonFailure(
  raw: string,
  error: unknown,
  attempt: number
): StructuredAttemptDiagnostic {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return {
      attempt,
      categories: ["EMPTY_RESPONSE"],
      failureLocation: "json_parse",
      jsonFailure: "empty_response",
      validationIssues: []
    };
  }
  const startsStructured = trimmed.startsWith("{") || trimmed.startsWith("[");
  const endsStructured = trimmed.endsWith("}") || trimmed.endsWith("]");
  const unexpectedTermination = error instanceof SyntaxError
    && /unexpected end|unterminated/i.test(error.message);
  return {
    attempt,
    categories: ["INVALID_JSON"],
    failureLocation: "json_parse",
    jsonFailure: unexpectedTermination
      ? "unexpected_termination"
      : startsStructured && !endsStructured
        ? "truncated_response"
        : "invalid_json",
    validationIssues: []
  };
}

export function classifyValidationFailure(
  error: unknown,
  parsedValue: unknown,
  attempt: number
): StructuredAttemptDiagnostic {
  if (error instanceof StructuredValidationError) {
    return {
      attempt,
      categories: uniqueCategories(error.categories),
      failureLocation: error.failureLocation,
      jsonFailure: null,
      validationIssues: [],
      ...(error.quoteMismatch ? { quoteMismatch: error.quoteMismatch } : {})
    };
  }
  if (error instanceof ZodError) {
    const validationIssues = error.issues.map((issue) => {
      const actual = valueAtPath(parsedValue, issue.path);
      return {
        fieldPath: issue.path.length === 0 ? "$" : issue.path.join("."),
        validationRule: issue.code,
        expectedType: expectedType(issue),
        actualType: typeOf(actual)
      };
    });
    return {
      attempt,
      categories: uniqueCategories(
        error.issues.flatMap((issue) =>
          issueCategories(issue, valueAtPath(parsedValue, issue.path))
        )
      ),
      failureLocation: error.issues.some(
        (issue) => issue.code === "custom"
          && issue.message === "Duplicate evidence is not allowed."
      )
        ? "duplicate_validation"
        : "schema_validation",
      jsonFailure: null,
      validationIssues
    };
  }
  return {
    attempt,
    categories: ["OTHER"],
    failureLocation: "unknown",
    jsonFailure: null,
    validationIssues: []
  };
}
