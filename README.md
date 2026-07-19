# Zepto NextLeap — Review Discovery Engine

An internal PM research workspace for collecting permitted public discussions and turning them into traceable, human-reviewable behavioral evidence about category expansion. It is **Application 1** only; the Zepto consumer MVP is not part of this branch.

## What works in this vertical slice

- Create research projects and collection runs.
- Collect visibly public Zepto Google Play reviews when the supported page structure is available.
- Collect one public URL after public-address, robots, content-type, and size checks.
- Discover pages through Tavily when configured, then verify each underlying page before retention.
- Import manually captured public text as an explicitly labelled fallback.
- Normalize and deduplicate source text.
- Run five versioned Groq stages: relevance, atomic evidence extraction, behavioral coding, contradiction detection, and theme synthesis.
- Validate every AI response with Zod; reject excerpts absent from source text and themes that reference unknown evidence IDs.
- Inspect run state, source errors, AI lineage, evidence details, contradictions, themes, applicability, transfer rationale, and limitations.
- Import the approved CSV pilot only as a separate `Manual Pilot v1` dataset.

No source or analysis is faked when access, configuration, or validation fails.

## Architecture

```text
apps/research-web          Next.js 16 App Router research UI
services/research-api     Express API and review endpoints
services/research-worker  PostgreSQL polling worker, adapters, and pipeline
packages/research-contracts  Request, adapter, and AI output schemas
packages/research-prompts    Versioned Groq prompts and JSON schemas
packages/research-database   Drizzle schema, connection, and migrations
packages/shared-config       Validated server configuration
```

PostgreSQL is both the system of record and the small run queue. Drizzle was chosen over Prisma for explicit, lightweight SQL control across eight research tables. Redis, Kafka, a vector database, authentication, and a generic agent framework are intentionally absent.

## Local setup

Requirements: Node.js 20.9+, pnpm 11, and PostgreSQL 16. Docker Compose is optional but convenient.

1. Copy `.env.example` to `.env` and keep it uncommitted.
2. Start PostgreSQL:

   ```sh
   docker compose up -d postgres
   ```

   If Docker is unavailable, provide any PostgreSQL 16-compatible `DATABASE_URL`.

3. Install and migrate:

   ```sh
   pnpm install --frozen-lockfile
   pnpm db:migrate
   ```

4. Optional: import the approved manual pilot without AI re-analysis:

   ```sh
   pnpm pilot:import
   ```

5. Start frontend, API, and worker:

   ```sh
   pnpm dev
   ```

6. Open `http://localhost:3000`, create or select a project, choose a source, confirm the public-access and platform-terms check, and select **Collect reviews**.

The API listens on port `4000`. A run without `GROQ_API_KEY` truthfully ends as `partially_completed` after source collection and can be retried as a new run after configuration.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection for API and worker |
| `NEXT_PUBLIC_API_BASE_URL` | Yes in deployed UI | Browser-visible API origin |
| `CORS_ORIGIN` | Yes in deployment | Allowed frontend origin(s) |
| `GROQ_API_KEY` | For AI stages | Never exposed to the frontend |
| `GROQ_MODEL` | No | Defaults to a strict structured-output model |
| `TAVILY_API_KEY` | No | Enables optional public-web discovery |
| `SOURCE_FETCH_USER_AGENT` | Before deployment | Identifies the bounded research collector |
| `MAX_SOURCE_BYTES` | No | Response size ceiling |
| `MAX_NORMALIZED_CHARACTERS` | No | Stored analysis-context ceiling |

See `.env.example` for the complete list. Never commit `.env` files or credentials.

## Supported source behavior

| Source | Current behavior | Known limitation |
| --- | --- | --- |
| Google Play | Reads only visibly rendered review bodies from Zepto or an entered package ID | The public app shell may be fetched up to 8 MB, but only minimal review bodies are retained; markup is brittle and returns `SOURCE_STRUCTURE_UNSUPPORTED` instead of sample data when unavailable |
| Public URL | Checks public DNS, robots, response type, size, and readable context | Does not execute client-side JavaScript; login-gated or JS-only pages should use policy-reviewed manual import |
| Tavily | Discovers candidate URLs, then fetches and verifies underlying public pages | Disabled without a key; discovery snippets alone are never evidence |
| Manual text | Stores supplied minimal public context with manual provenance | Researcher remains responsible for accessibility, copyright, and source-link review |

Reddit, Apple App Store, Trustpilot, forums, and other sources remain future adapters. No private, paywalled, authenticated, sensitive, CAPTCHA-bypassed, or rate-limit-evading collection is implemented.

## Quality checks

```sh
pnpm typecheck
pnpm test
pnpm build
```

Tests cover normalization/deduplication, structured-output rejection, and theme-to-evidence traceability. Real Groq calls are not mocked into runtime behavior; a key is required for live analysis.

## Deployment targets

- Deploy `apps/research-web` to Vercel with `NEXT_PUBLIC_API_BASE_URL`.
- Deploy `services/research-api` and `services/research-worker` as separate Railway or Render services.
- Attach both services to one managed PostgreSQL database.
- Run `pnpm db:migrate` as a release step.

No provider-specific project link, credentials, or deployment state is committed.

## Current limitations

- This public-research corpus cannot establish population prevalence or verify Monthly Active Customer status.
- Category-general evidence is contextual and cannot be presented as Zepto-user behavior.
- Source parsing and platform permission rules require ongoing review.
- Normalized source context is capped at 20,000 characters and retained in PostgreSQL for pipeline inspection; production retention and deletion timing still require a human policy decision.
- Retry creates a new run and preserves the failed attempt rather than mutating its lineage.
- Authentication and multi-user access control are intentionally out of scope for this slice.
