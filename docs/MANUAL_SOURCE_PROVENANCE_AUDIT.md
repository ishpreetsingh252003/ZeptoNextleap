# Manual Source Provenance Audit

## Document control

- Status: Draft — awaiting human review
- Owner: Product research lead
- Version: v1
- Last reviewed: 2026-07-27
- Purpose: Determine whether each approved pilot record has enough traceability for future cross-source analysis.

## Audit boundary

This audit covers E001–E010 in `research/pilot/evidence-items.csv`. It does not revalidate the underlying user claims or expose stored review text.

All ten records were manually reviewed and entered into the pilot repository, then imported through the CSV boundary for the bounded multi-source run. Each retains a pilot Evidence ID, source-log ID, source name and type, capture date, source link, neutral paraphrase, minimal excerpt, applicability, reviewer status, and limitations. They were not automatically collected by the current adapters.

In the table, **date present** means an absolute publication date is present. Every record has a capture date. Rating absence is a metadata limitation, not evidence that a neutral or zero rating was observed.

## Sanitized record audit

| Record ID | Source | Provenance method | Source URL present | Date present | Rating present | Traceability | Inclusion recommendation |
|---|---|---|---|---|---|---|---|
| E001 | Google Play | Manual research entry; CSV import | Yes | Yes | No | Partial | Retain with limitation |
| E002 | Reddit | Manual thread review; CSV import | Yes | Yes | No / not applicable | Verified | Retain |
| E003 | Reddit | Manual thread review; CSV import | Yes | No | No / not applicable | Partial | Retain with limitation |
| E004 | Reddit | Manual thread review; CSV import | Yes | Yes | No / not applicable | Verified | Retain |
| E005 | Reddit | Manual thread review; CSV import | Yes | Yes | No / not applicable | Verified | Retain |
| E006 | Apple App Store | Manual review entry; CSV import | Yes | Yes | No | Partial | Retain with limitation |
| E007 | Reddit | Manual thread review; CSV import | Yes | No | No / not applicable | Partial | Retain with limitation |
| E008 | Trustpilot | Manual review-page entry; CSV import | Yes | Yes | No | Partial | Retain with limitation |
| E009 | Trustpilot | Manual review-page entry; CSV import | Yes | Yes | No | Partial | Retain with limitation |
| E010 | Trustpilot | Manual review-page entry; CSV import | Yes | Yes | No | Partial | Retain with limitation |

## Decisions

- Retain all ten in the research repository; none is fabricated or provenance-free.
- Treat E002, E004, and E005 as traceable thread-level evidence.
- Treat the remaining seven as limited evidence because an absolute publication date, rating, or review-specific link is missing.
- Do not present partial records as independently verified claims or as proof of cross-source prevalence.
- Before the next AI analysis, add explicit `category`, `behavior_stage`, `evidence_type`, and `provenance_note` fields through the category-expansion template.

No record is currently marked `insufficient`. If a future link cannot be resolved or its stored paraphrase cannot be traced to the linked source, change that record to `exclude` before analysis.
