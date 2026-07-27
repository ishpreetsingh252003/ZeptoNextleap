# Free Research Tooling

Status: Draft; awaiting human review; optional provider integration disabled by default
Owner: Product research lead
Version: v1
Last reviewed: 2026-07-27
Purpose: Define a zero-cost, human-gated discovery workflow for the initial category-expansion pilot.

## Policy

The research source of truth remains the reviewed CSV/manual intake workflow. Discovery results and fetched pages are candidates, not evidence. A person must approve an exact URL before optional extraction, and fetched content must pass the existing provenance, relevance, and readiness checks.

The initial pilot target is an operational planning assumption: 24–32 retained records, roughly 3–4 per category, across at least three genuine source types. It is not a statistical sufficiency claim.

| Method | Support | Role |
|---|---|---|
| Manual web search | Supported; default fallback | Find public candidates and record them manually |
| CSV/manual intake | Supported; source of truth | Preserve reviewed evidence and provenance |
| Curated public URLs | Supported | Human supplies an exact permitted URL |
| TinyFish Search | Optional; disabled by default | Free candidate discovery only |
| TinyFish Fetch | Optional; disabled by default | Extract one or more explicitly approved URLs, within the run cap |
| TinyFish Agent / Browser | Excluded | Not configured or called |
| Providers that may charge | Disabled by default; not required | Outside this workflow |

TinyFish currently documents Search and Fetch as free, while Agent and Browser use credits. Pricing, quotas, access conditions, and APIs can change; verify the [official documentation](https://docs.tinyfish.ai/) and [pricing page](https://www.tinyfish.ai/pricing) before each pilot.

## Configuration

```env
TINYFISH_API_KEY=
TINYFISH_SEARCH_ENABLED=false
TINYFISH_FETCH_ENABLED=false
TINYFISH_SEARCH_MAX_RESULTS=5
TINYFISH_MAX_SEARCH_REQUESTS_PER_RUN=10
TINYFISH_FETCH_MAX_URLS_PER_RUN=10
TINYFISH_REQUEST_TIMEOUT_MS=30000
TINYFISH_MAX_RETRIES=1
```

No key is required while both features are disabled. Enabling Search or Fetch without a key fails that command clearly and does not affect manual intake. The 30-second timeout is a conservative pilot setting; the provider notes that slow Fetch requests may need a longer client timeout. Change it only within the validated environment range.

## Discovery workflow

Report candidates without writing files:

```sh
pnpm research:discover --query-pack research/templates/category-research-query-pack.csv --provider tinyfish --limit-queries 8 --report-only
```

Optional local output:

```sh
pnpm research:discover --query-pack research/templates/category-research-query-pack.csv --provider tinyfish --limit-queries 8 --output research/discovery-output/pilot-candidates.csv
```

Search returns only URL, title, snippet, source, category, query, and query ID. It never fetches pages, creates Evidence, evaluates readiness, or calls an AI provider. Invalid, local, and private-address URLs are rejected; tracking-parameter variants are normalized before duplicate removal. The output directory is Git-ignored.

## Human approval and Fetch

Copy reviewed candidates into `research/templates/research-url-approval.csv`, then place the working copy under the Git-ignored `research/imports/` directory. Only the exact lowercase value `true` in `approved` authorizes Fetch.

Report-only:

```sh
pnpm research:fetch-approved --input research/imports/research-url-approval.csv --provider tinyfish --report-only
```

Optional local normalized output:

```sh
pnpm research:fetch-approved --input research/imports/research-url-approval.csv --provider tinyfish --output research/intake-output/fetched-category-evidence.json
```

Fetch submits at most 10 approved explicit URLs per run by default. It requests markdown with links and image links disabled. It does not crawl, follow links, log in, submit forms, solve CAPTCHAs, bypass access controls, or invoke Agent/Browser. Accepted pages become `PublicDocument` records and pass schema, provenance, relevance, and readiness reporting. A fetched page is still not approved evidence until human review is complete.

## Source restrictions

- Reddit: Search candidates may be reported. Automated Fetch is blocked unless a future review establishes approved public access that does not rely on unauthenticated JSON or circumvention.
- Apple App Store: use manual CSV/export unless a separately reviewed, permitted public URL workflow is approved.
- Quora: manual collection or an explicitly permitted and human-approved URL only.
- Trustpilot, public forums, comparison sites, blogs, and articles: exact approved public URLs only; obey site terms, robots policy, copyright limits, and the existing source policy.
- Private, login-gated, paywalled, sensitive, personal, anti-bot-protected, or access-controlled material remains excluded.

## Manual fallback

If TinyFish is unavailable, disabled, rate-limited, no longer free, or unsuitable:

1. Run 8 reviewed queries manually from `research/templates/category-research-query-pack.csv`.
2. Record candidate URLs and source context in a local working sheet.
3. Review public accessibility and source policy.
4. Copy only approved evidence into the existing header-only category evidence or interview template.
5. Run `pnpm research:intake` in report-only mode before keeping any output.

No provider account, scheduled job, queue, database state, live collection, or AI call is required for this fallback.
