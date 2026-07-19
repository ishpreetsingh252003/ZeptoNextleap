# Manual Pilot First-Batch Review

- **Status:** First batch complete — Awaiting pilot review
- **Owner:** Research Lead
- **Version:** 1.0
- **Last reviewed:** 2026-07-19
- **Purpose:** Review the first nine candidate public sources and decide whether the manual pilot should continue, revise, or stop.

## Scope reminder

This review evaluates research process quality, not customer prevalence. It does not create an insight, change a hypothesis, or authorize a PDD, opportunity, PRD, product idea, automated collector, or implementation.

## Batch totals

| Measure | Count |
|---|---:|
| Candidate sources reviewed | 9 |
| Sources with retained evidence | 7 |
| Evidence items retained | 10 |
| Sources excluded | 2 |
| Opposing, mixed, or boundary evidence items | 4 |

The full-pilot ranges remain operational assumptions, not statistical sufficiency thresholds. This first batch stopped within the approved 8–10-source range.

## Candidate source list

| Source ID | Platform | Source type | Category coverage | Disposition |
|---|---|---|---|---|
| S001 | Google Play | App-store review | Cross-category | Retained |
| S002 | Reddit | Public community thread | Cross-category | Excluded |
| S003 | Reddit | Public community thread | Baby care | Retained |
| S004 | Reddit | Public community thread | Cross-category / Other | Retained selectively |
| S005 | Reddit | Public community thread | Personal care | Retained |
| S006 | Reddit | Public community thread | Personal care | Excluded |
| S007 | Apple App Store | App-store review | Other / Home and kitchen | Retained |
| S008 | Reddit | Public community thread | Health and wellness | Retained |
| S009 | Trustpilot | Consumer-review platform | Health and wellness / Fresh produce / Personal care | Retained selectively |

Canonical URLs and policy decisions are recorded in `source-log.csv`.

## Retained evidence items

| Evidence ID | Source ID | Category | Recorded behavior | Applicability | Valence |
|---|---|---|---|---|---|
| E001 | S001 | Cross-category | Cart limits prevented ordering certain items | Zepto-direct | Boundary case |
| E002 | S003 | Baby care | Diaper purchase problem followed by stated future avoidance | Zepto-direct | Confirming |
| E003 | S004 | Other / Cross-category | Grocery avoidance alongside rare urgent non-grocery use | Quick-commerce transferable | Boundary case |
| E004 | S005 | Personal care | Authenticity concern prompted consideration of a brand website | Quick-commerce transferable | Confirming |
| E005 | S005 | Personal care | Other purchasers reported successful skincare outcomes | Quick-commerce transferable | Opposing |
| E006 | S007 | Other / Home and kitchen | Failed replacement followed by platform switch | Zepto-direct | Confirming |
| E007 | S008 | Health and wellness | First-time buyer sought assurance before a discounted purchase | Zepto-direct | Mixed |
| E008 | S009 | Health and wellness | Brand-site comparison followed a disputed product purchase | Zepto-direct | Confirming |
| E009 | S009 | Fresh produce | Explicit first category purchase followed by future avoidance | Zepto-direct | Confirming |
| E010 | S009 | Personal care | Perceived safety problem followed by app abandonment | Zepto-direct | Confirming |

These are evidence records, not accepted behavioral insights. Full paraphrases, excerpts, transfer limits, and caveats are in `evidence-items.csv`.

## Excluded sources and reasons

| Source ID | Reason |
|---|---|
| S002 | Generic sort/filter friction lacked a category-expansion decision or outcome. |
| S006 | Duplicated the richer S005 skincare discussion and contained mostly shallow opinions. |

## Source-type distribution

| Source type | Retained evidence items | Share |
|---|---:|---:|
| Public community thread | 5 | 50% |
| Consumer-review platform | 3 | 30% |
| App-store review | 2 | 20% |

## Platform distribution

