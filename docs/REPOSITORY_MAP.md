# Repository Map

Status: Approved & Consolidated
Owner: Project team
Version: v2
Last reviewed: 2026-07-29
Purpose: Help developers and reviewers navigate the Zepto graduation project repository structure.

## Start here

This repository is the internal Review Discovery & Synthesis Engine. It collects permitted research material, checks its quality, scores opportunities deterministically, and turns reviewed records into traceable synthesis. It is not the customer-facing Zepto application.

| Folder/file | Purpose | Current status | Used by | Safe to edit? | Notes |
|---|---|---|---|---|---|
| `docs/PROJECT_STATUS.md` | Audit report of completed & experimental modules | Active source of truth | PM/Engineers | Yes, with review | Audit & module classification |
| `docs/MVP_READINESS.md` | Checklist for MVP graduation readiness | Active checklist | PM/Engineers | Yes, with review | Graduation readiness tracker |
| `docs/PROJECT_ROADMAP.md` | One project timeline | Active overview | Everyone | Yes, with review | Best starting point |
| `docs/project-bible/` | Product goal, research questions, hypotheses, decisions | Active source of truth | PM/research | Only through review | Historical decisions & hypotheses |
| `research/protocols/` | Rules for sources, quality, and insight acceptance | Approved research rules | Research team | Only through review | Prevents unsupported evidence |
| `research/taxonomies/` | Category and behavior definitions | Active | Intake and PM analysis | Only through review | Not Zepto’s official internal taxonomy |
| `research/templates/` | Header-only intake files and query pack | Active | Manual research | Copy locally; do not add real data here | Local imports belong in ignored folders |
| `apps/research-web/` | Internal research screens | Foundation complete | Internal PM/research users | Yes, in a scoped UI phase | Not the customer MVP |
| `services/research-api/` | Internal API | Foundation complete | Research web and database | Carefully | No authentication/deployment hardening yet |
| `services/research-worker/` | Collection, analysis, research intake, scoring | Active production & experimental | Internal workflows | Only in scoped phases | Main pipeline workspace |
| `services/research-worker/src/research/scoring/` | Modular opportunity scoring engine (`core`, `types`, `utils`) | Active Production | `research:opportunities` CLI & tests | Carefully | Modular canonical implementation |
| `services/research-worker/src/research/candidate-prioritization.ts` | Candidate URL & source prioritization | Active Production | `research:prioritize-candidates` | Carefully | Ranks research candidates |
| `services/research-worker/src/category-evidence-intake.ts` | Validates category evidence and interviews | Active Production | `research:intake` | Carefully | Produces readiness report |
| `services/research-worker/src/free-research-discovery.ts` | Search and approved Fetch workflow | Active Production | Discovery/fetch CLI | Carefully | Search candidates are not Evidence |
| `services/research-worker/src/mvp-analysis.ts` | Approved simplified offline analysis | Active Production | MVP analysis commands | Carefully | Preferred graduation analysis path |
| `services/research-worker/src/pipeline.ts` | Original database worker pipeline | Legacy runtime | Worker loop | Reference only | Legacy 5-stage DB processing |
| `services/research-worker/src/analysis-pipeline.ts` | LLM-heavy structured pipeline | Experimental | Scale/reliability tests | Reference only | Experimental reference |
| `packages/research-contracts/` | Shared Zod data definitions | Active core | Web, API, worker, database boundaries | High risk | Contract changes affect multiple packages |
| `packages/shared-config/` | Safe environment loading | Active core | Backend and CLI | High risk | Secrets stay in ignored `.env` |
| `packages/research-database/` | PostgreSQL schema and migrations | Foundation complete | API and worker | Migration review required | Database is not needed for manual discovery |
| `packages/research-prompts/` | Original/versioned prompt definitions | Active plus historical | Original pipeline | Carefully | Retained for reference |
| `docs/screenshots/` | Internal application references | Reference | Submission/demo | Yes, intentionally | Not product evidence |

## Recommended Production Pipeline Architecture

```text
Evidence Collection
→ Evidence Intake
→ Research Readiness
→ Candidate Prioritization
→ Opportunity Scoring
→ Behaviour Knowledge Base
→ Opportunity Synthesis
→ Final MVP Decision
```

## Experimental & Legacy Pipelines

```text
[LEGACY] DB Worker Loop (pipeline.ts)
  claimNextRun → collectRunSources → relevance → evidence_extraction → behavioral_coding → contradiction_detection → theme_synthesis

[EXPERIMENTAL] LLM Structural Pipeline (analysis-pipeline.ts & ai/*)
  LLM Evidence → Theme repair → hierarchical consolidation → multi-window Insight generation
```

These paths are retained for engineering reference and offline regression coverage. They are not used for the production MVP path.

## Important Commands

| Command | What it does | Network/provider behavior |
|---|---|---|
| `pnpm research:intake -- --input <csv> --report-only` | Validate reviewed CSV/interview research | Offline |
| `pnpm research:discover -- --query-pack <csv> --provider tinyfish --limit-queries 8 --report-only` | Find candidate URLs | TinyFish Search only when enabled |
| `pnpm research:fetch-approved -- --input <approval.csv> --provider tinyfish --report-only` | Extract exact human-approved URLs | TinyFish Fetch only when enabled |
| `pnpm research:prioritize-candidates` | Rank research candidate URLs deterministically | Offline |
| `pnpm research:opportunities` | Score opportunities and synthesize reports | Offline |
| `pnpm test` | Run normal offline regression suite | No live providers |
| `pnpm test:scale` | Run synthetic scale tests | Offline |
| `pnpm typecheck` | Validate TypeScript contracts | Offline |
| `pnpm build` | Build applications and services | No research collection |

## What Happens Next

1. Bind top-ranked synthesized opportunity reports to customer-facing UI screens (`apps/research-web`).
2. Conduct human-in-the-loop review of final MVP recommendations.
3. Validate end-to-end customer flow for graduation submission.
