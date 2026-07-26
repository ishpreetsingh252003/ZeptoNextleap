import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  StructuredValidationError,
  classifyJsonFailure,
  classifyProviderFailure,
  classifyValidationFailure,
  structuredFailureCategories
} from "./failure-diagnostics.js";

describe("sanitized structured failure diagnostics", () => {
  it("classifies every supported failure category without retaining values", () => {
    const schema = z.object({
      required: z.string(),
      sentiment: z.enum(["positive", "negative"])
    });
    const schemaError = schema.safeParse({
      sentiment: "PRIVATE_INVALID_ENUM_VALUE"
    });
    if (schemaError.success) throw new Error("Fixture must fail.");

    const duplicateError = z.object({
      evidence: z.array(z.string())
    }).superRefine((_value, context) => {
      context.addIssue({
        code: "custom",
        path: ["evidence", 1],
        message: "Duplicate evidence is not allowed."
      });
    }).safeParse({ evidence: ["PRIVATE_QUOTE", "PRIVATE_QUOTE"] });
    if (duplicateError.success) throw new Error("Fixture must fail.");
    const emptyThemeError = z.object({
      themes: z.array(z.object({
        evidenceIds: z.array(z.string()).min(1)
      }))
    }).safeParse({ themes: [{ evidenceIds: [] }] });
    if (emptyThemeError.success) throw new Error("Fixture must fail.");

    const diagnostics = [
      classifyJsonFailure("PRIVATE INVALID JSON", new SyntaxError("bad JSON"), 1),
      classifyJsonFailure("{\"incomplete\":", new SyntaxError("bad JSON"), 1),
      classifyJsonFailure("{", new SyntaxError("Unexpected end of JSON input"), 1),
      classifyJsonFailure("", new SyntaxError("Unexpected end of JSON input"), 1),
      classifyValidationFailure(schemaError.error, { sentiment: "PRIVATE_INVALID_ENUM_VALUE" }, 1),
      classifyValidationFailure(duplicateError.error, { evidence: ["PRIVATE_QUOTE", "PRIVATE_QUOTE"] }, 1),
      classifyValidationFailure(new StructuredValidationError(
        ["UNKNOWN_DOCUMENT", "UNKNOWN_EVIDENCE_REFERENCE"],
        "evidence_reference"
      ), {}, 1),
      classifyValidationFailure(new StructuredValidationError(
        ["QUOTE_NOT_EXACT"],
        "quote_validation"
      ), {}, 1),
      classifyValidationFailure(new StructuredValidationError(
        [
          "UNKNOWN_EVIDENCE_ID",
          "DUPLICATE_EVIDENCE_ASSIGNMENT",
          "MISSING_EVIDENCE_ASSIGNMENT"
        ],
        "evidence_assignment"
      ), {}, 1),
      classifyValidationFailure(emptyThemeError.error, { themes: [{ evidenceIds: [] }] }, 1),
      classifyValidationFailure(new StructuredValidationError(
        ["UNKNOWN_THEME_REFERENCE"],
        "theme_reference"
      ), {}, 1),
      classifyProviderFailure(new Error("Provider returned no structured content."), 1),
      classifyProviderFailure(Object.assign(new Error("request timed out"), { code: "ETIMEDOUT" }), 1),
      classifyProviderFailure(new Error("provider unavailable"), 1),
      classifyValidationFailure(new Error("unclassified"), {}, 1)
    ];
    const observed = new Set(diagnostics.flatMap(({ categories }) => categories));
    const jsonFailures = new Set(diagnostics.map(({ jsonFailure }) => jsonFailure));

    expect([...structuredFailureCategories].every((category) => observed.has(category))).toBe(true);
    expect(jsonFailures).toEqual(new Set([
      "invalid_json",
      "truncated_response",
      "unexpected_termination",
      "empty_response",
      null
    ]));
    expect(JSON.stringify(diagnostics)).not.toContain("PRIVATE");
  });

  it("records only field path, rule, expected type, and actual type for schema failures", () => {
    const parsed = { evidence: [{ sentiment: 42 }] };
    const result = z.object({
      evidence: z.array(z.object({
        supportingQuote: z.string(),
        sentiment: z.enum(["positive", "negative"])
      }))
    }).safeParse(parsed);
    if (result.success) throw new Error("Fixture must fail.");

    const diagnostic = classifyValidationFailure(result.error, parsed, 1);

    expect(diagnostic.validationIssues).toEqual([
      {
        fieldPath: "evidence.0.supportingQuote",
        validationRule: "invalid_type",
        expectedType: "string",
        actualType: "missing"
      },
      {
        fieldPath: "evidence.0.sentiment",
        validationRule: "invalid_value",
        expectedType: "enum",
        actualType: "number"
      }
    ]);
  });
});
