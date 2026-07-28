# Project Structure Audit

Status: Draft for review
Owner: Project team
Version: v1
Last reviewed: 2026-07-28
Purpose: Explain what is in the repository, what is active, and why the current layout is difficult to navigate.

## Executive diagnosis

The repository contains a working internal research product plus several generations of analysis experiments. The code is technically separated into applications, services, and shared packages, but most worker responsibilities sit in one flat `services/research-worker/src/` directory. Branch names preserve the build history, yet a new reader cannot infer the current product path from the folder structure.

The biggest source of confusion is that three paths coexist:

1. The approved simplified MVP analysis in `mvp-analysis.ts`.
2. The original database worker pipeline in `pipeline.ts`.
3. The retained experimental structured pipeline in `analysis-pipeline.ts`, `evidence-extractor.ts`, `theme-clustering.ts`, and `insight-generation.ts`.

These files are not interchangeable. The simplified path is the approved graduation-project analysis direction. The experimental path remains useful engineering reference. The original worker remains the current queue-processing entry point and must not be removed until a separately reviewed integration decision is made.

## What the project contains

### Application 1: Review Discovery Engine

This repository contains the internal PM research application:

- `apps/research-web`: internal Next.js research workspace.
- `services/research-api`: Express API for runs, sources, Evidence, and Themes.
- `services/research-worker`: collection, normalization, analysis, intake, and live-validation workflows.
- `packages/research-database`: PostgreSQL/Drizzle schema and migrations.
- `packages/research-contracts`: shared Zod contracts.
- `packages/research-prompts`: provider-neutral prompt definitions.
- `packages/shared-config`: root environment loading and validation.
- `research`: protocols, taxonomies, query plans, pilot records, and header-only intake templates.
- `docs`: product decisions, research policies, and engineering history.

### Application 2: Zepto customer MVP

The customer-facing Zepto MVP is not present in this repository. It remains a future application to be scoped only after targeted category research, final hypothesis review, and MVP direction selection. The existing `apps/research-web` interface is an internal research tool and must not be treated as the customer MVP.

## Responsibility map

| Responsibility | Current files | Plain-language role |
|---|---|---|
| Source collection | `adapters/*.ts`, `source-orchestrator.ts` | Collect bounded public or manually supplied source material |
| Normalization | `lib/text.ts`, adapter mapping logic | Produce consistent `PublicDocument` text and metadata |
| Exact deduplication | `lib/text.ts`, `multi-source-quality.ts` | Remove exact normalized duplicates and report source distribution |
| Approved MVP analysis | `mvp-analysis.ts`, `mvp-analysis-live.ts` | Create local Evidence, ask AI for a bounded taxonomy/classification, assemble counts locally, and produce business synthesis |
| Experimental analysis | `analysis-pipeline.ts`, `evidence-extractor.ts`, `theme-clustering.ts`, `insight-generation.ts`, `analysis-scale.ts` | Preserved LLM-heavy analysis design and scale experiments |
| Multi-source research | `multi-source-quality.ts`, `multi-source-snapshot.ts`, `multi-source-live.ts` | Combine sources, apply caps, audit quality, and create reproducible snapshots |
| Category evidence | `category-evidence-intake.ts`, `research-intake.ts` | Parse reviewed CSV/interview records and produce intake reports |
| Readiness and provenance | `research-readiness.ts`, `research-provenance.ts` | Classify relevance, score traceability, and report evidence gaps |
| Free discovery | `tinyfish-client.ts`, `free-research-discovery.ts` | Optional Search candidates and human-approved URL extraction |
| CLI commands | `research-intake.ts`, `research-discover.ts`, `research-fetch-approved.ts`, files ending `-live.ts` | Explicit operator entry points |
| AI providers | `ai/*` | Provider-independent execution plus Gemini/Groq adapters |
| Configuration | `packages/shared-config/src/index.ts`, `.env.example` | Load local environment safely and validate settings |
| Contracts | `packages/research-contracts/src/*` | Define shared runtime data shapes and traceability rules |
| Tests | Files ending `.test.ts` | Offline regression tests, plus explicitly named opt-in integration tests |
| Documentation | `docs/**`, `research/protocols/**`, `research/taxonomies/**` | Preserve product intent, source policy, research rules, and decisions |

## File status classification

### Approved and active

