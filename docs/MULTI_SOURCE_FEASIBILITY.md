# Multi-Source Feasibility

## Status

Draft implementation review for `feat/multi-source-research-coverage`.

## Decision rule

Public visibility alone does not authorize automated collection. A source is automated only when the access method is technically bounded, does not require bypassing controls, and has an acceptable documented access basis. Unclear sources remain conditional or manual-only.

## Feasibility matrix

| Source | Research value | Access and credentials | Pagination and metadata | Compliance risk | Recommendation | Implemented status |
|---|---|---|---|---|---|---|
| Google Play | Direct Zepto app feedback about ordering, delivery, payment, support, quality, and application behavior | Existing `google-play-scraper` integration; no credential is used. This is not a Google-owned customer-review API and must remain subject to review. | Bounded continuation-token pagination; newest-first; rating, date, locale, package ID, and canonical app URL. Stops on count/date boundary, missing token, or repeated token. | Automated access depends on a third-party library and must respect platform behavior and low request volume. Coverage is bounded and cannot be called complete historical coverage. | **Supported with constraints** | Existing adapter retained; no live recollection in this phase. |
| Apple App Store | Direct iOS Zepto feedback, app-version signals, ratings, and territory-specific experience | Apple’s authenticated Customer Reviews API requires App Store Connect access and describes reviews for “your app.” The project does not control Zepto’s developer account. Public RSS implementations exist, including in GaanaNextleap, but current Apple service/site terms restrict automated scraping and analysis. | App Store Connect supports pagination and review metadata for authorized apps. Third-party public RSS coverage and durability are not guaranteed. | Using Zepto App Store Connect without authorization is not possible. A public-feed scraper is not justified here solely because another project used one. | **Manual/CSV-only** | No automated adapter. App Store exports can enter through CSV with country, rating, date, title, version, and source URL when supplied. |
| Reddit | Rich context about workarounds, channel switching, perceived risk, trust, and outcomes | Automated collection must use Reddit’s official OAuth Data API with approved credentials and a permitted use case. No approved credentials are currently configured. Unauthenticated `.json` scraping from GaanaNextleap is intentionally not reused. | Official API supports bounded listings/search and pagination. Posts may provide date, community, score, and permalink; ratings are not applicable. Scores are not prevalence. | Reddit Data API terms govern both API and other automated access. AI use must be compatible with the approved access and data terms. | **Conditional** | Automated adapter disabled with a clear configuration error. Specific public URLs may use the curated-URL boundary only when robots/access checks permit; CSV is supported. |
| Quora | Long-form consideration, trust, comparison, and workaround discussions | No approved official collection API is configured. Login, bot protection, or robots restrictions must not be bypassed. | No reliable bounded automated pagination is approved. Dates and canonical URLs may be available on individual pages. Ratings usually do not apply. | Generic scraping is high-risk and technically brittle. | **Manual-only** | Automated adapter disabled. Explicit permitted URLs or CSV imports only. |
| Public forums and articles | Category-specific discussions, comparisons, information needs, and contextual evidence | User supplies an explicit allowlisted set of public HTTP(S) URLs and a source label. Existing public-page collection enforces DNS/private-address, redirects, robots, type, and byte limits. Firecrawl may be used only for an explicitly supplied permitted URL when configured. | One URL produces at most one document. The adapter never discovers links or crawls a domain. Title, canonical URL, and collection timestamp are retained; publication date remains missing when unavailable. | Each site has its own terms and robots policy. Login-only, private, disallowed, or inaccessible pages fail clearly. | **Conditional** | Curated public URL adapter implemented with URL deduplication and hard page bounds. |
| CSV/manual import | App Store exports, approved Reddit/forum research, partner exports, and user-curated public evidence | User-supplied data; no source credential is stored. The user remains responsible for public accessibility, reuse permission, and provenance. | No network pagination. Rows can include source, external ID, title, text, rating, date, source URL, locale, and country. Unsupported values remain absent rather than becoming zero or neutral. | Risk depends on the supplied dataset. Private, sensitive, or unlicensed data must not be imported. Spreadsheet formula-leading fields are rejected. | **Supported** | Product-grade CSV adapter implemented with deterministic IDs and row-level diagnostics. Manual text remains supported. |

## Source contract

All enabled adapters emit `PublicDocument` with:

- `externalId`: stable source identity; this serves as the normalized document ID
- `sourceType`: ingestion mechanism
- `sourceName`: human-readable originating platform or declared source
- title and publication date when available
- normalized text
- canonical source URL, or an explicit `manual://csv-import/...` marker when a CSV row has no URL
- collection timestamp
- bounded metadata for rating, locale, country, package ID, app version, score, source label, and source-URL availability

Missing rating/date values stay missing. They are never converted to a neutral rating, zero, or an inferred date. Provider response objects and credentials are not part of the contract.

## Collection boundaries

- Curated URL ingestion accepts only the exact submitted HTTP(S) URLs.
- URL fragments are removed and duplicate canonical URLs are collected once.
- No seed-URL crawling, link traversal, login use, CAPTCHA bypass, or private/local address access is permitted.
- Automated Reddit, App Store, and Quora source types return explicit disabled/manual-only errors.
- Near-duplicate candidates remain in the corpus; only exact normalized-text duplicates are removed.

## Primary references reviewed

- Apple App Store Connect API overview: https://developer.apple.com/app-store-connect/api/
- Apple customer-review API documentation: https://developer.apple.com/documentation/appstoreconnectapi/customer-reviews
- Apple App Store Connect API access setup: https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api
- Apple Media Services terms: https://www.apple.com/legal/internet-services/itunes/ai/terms.html
- Apple website terms: https://www.apple.com/legal/internet-services/terms/site.html
- Reddit Data API terms: https://redditinc.com/policies/data-api-terms

These references establish technical/access constraints for this project; this document is not legal advice.
