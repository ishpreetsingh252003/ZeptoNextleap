# Zepto NextLeap — Review Discovery Engine

An internal PM research workspace for collecting permitted public discussions and turning them into traceable, human-reviewable behavioral evidence about category expansion. This repository contains **Application 1** only. The Zepto customer MVP will be built separately after research synthesis and opportunity approval.

## Current Phase 1 foundation

- Next.js research workspace, Express API, PostgreSQL polling worker, and Drizzle database layer.
- Manual text, public URL, Google Play public-page, and optional Tavily adapters.
- Five provider-independent AI stages: relevance, evidence extraction, behavioral coding, contradiction detection, and theme synthesis.
- Gemini is the primary configured provider; Groq remains an explicitly selected optional provider.
- No automatic provider fallback. A run uses only `AI_PROVIDER` and reports a configuration error when that provider is unavailable.
- Zod remains the final structured-output validator. Exact-excerpt and theme-traceability validation remain provider-independent.
- Analysis lineage records provider, model, prompt version, stage, status, and a simple attempt count.

Phase 1 proves static architecture, tests, type safety, and buildability. It does **not** prove a live Gemini call, live Groq call, PostgreSQL connectivity, or the complete end-to-end pipeline.

## Architecture

```text
apps/research-web             Next.js App Router research UI
services/research-api        Express API and review endpoints
services/research-worker     PostgreSQL worker, adapters, and AI pipeline
packages/research-contracts  Request and AI-output Zod schemas
packages/research-prompts    Versioned provider-neutral prompts
packages/research-database   Drizzle schema, connection, and migrations
packages/shared-config       Root .env loading and validated configuration
```

PostgreSQL is the system of record and the small run queue. Redis, Kafka, a vector database, authentication, and a generic agent framework remain intentionally absent.

## Local environment loading

Backend commands find the repository by walking upward to `pnpm-workspace.yaml`, then load:

```text
<repository-root>/.env
```

Precedence is:

1. Hosting or process environment variables
2. Missing values filled from the root `.env` for local development
3. Non-secret defaults in the validation schema

The root `.env` never overwrites a value already supplied by the process and remains gitignored. API startup, worker startup, Drizzle commands, and lazy database initialization all use the same loader. Production hosting can inject variables normally without creating an `.env` file.

Next.js handles `NEXT_PUBLIC_API_BASE_URL` through its normal frontend environment behavior. The client defaults to `http://localhost:4000`; a local override can use `apps/research-web/.env.local`, and hosting should inject the public value. Never put database URLs, AI keys, discovery keys, or tokens in a variable beginning with `NEXT_PUBLIC_`.

## Create the root `.env`

Copy `.env.example` to `.env` at the repository root. Do not commit it.

Always configure:

```env
DATABASE_URL=
AI_PROVIDER=gemini
```

For Gemini:

```env
GEMINI_API_KEY=
GEMINI_MODEL=
```

For explicitly selected Groq instead:

```env
AI_PROVIDER=groq
GROQ_API_KEY=
GROQ_MODEL=
```

Gemini variables are not required when Groq is selected, and Groq variables are not required when Gemini is selected. No automatic fallback occurs.

Optional variables:

```env
TAVILY_API_KEY=
FIRECRAWL_API_KEY=
APIFY_API_TOKEN=
APIFY_GOOGLE_PLAY_ACTOR_ID=
```

Tavily is implemented but optional. Firecrawl and Apify are documentation placeholders only; no Phase 1 adapter uses them.

## Environment reference