| Platform | Retained evidence items | Share |
|---|---:|---:|
| Reddit | 5 | 50% |
| Trustpilot | 3 | 30% |
| Google Play | 1 | 10% |
| Apple App Store | 1 | 10% |

Reddit is exactly at the approved 50% ceiling. A next batch should prioritize non-Reddit public sources.

## Category distribution

| Category group | Retained evidence items |
|---|---:|
| Cross-category | 1 |
| Baby care | 1 |
| Other / boundary categories | 2 |
| Personal care | 3 |
| Health and wellness | 2 |
| Fresh produce | 1 |

Six research category groups are represented. “Other” entries are boundary cases and do not change the approved taxonomy.

## Applicability distribution

| Applicability | Retained evidence items |
|---|---:|
| Zepto-direct | 7 |
| Quick-commerce transferable | 3 |
| Category-general contextual | 0 |

Quick-commerce-transferable items are labeled as non-Zepto behavior. No category-general evidence is presented as direct Zepto-user behavior.

## Contradictory or boundary cases

Four items are tagged opposing, mixed, or boundary:

- E001: relevant purchase friction, but category state is unknown.
- E003: urgent non-grocery quick-commerce use alongside grocery avoidance.
- E005: successful skincare-purchase reports oppose authenticity concern in the same thread.
- E007: a first-time buyer's caution is accompanied by both positive and negative community accounts.

The full-pilot target of at least five such cases has not yet been evaluated because collection stopped after the first batch.

## Research-quality issues

### Relevance

Search results were dominated by delivery, refund, support, seller, and generic product complaints. The category-level retention rule removed some noise, but additional query precision is needed.

### Duplication

Skincare-authenticity discussions repeated across Reddit. S006 was excluded to avoid inflating recurrence. Trustpilot evidence came from three independent reviews on one aggregate page and must not be treated as three platforms or representative recurrence.

### Context richness

Most app-store and consumer-review records omit prior category history and shopping mission. Lifetime-new or dormant status remains unknown except where a source explicitly says “first time.” Platform abandonment and category abandonment are also not always distinguishable.

### Source-policy concerns

All nine candidates were publicly readable without login. Only short excerpts were stored. Usernames, account details, a named support employee, personal health comments, and unverified operational allegations were omitted. Review claims about counterfeit or unsafe products remain attributed self-reports, not verified facts.

The three Trustpilot items share an aggregate review-page URL because a stable per-review permalink was not captured. That page may reorder over time, so these items have weaker traceability than the app-store and thread sources; a next batch should capture stable review links where available or reconsider retention.

### Platform concentration and valence

Reddit reached the 50% ceiling. Seven of ten items are Zepto-direct, but the retained material is strongly negative-skewed. This limits balanced behavioral interpretation and makes positive, successful, or repeat category experiments a priority for any next batch.

### Applicability

No category-general contextual evidence was retained. This avoids weak transfer in the first batch, but later collection may need carefully bounded category-general evidence to understand information needs that public quick-commerce discussions do not explain.

## Recommended query or codebook changes

Recommendations are process changes only, not insights or product ideas:

1. Add positive queries using “first time,” “started buying,” “order again,” and “now use” with specific category names.
2. Prioritize non-Reddit app-store, consumer-review, and public forum sources to reduce platform concentration.
3. Add a context field for `prior_category_state`: lifetime-new, dormant, familiar, or unknown; never infer it from first corpus appearance.
4. Distinguish `category abandonment` from `platform abandonment` in the outcome field.
5. Search specifically for successful or repeated pet care, household care, baby care, and personal-care purchases.
6. Keep the existing rule that generic quality or support complaints require a category decision or outcome.

## Decision recommendation

- **Continue / revise / stop:** Revise before any next batch.
- **Reason:** The first batch met the stop rule and basic source/category spread, but query yield is negative-skewed, Reddit is at the platform cap, and category-history context is frequently missing.
- **Human approval required before next batch:** Yes.
