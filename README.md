Link to review engine app - https://vercel.com/ishpreet-singh-s-projects/zepto-nextleap-research-web/9YbHM2sjMq3wy2Ew979kxxuchiQ2
link to mvp - https://zeptonext.lovable.app/

# Zepto NextLeap — Research Command Center

A deterministic behavioral-research workspace for category expansion at Zepto. It collects public
consumer conversations into a human-reviewed evidence corpus, then runs a **deterministic**
discovery pipeline that turns that evidence into a ranked, recommendation-ready decision report.

The current application is a single Next.js app (UI + API route handlers) backed by the research
engine modules in `services/research-worker` and the CSV/JSON corpus under `research/`.

No AI inference, no live provider calls, no scraping, and no database writes happen in the running
pipeline. Every score is computed by a deterministic engine over human-reviewed records.

## The product pipeline

Five stages, each with its own page:

| Stage | Route | What it does |
| --- | --- | --- |
| 1. Discovery | `/discovery` | Configure a company/country/date range, then execute the real pipeline (SSE) against the corpus |
| 2. Reviews | `/reviews` | Browse and filter the reviewed evidence corpus with full source traceability |
| 3. Insights | `/insights` | Recurring behavioral themes, theories, and knowledge-base connections grounded in the evidence |
| 4. Opportunities | `/opportunities` | Ranked category-expansion opportunities scored by the deterministic scoring engine |
| 5. Recommendation | `/recommendation` | The final MVP recommendation presented to leadership |

The Dashboard (`/`) is the command center: latest discovery run, reviews collected, sources
connected, opportunities found, the current recommendation, and recent activity.

## Repository layout

```text
apps/research-web             Next.js 16 App Router app (UI + API route handlers)
services/research-worker      Research engine modules + worker tooling (builds to dist/)
services/research-api         Legacy Express + PostgreSQL /v1 API — superseded, not consumed by the UI
packages/research-contracts   Zod contracts (legacy AI pipeline layer)
packages/research-prompts     Versioned prompts (legacy AI pipeline layer)
packages/research-database    Drizzle schema + migrations (legacy AI pipeline layer)
packages/shared-config        Root .env loading + repository-root resolution
research/                     Evidence corpus, templates, behavior knowledge, pipeline outputs
```

The legacy Express/PostgreSQL `/v1/*` surface (`services/research-api`) and its AI/Postgres packages
remain in the monorepo from the earlier phase but are **not** used by the current product. The web
app reads the corpus and writes run outputs directly as files.

## The corpus

Inputs (tracked):

- `research/pilot/evidence-items.csv` — reviewed evidence items
- `research/pilot/source-log.csv` — source metadata for traceability
- `research/templates/category-research-query-pack.csv` — research query pack
- `research/behavior/*.csv` — curated behavioral knowledge (theories, commerce insights, case studies, papers)

Outputs (git-ignored, written per run):

- `research/discovery-output/<runId>-{candidates,prioritized}.csv`
- `research/opportunity-output/<runId>-{reviewed-evidence.csv,opportunities.json}`
- `apps/research-web/data/runs/<runId>/run.json` and `synthesis.json`

The app resolves these paths from the repository root (via `@zepto/shared-config`), with a fallback
to files bundled in `apps/research-web/data/` so the UI can render even outside the monorepo.

## Quick start

Requirements: Node.js ≥ 20.9, pnpm 11.

```sh
pnpm install --frozen-lockfile
pnpm --dir apps/research-web dev
```

Open http://localhost:3000. The `postinstall` script builds `services/research-worker` to `dist/`,
which the web app imports at runtime. No database, queue, or external API is required.

## Verification

```sh
pnpm typecheck                 # all workspaces
pnpm test                      # unit suites (worker: 248 tests)
pnpm --dir apps/research-web build   # worker build + production Next.js build
```

`pnpm build` from the web app first builds the worker `dist/` (see `apps/research-web/package.json`)
and then runs `next build`. The worker's live/integration suites (`test:db`, `test:gemini`,
`test:firecrawl`, `test:google-play`) require external credentials and are excluded from `pnpm test`.

## Deployment

The web app is deployable as a standard Next.js serverless app (e.g. Vercel). Two things matter:

- `postinstall` builds `services/research-worker` to `dist/` so route handlers can import its modules.
- `next.config.ts` uses `transpilePackages: ["@zepto/research-worker"]` and
  `serverExternalPackages: ["csv-parse"]`.

The corpus and per-run outputs live on the server filesystem, so read/write paths must be resolvable
at runtime (the repo-root resolution in `packages/shared-config` handles a monorepo checkout).

## Boundaries

- **No authentication** — the research workspace is internal tooling.
- **No PostgreSQL/Redis/queues** in the product path — the earlier AI/Postgres layer is legacy.
- **No fabricated evidence** — empty states and pipelines never invent results; outputs are only
  produced from reviewed, validated records.

See `ARCHITECTURE.md` for the detailed data flow and module map.