- Collection boundary: `adapters/index.ts`, supported adapters, `source-orchestrator.ts`.
- Shared normalization and exact deduplication: `lib/text.ts`.
- Approved simplified analysis: `mvp-analysis.ts`.
- Multi-source quality and snapshots: `multi-source-quality.ts`, `multi-source-snapshot.ts`.
- Category intake: `category-evidence-intake.ts`, `research-intake.ts`.
- Research provenance and readiness: `research-provenance.ts`, `research-readiness.ts`.
- Optional free discovery: `tinyfish-client.ts`, `free-research-discovery.ts`, `research-discover.ts`, `research-fetch-approved.ts`.
- Shared contracts, configuration, database schema, API, and internal web application.

“Active” means retained and supported. It does not imply that every path is wired into one production deployment.

### Experimental but retained

- `analysis-pipeline.ts`
- `analysis-scale.ts`
- `evidence-extractor.ts`
- `theme-clustering.ts`
- `insight-generation.ts`
- `ai/failure-diagnostics.ts`
- `quote-mismatch.ts`

These files record valuable validation, batching, reference-hardening, and diagnostic work. They should remain tested but should not drive the graduation MVP.

### Legacy or superseded direction

- `pipeline.ts`: still the worker entry point, but its original five-stage LLM analysis is not the approved simplified MVP analysis. Treat it as a legacy runtime boundary pending an explicit integration decision.
- `packages/research-prompts/src/index.ts`: contains prompt definitions used by the original pipeline as well as historical structured work. Do not delete until callers are separated.
- README sections describing “Current Phase 3” are historically useful but no longer describe the whole current repository.

Legacy does not mean safe to delete.

### Test-only

- All `*.test.ts` files.
- `database-validation.test.ts`: opt-in live database validation.
- `gemini-integration.test.ts`: opt-in live AI validation.
- `adapters/*.integration.test.ts`: opt-in provider/source validation.

### Live-validation-only

- `analysis-scale-live.ts`
- `frozen-corpus-live.ts`
- `mvp-analysis-live.ts`
- `multi-source-live.ts`
- `pipeline-stability-live.ts`
- `import-manual-pilot.ts`

These are operator tools, not long-running production services.

## Git phase history

The branches below represent completed checkpoints, not a usable runtime folder map.

| Phase checkpoint | Branch | Commit | Status |
|---|---|---|---|
| Research engine foundation | `feat/research-engine-vertical-slice` | `e242f8e` | Completed |
| Source boundary | `feat/source-ingestion` | `9c2ff05` | Completed |
| Firecrawl adapter | `feat/firecrawl-adapter` | `7776bc5` | Completed |
| Google Play adapter | `feat/google-play-adapter` | `11a8d56` | Completed |
| Source orchestration | `feat/source-orchestrator` | `d10ac62` | Completed |
| Worker orchestration integration | `feat/orchestrator-integration` | `9744afc` | Completed |
| Deduplication coverage | `feat/deduplication-audit` | `7f0cab6` | Completed |
| Structured analysis stages | `feat/evidence-extraction`, `feat/theme-clustering`, `feat/insight-generation` | `5665fc5`–`df16d67` | Completed experiments |
| Structured pipeline integration | `feat/analysis-pipeline-integration` | `7eabbad` | Completed experiment |
| Scale and reliability work | `feat/analysis-scale-audit`, `feat/theme-completeness-repair` | `e723e3a`, `a21c013` | Retained experimental checkpoint |
| Simplified MVP analysis | `feat/mvp-analysis-simplification` | `5bd8d4e` | Approved |
| Multi-source readiness | `feat/multi-source-research-coverage` | `0982aed` | Approved |
| Category evidence collection | `feat/category-evidence-collection` | `f7ac3be` | Approved |
| Free research discovery | `feat/free-research-discovery` | `4308a5f` | Current approved continuation point |

Several local diagnostic branch names point to the same experimental commit and were never independently published. They are historical labels, not separate maintained products.

## Remaining phases

The next work is research execution, not another analysis redesign:

1. Collect and review the 24–32-record pilot.
2. Run provenance, relevance, and readiness intake.
3. Expand toward 100 relevant, balanced records if the pilot quality supports it.
4. Analyze the targeted corpus with the approved simplified path.
5. Compare MVP directions and approve one primary and one backup.
6. Build the separate customer-facing Zepto MVP.
7. Finish the internal dashboard, deployment, demo, and submission package.

## Why navigation is currently hard

- Worker files are flat and mix runtime, experiments, tests, research utilities, and live scripts.
- “MVP” can mean the analysis pipeline or the future customer product.
- Current decisions are spread across README, branch history, and multiple phase documents.
- The worker entry point still invokes an older analysis design.
- Documentation is chronological but not organized around one roadmap.
- Templates for different research tasks share one folder.

The proposed cleanup should address naming and grouping without changing runtime behavior.