| Variable | Required when | Used by | Secret/public | Default |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | All backend database operations | API, worker, Drizzle, pilot import | Secret | None |
| `AI_PROVIDER` | Backend AI analysis | API health, worker | Non-secret | `gemini` |
| `GEMINI_API_KEY` | `AI_PROVIDER=gemini` | Worker | Secret | None |
| `GEMINI_MODEL` | `AI_PROVIDER=gemini` | Worker | Non-secret | None |
| `GROQ_API_KEY` | `AI_PROVIDER=groq` | Worker | Secret | None |
| `GROQ_MODEL` | `AI_PROVIDER=groq` | Worker | Non-secret | None |
| `TAVILY_API_KEY` | Optional Tavily discovery | Worker | Secret | None |
| `FIRECRAWL_API_KEY` | Future integration only | None in Phase 1 | Secret | None |
| `APIFY_API_TOKEN` | Future integration only | None in Phase 1 | Secret | None |
| `APIFY_GOOGLE_PLAY_ACTOR_ID` | Future integration only | None in Phase 1 | Non-secret identifier | None |
| `NEXT_PUBLIC_API_BASE_URL` | Deployed frontend | Browser/frontend | Public | `http://localhost:4000` in client code |
| `API_PORT` | Optional override | API | Non-secret | `4000` |
| `CORS_ORIGIN` | Optional local; required deployment review | API | Public origin | `http://localhost:3000` |
| `WORKER_POLL_INTERVAL_MS` | Optional override | Worker | Non-secret | `3000` |
| `SOURCE_FETCH_USER_AGENT` | Deployment identification | Worker adapters | Public | `ZeptoNextLeapResearch/0.1` |
| `MAX_SOURCE_BYTES` | Optional override | Worker adapters | Non-secret | `1000000` |
| `MAX_NORMALIZED_CHARACTERS` | Optional override | Worker | Non-secret | `60000` |

## Local commands

Requirements: Node.js 20.9+, pnpm 11, and a PostgreSQL 16-compatible database for later live phases.

```sh
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:migrate
pnpm dev
```

`pnpm db:generate` is a static schema-consistency command. `pnpm db:migrate`, API startup, worker startup, and pilot import require a reachable `DATABASE_URL`. Phase 1 does not connect to a real database.

Quality checks:

```sh
pnpm test
pnpm typecheck
pnpm build
```

## Provider behavior

The worker creates one provider instance per run through a provider factory and uses it for all five stages. The pipeline sees only the shared provider contract; Gemini and Groq SDK types remain inside their adapters.

Both providers:

- request structured JSON;
- make at most two attempts;
- add a concise correction instruction on the second attempt;
- validate returned JSON through the existing Zod schema;
- avoid logging raw model responses that may contain source text;
- fail without fabricating output.

Gemini supports a subset of JSON Schema. Its adapter removes unsupported string-length/pattern constraints, removes unsupported string formats, and converts simple nullable `anyOf` schemas into a supported type union before calling the official `@google/genai` SDK. Zod still enforces the full contract after the response. Schema compatibility must be verified with a live request in a later phase.

## Supported sources

| Source | Current behavior | Known limitation |
| --- | --- | --- |
| Google Play | Reads visibly rendered public review bodies from the supported page structure | Markup is brittle and may return `SOURCE_STRUCTURE_UNSUPPORTED` |
| Public URL | Checks public DNS, robots, response type, size, and readable context | Does not execute client-side JavaScript |
| Tavily | Discovers candidates, then fetches and verifies underlying public pages | Disabled without a key; snippets alone are never evidence |
| Manual text | Stores supplied minimal context with manual provenance | Researcher remains responsible for public accessibility and source traceability |

Firecrawl and Apify are not implemented. No private, paywalled, authenticated, sensitive, CAPTCHA-bypassed, or rate-limit-evading collection is supported.

## Deployment status

No deployment is configured or started in Phase 1. Vercel, Railway, and Render remain future targets after live database and AI validation.

## Current limitations

- No provider has been called live through the refactored interface.
- PostgreSQL and the full pipeline have not been validated end to end.
- Public research cannot establish population prevalence or verify Monthly Active Customer status.
- Category-general evidence cannot be presented as direct Zepto-user behavior.
- Human review states exist in the API and database, but review controls are not yet implemented in the frontend.
- Production retention, authentication, stale-run recovery, source retries, and transaction redesign remain out of scope.
