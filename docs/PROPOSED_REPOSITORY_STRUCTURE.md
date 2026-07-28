# Proposed Repository Structure

Status: Proposal only — no files moved
Owner: Engineering lead
Version: v1
Last reviewed: 2026-07-28
Purpose: Group runtime code by responsibility while preserving phase history in documentation.

## Recommendation

Use a small folder and filename cleanup, not a full rewrite. Keep package boundaries unchanged. Move worker files in small, test-backed commits and avoid changing behavior or public contracts.

## Proposed worker layout

```text
services/research-worker/src/
  collection/
    adapters/
    orchestration/
      source-orchestrator.ts
    normalization/
      text.ts
    deduplication/
      exact-deduplication.ts
      multi-source-quality.ts

  analysis/
    mvp/
      mvp-analysis.ts
    experimental/
      structured-analysis-pipeline.ts
      evidence-extractor.ts
      theme-clustering.ts
      insight-generation.ts
      analysis-scale.ts
      quote-mismatch.ts
    shared/
      corpus-snapshot.ts

  research/
    multi-source/
      multi-source-snapshot.ts
    category-evidence/
      category-evidence-intake.ts
    readiness/
      research-readiness.ts
    provenance/
      research-provenance.ts

  providers/
    ai/
    tinyfish/
      tinyfish-client.ts
      free-research-discovery.ts
    public-web/
      fetch-public.ts

  cli/
    research-intake.ts
    research-discover.ts
    research-fetch-approved.ts
    live-validation/
      analysis-scale-live.ts
      frozen-corpus-live.ts
      mvp-analysis-live.ts
      multi-source-live.ts
      pipeline-stability-live.ts
      import-manual-pilot.ts

  runtime/
    worker-loop.ts
    legacy-database-pipeline.ts

  shared/
    errors/
    ids/
    validation/

  index.ts
```

Do not create every folder up front. Create a folder only when moving its real implementation.

## Proposed documentation layout

```text
docs/
  00-overview/
    PROJECT_ROADMAP.md
    REPOSITORY_MAP.md
    PROJECT_STRUCTURE_AUDIT.md

  01-foundation/
  02-review-collection/
  03-review-analysis/
  04-multi-source-research/
  05-category-evidence/
  06-free-discovery/
  07-mvp-decision/
  08-customer-mvp/
  09-deployment-submission/

  project-bible/
  screenshots/
```

Phase folders should contain the existing authoritative documents, not duplicate summaries. `project-bible/` remains the product/research source of truth.

## Proposed template layout

```text
research/templates/
  source-import/
    category-expansion-evidence.csv
  category-evidence/
    category-research-query-pack.csv
  interviews/
    category-user-interviews.csv
  discovery/
    research-url-approval.csv
```

Local imports and outputs remain under Git-ignored directories.

## Proposed moves and renames

| Current file/group | Proposed location/name | Reason | Size |
|---|---|---|---|
| `adapters/*` | `collection/adapters/*` | Make source collection visible | Small |
| `source-orchestrator.ts` | `collection/orchestration/source-orchestrator.ts` | Separate coordination from adapters | Small |
| `lib/text.ts` | `collection/normalization/text.ts` | Name its runtime responsibility | Small |
| Deduplication functions inside `lib/text.ts` | `collection/deduplication/exact-deduplication.ts` | Make exact-match policy discoverable | Medium |
| `multi-source-quality.ts` | `collection/deduplication/multi-source-quality.ts` | Keep source caps and duplicate reporting together | Small |
| `mvp-analysis.ts` | `analysis/mvp/mvp-analysis.ts` | Mark the approved analysis path | Small |
| Structured analysis files | `analysis/experimental/*` | Prevent accidental MVP use | Medium |
| `analysis-pipeline.ts` | `analysis/experimental/structured-analysis-pipeline.ts` | Remove ambiguity with approved MVP analysis | Medium |
| `corpus-snapshot.ts` | `analysis/shared/corpus-snapshot.ts` | Shared replay boundary | Small |
| Research readiness/provenance/intake files | `research/*` subfolders | Group research operations separately from review analysis | Medium |
| `tinyfish-client.ts`, `free-research-discovery.ts` | `providers/tinyfish/*` | Keep provider-specific code together | Small |
| CLI entry files | `cli/*` | Make operator commands easy to find | Medium |
| Files ending `-live.ts` | `cli/live-validation/*` | Clearly mark opt-in network/AI/database tools | Medium |
| `pipeline.ts` | `runtime/legacy-database-pipeline.ts` | State that it is still runtime-active but not the approved MVP analysis | Medium |
| `index.ts` | Remain at worker root | Conventional service entry point | None |
| Shared packages | Remain under `packages/*` | Existing boundaries are clear and correct | None |
| Web/API/database applications | Remain where they are | No clarity benefit from moving them | None |

## Tests

Keep ordinary unit tests colocated with the implementation they test. When a production file moves, move its `.test.ts` alongside it in the same commit.

Move opt-in integration tests into either:

```text
collection/adapters/*.integration.test.ts
```

or:

```text
tests/integration/
```

Prefer colocation for adapter integration tests because their provider boundary is obvious. Do not create a generic test hierarchy solely for aesthetics.

## Import and script changes

Expected import changes:

- Relative imports throughout `services/research-worker`.
- Dynamic entry paths used by CLI scripts.
- Test imports for every moved implementation.
- References from `pipeline.ts`/runtime files to adapters, AI providers, normalization, and orchestration.
- No shared contract or database schema change should be needed.

Expected package-script changes:

- Update worker script targets for `research:intake`, `research:discover`, `research:fetch-approved`, and all `*:live` commands.
- Update explicit Vitest paths for scale and integration tests.
- Root command names should remain unchanged.

## Risks

- Broken relative imports are the largest risk.
- CLI package scripts can silently point to old paths.
- Test exclusions may stop excluding live tests if paths change.
- Git history becomes harder to follow if moves and edits are mixed.
- Renaming `pipeline.ts` before deciding how simplified analysis integrates could create false confidence that the legacy path is unused.
- A broad move would consume time without improving the graduation evidence.

## Estimated size

**Medium** if completed as the proposed sequence. Approximately 35–50 worker/test files would move or receive import updates, plus package scripts and documentation links. Runtime behavior should remain unchanged.

## Guardrails for a future cleanup

1. One responsibility group per commit.
2. Use pure moves before content edits.
3. Run tests, typecheck, build, and CLI argument-parser tests after every commit.
4. Do not mix analysis integration with folder cleanup.
5. Do not delete experimental files.
6. Keep command names stable.
7. Stop if the diff requires contract, database, or prompt changes.
