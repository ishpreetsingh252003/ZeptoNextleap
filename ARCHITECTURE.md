# Architecture

The product is a single Next.js app. Route handlers execute a **deterministic** discovery pipeline
over a file-based corpus and return data to React pages. The research engine lives in
`services/research-worker` and is imported directly (source + `dist/`) by the Next.js server.

## High-level flow

```text
                 +-----------------------------------------------+
                 |                apps/research-web               |
   browser       |   React pages (client)   <->   Route handlers  |
   -------->     |   /dashboard /discovery /reviews /insights     |
                 |   /opportunities /recommendation               |
                 +----------------------+-------------------------+
                                        |
                                        |  imports
                 +----------------------v-------------------------+
                 |            services/research-worker            |
                 |  research/candidate-prioritization (src)       |
                 |  research/scoring/*            (dist)          |
                 +----------------------+-------------------------+
                                        |
                 +----------------------v-------------------------+
                 |                 research/  corpus              |
                 |  pilot/*.csv  templates/*.csv  behavior/*.csv  |
                 |  discovery-output/   opportunity-output/       |
                 +-----------------------------------------------+
```

Run history and synthesis payloads are written to `apps/research-web/data/runs/<runId>/`.

## Data flow by stage

1. **Discovery** — `POST /api/discovery/run` streams Server-Sent Events
   (`/apps/research-web/src/app/api/discovery/run/route.ts`). Each event drives a stage in the
   `DiscoveryWorkspace` UI: `preparing → searching → collecting → scoring → opportunities →
   finalizing`. The handler calls `runPipeline()` in `src/lib/pipeline.ts`, which:

   - loads the corpus (`evidence-items.csv`, `source-log.csv`, query pack) via `src/lib/repo-paths.ts`;
   - filters evidence by the configured source selection;
   - writes candidate CSV and runs **candidate prioritization** (worker `src/research/candidate-prioritization.ts`);
   - builds the reviewed-evidence matrix (`src/lib/behavior-mapping.ts` derives themes from
     behavioral codes) and runs **opportunity scoring** (worker `dist/research/scoring/core`);
   - writes synthesis via `src/lib/synthesis.ts`, records the run via `src/lib/run-history.ts`,
     and emits the final `RunResult` payload.

2. **Reviews** — `GET /api/reviews` (with `query`/`category`/`source`/`sentiment` filters) merges
   the reviewed evidence corpus with discovery-generated candidates (`-prioritized.csv`) and returns
   traceable records with source links.

3. **Insights** — `GET /api/insights` builds the intelligence report (`src/lib/synthesis.ts`):
   executive summary, top behavioral themes, and the behavior-knowledge base sections.

4. **Opportunities** — `GET /api/opportunities` maps the scored output through
   `src/lib/opportunities.ts` (`toOpportunity`, `supportingThemes`, `scoredReportSummary`).
   `GET /api/opportunities/[id]` serves the detail page.

5. **Recommendation** — `GET /api/recommendation` derives the hero MVP, weighted decision scores,
   comparison, assumptions, and outlook deterministically from the scored opportunities. Returns 404
   (rendered as an empty state) when no scored data exists yet.

6. **Dashboard** — `GET /api/history` (run manifests), `GET /api/discovery/status` (corpus counts +
   generated outputs), plus `/api/reviews`, `/api/insights`, `/api/opportunities`,
   `/api/recommendation` are fetched in parallel by the command-center page.

Guarded download: `GET /api/outputs?path=...` serves generated artifacts by relative repo path with
traversal protection.

## Module reuse

- `apps/research-web` imports worker **source** modules
  (`@zepto/research-worker/src/research/candidate-prioritization`) and **built** modules
  (`@zepto/research-worker/dist/research/scoring/*`).
- `postinstall` and the web `build` script compile the worker (`tsc -p tsconfig.build.json`) so
  `dist/` exists before Next builds.
- `packages/shared-config` provides `findRepositoryRoot()` — walking up to `pnpm-workspace.yaml` —
  which `src/lib/repo-paths.ts` uses to resolve `research/...` files at the repo root, falling back
  to `apps/research-web/data/`.

## Key modules in `apps/research-web/src/lib`

| Module | Responsibility |
| --- | --- |
| `pipeline.ts` | Orchestrates a discovery run; emits SSE `PipelineEvent`s; writes run artifacts |
| `repo-paths.ts` / `data-paths.ts` | Resolve corpus and output paths (repo root + bundled fallback) |
| `behavior-mapping.ts` | Maps behavioral codes to themes/relevance tags and opportunity titles |
| `opportunities.ts` | Loads, maps, and scores opportunities; report summaries |
| `synthesis.ts` | Builds the insights/synthesis payload from corpus + knowledge files |
| `run-history.ts` | Records and lists run manifests; latest run + synthesis lookup |
| `api.ts` | Shared client types + helpers consumed by UI pages |

## Frontend conventions

- Pages are thin route components (`page.tsx`) wrapping client components in `src/app/*/`.
- Shared UI lives in `src/components/ui.tsx` (`EmptyState`, `Metric`, `StatusBadge`, `GlassCard`,
  `SkeletonRows`, `MetricsSkeleton`, `SectionHeader`) with Stitch-style tokens in `globals.css`.
- Responsive breakpoints: 1000px (stack main grids), 760px (collapsible sidebar), 480px (single-column).
- Accessibility: `:focus-visible` outlines, `aria-label` on icon-only inputs, `scope="col"` on
  tables, and `prefers-reduced-motion` support.

## Boundaries

The product deliberately avoids: authentication, PostgreSQL/Redis/queues, AI inference, live scraping,
and fabricated outputs. All results derive from the human-reviewed evidence corpus and the
deterministic scoring engine. The legacy Express `/v1` API, Drizzle schema, prompts, and AI adapters
in `services/` and `packages/` are not part of the product path.
