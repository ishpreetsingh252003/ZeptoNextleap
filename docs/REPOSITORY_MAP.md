# Repository Map

Status: Draft for review
Owner: Project team
Version: v1
Last reviewed: 2026-07-28
Purpose: Help a non-engineer find the important parts of the Zepto graduation project.

## Start here

This repository is the internal Review Discovery Engine. It collects permitted research material, checks its quality, and turns reviewed records into traceable analysis. It is not the customer-facing Zepto application.

| Folder/file | Purpose | Current status | Used by | Safe to edit? | Notes |
|---|---|---|---|---|---|
| `docs/PROJECT_ROADMAP.md` | One project timeline | Active overview | Everyone | Yes, with review | Best starting point |
| `docs/project-bible/` | Product goal, research questions, hypotheses, decisions | Active source of truth | PM/research | Only through review | Some individual status labels remain historically inconsistent |
| `research/protocols/` | Rules for sources, quality, and insight acceptance | Approved research rules | Research team | Only through review | Prevents unsupported evidence |
| `research/taxonomies/` | Category and behavior definitions | Active | Intake and PM analysis | Only through review | Not Zepto’s official internal taxonomy |
| `research/templates/` | Header-only intake files and query pack | Active | Manual research | Copy locally; do not add real data here | Local imports belong in ignored folders |
| `apps/research-web/` | Internal research screens | Foundation complete | Internal PM/research users | Yes, in a scoped UI phase | Not the customer MVP |
| `services/research-api/` | Internal API | Foundation complete | Research web and database | Carefully | No authentication/deployment hardening yet |
| `services/research-worker/` | Collection, analysis, research intake, experiments | Active but hard to navigate | Internal workflows | Only in scoped phases | Main cleanup candidate |
| `services/research-worker/src/mvp-analysis.ts` | Approved simplified analysis | Approved | MVP analysis live command/tests | Carefully | Preferred graduation analysis path |
| `services/research-worker/src/pipeline.ts` | Original database worker pipeline | Legacy runtime, still active | Worker loop | No, without architecture review | Uses the older five-stage analysis |
| `services/research-worker/src/analysis-pipeline.ts` | LLM-heavy structured pipeline | Experimental, retained | Scale/reliability tests | No for MVP work | Reference only |
| `services/research-worker/src/category-evidence-intake.ts` | Validates category evidence and interviews | Active | `research:intake` | Carefully | Produces readiness report |
| `services/research-worker/src/free-research-discovery.ts` | Optional Search and approved Fetch workflow | Active | Discovery/fetch CLI | Carefully | Search candidates are not Evidence |
| `packages/research-contracts/` | Shared Zod data definitions | Active core | Web, API, worker, database boundaries | High risk | Contract changes affect multiple packages |
| `packages/shared-config/` | Safe environment loading | Active core | Backend and CLI | High risk | Secrets stay in ignored `.env` |
| `packages/research-database/` | PostgreSQL schema and migrations | Foundation complete | API and worker | Migration review required | Database is not needed for manual discovery |
| `packages/research-prompts/` | Original/versioned prompt definitions | Active plus historical | Original pipeline | Carefully | Simplified analysis also defines focused prompts locally |
| `docs/screenshots/` | Internal application references | Reference | Submission/demo | Yes, intentionally | Not product evidence |

## Current approved pipeline

```text
Collection
→ normalization
→ exact deduplication
→ local Evidence
→ AI taxonomy
→ batched classification
→ local Theme assembly
→ business synthesis
→ research readiness
```

Important distinction: the approved simplified analysis is implemented and validated, but the long-running database worker still uses the older pipeline. Integrating these paths is a future architecture decision, not a documentation cleanup.

## Experimental legacy pipeline

```text
LLM Evidence
→ Theme repair
→ hierarchical consolidation
→ multi-window Insight generation
```

This path is retained for engineering reference and offline regression coverage. It should not be used for the graduation MVP.

## Important commands

| Command | What it does | Network/provider behavior |
|---|---|---|
| `pnpm research:intake -- --input <csv> --report-only` | Validate reviewed CSV/interview research | Offline |
| `pnpm research:discover -- --query-pack <csv> --provider tinyfish --limit-queries 8 --report-only` | Find candidate URLs | TinyFish Search only when enabled |
| `pnpm research:fetch-approved -- --input <approval.csv> --provider tinyfish --report-only` | Extract exact human-approved URLs | TinyFish Fetch only when enabled |
| `pnpm test` | Run normal offline regression suite | No live providers |
| `pnpm test:scale` | Run synthetic scale tests | Offline |
| `pnpm typecheck` | Validate TypeScript contracts | Offline |
| `pnpm build` | Build applications and services | No research collection |

The root scripts forward arguments to the worker package. The shorter command examples in the tooling guide are also supported.

## Editing guidance

### Usually safe with review

- Roadmap and repository-map documentation.
- Header-only templates.
- Offline unit tests.
- Query-plan wording that does not invent evidence.

### Requires a scoped engineering phase

- Worker runtime files.
- Source adapters and URL access rules.
- AI providers or prompts.
- Shared contracts.
- Database migrations.
- API routes and frontend behavior.

### Never commit

- Root `.env`.
- API keys or database credentials.
- Local research imports.
- Discovery output.
- Intake output.
- Frozen live corpora unless a separate privacy and provenance review explicitly approves an artifact.

## What happens next

The next product task is targeted research collection, not a customer feature build:

1. Review candidate URLs manually.
2. Collect 24–32 genuine category-expansion records.
3. Run intake and readiness checks.
4. Expand only if context and provenance are strong.
5. Analyze the reviewed corpus.
6. Select the final customer MVP direction.
