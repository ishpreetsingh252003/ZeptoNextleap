# Zepto Customer MVP Decision

## Status

**PROVISIONAL — NOT FINAL**

This decision is based on one validated but source-imbalanced bounded corpus. Final MVP selection is blocked on targeted category-expansion evidence. Customer-facing implementation is not authorized.

## Validation boundary

Validated within the bounded corpus:

- Product-quality and authenticity concerns exist.
- Support and refund concerns exist.
- Fulfillment concerns exist.

Not yet validated:

- Which issue most strongly blocks category expansion.
- Which category has the highest opportunity.
- Whether product-quality confidence causes category trial.
- Whether customers would adopt any proposed flow.
- Whether the pattern remains consistent across balanced sources.

## Evidence boundary

The validated snapshot contains 209 records:

- Google Play: 200
- Reddit: 5 approved manual-pilot records
- Trustpilot: 3 approved manual-pilot records
- Apple App Store: 1 approved manual-pilot record

Google Play contributes 95.7% of the corpus. Counts are directional within this bounded dataset and are not population estimates. Reddit, Trustpilot, and App Store records are approved manual-research paraphrases with source links, not automated platform collection.

## Validated Themes

| Theme | Bounded Evidence | Source contribution |
|---|---:|---|
| General Service Satisfaction | 98 | Google Play 97; Reddit 1 |
| Product Quality and Authenticity | 27 | Google Play 21; Reddit 4; Trustpilot 2 |
| Order Fulfillment Reliability | 26 | Google Play 25; Apple App Store 1 |
| Refund and Resolution Process | 23 | Google Play 23 |
| Customer Support Efficacy | 22 | Google Play 21; Trustpilot 1 |
| App Usability and Account Management | 13 | Google Play 13 |

Every Theme carries a source-concentration warning because Google Play contributes more than the configured 60% threshold.

## Candidate scoring

Scores use a 1–5 scale. Frequency means bounded-corpus frequency, not market prevalence.

| Candidate | Pain severity | Bounded frequency | Source consistency | Strategic relevance | Feasibility | Differentiation | Total |
|---|---:|---:|---:|---:|---:|---:|---:|
| Product-quality confidence for category trial | 5 | 3 | 4 | 5 | 3 | 4 | 24 |
| Refund and support escalation visibility | 5 | 4 | 2 | 4 | 4 | 3 | 22 |
| Fulfillment and replacement control | 4 | 3 | 3 | 4 | 3 | 3 | 20 |

## Candidate 1 — Product-quality confidence for category trial

**User problem:** Shoppers considering unfamiliar or higher-risk categories need confidence that products are authentic, safe, fresh, intact, and recoverable when something goes wrong. The manual pilot contains direct category-entry evidence involving protein, skincare, baby care, fruit, and personal care.

**Supporting Theme:** Product Quality and Authenticity — 27 records.

**Source coverage:** Google Play 21; Reddit 4; Trustpilot 2.

**Representative evidence references:** E002, E004, E005, E007, E008, E009, E010 from the approved manual pilot. These include both risk-confirming and counter-evidence.

**Target user:** A current Zepto customer considering a first or dormant-category purchase where authenticity, freshness, packaging, or suitability matters.

**Proposed flow:**

1. Category shelf or search result signals category-relevant quality assurances.
2. Product page shows bounded provenance, freshness/authenticity checks, and category-specific return or replacement eligibility.
3. Cart repeats only the decisive assurance for the trial item.
4. Order history provides a short, visible resolution path if the assurance fails.

**Core value proposition:** Reduce perceived downside when experimenting with a category without turning the experience into a generic recommendation surface.

**Assumptions:**

- Quality uncertainty is a causal barrier for a meaningful subset of category trials.
- Zepto can expose trustworthy supply, packaging, freshness, and resolution information.
- Assurance improves category entry without encouraging misuse of refunds or replacements.

**Risks:**

- Claims may exceed operational capability.
- More information may add product-page friction.
- A guarantee can attract abuse or shift cost without increasing repeat behavior.

**Primary success metric:** Percentage of Monthly Active Customers purchasing from at least one lifetime-new or validated dormant category each month.

**Diagnostic metrics:** Product-page-to-cart conversion for targeted category trials; issue rate; successful resolution rate; repeat purchase in the entered category.

**Effort:** Medium.

**Zepto controllability:** Medium to high. Zepto controls product information, seller/supply controls, packaging standards, and the customer-resolution flow, but not every upstream quality failure.

## Candidate 2 — Refund and support escalation visibility

**User problem:** When an order issue occurs, unclear or ineffective resolution increases perceived risk for future purchases and can undermine willingness to try another category.

**Supporting Themes:** Customer Support Efficacy — 22; Refund and Resolution Process — 23. The Themes partition Evidence, so the combined bounded count is 45 distinct records.

**Source coverage:** Customer support has Google Play 21 and Trustpilot 1; refund/resolution currently has Google Play only.

**Representative evidence reference:** E008 from the approved manual pilot reports a product-authenticity concern and ineffective support resolution.

**Target user:** A customer with a missing, damaged, incorrect, or questionable item who needs a predictable resolution.

**Proposed flow:**

1. Order history exposes issue types and eligibility.
2. The customer sees current resolution state, next action, and expected time.
3. Unresolved or high-risk cases expose a bounded escalation path.
4. Closure explains the outcome and preserves a traceable record.

**Core value proposition:** Make recovery predictable enough that one failed purchase does not end category or platform trust.

**Assumptions:** Resolution uncertainty contributes to churn and category avoidance; operational teams can support visible service levels.

**Risks:** UI transparency cannot compensate for weak operations; escalation may increase support demand; fraud controls may create new friction.

**Primary success metric:** Successful issue resolution within the stated service level.

**Business-goal guardrail:** Subsequent new/dormant-category purchase rate among customers who experienced an issue.

**Effort:** Medium.

**Zepto controllability:** High for workflow visibility; medium for final operational resolution.

## Candidate 3 — Fulfillment and replacement control

**User problem:** Missing, incorrect, delayed, or unsuitable items make large or unfamiliar-category orders feel risky.

**Supporting Theme:** Order Fulfillment Reliability — 26 records.

**Source coverage:** Google Play 25; Apple App Store 1.

**Representative evidence reference:** E006 from the approved manual pilot describes a large move-in purchase, an unsuccessful pan replacement, and subsequent channel switching.

**Target user:** A customer placing a planned basket or trying a category where substitutions, timing, or replacement quality matter.

**Proposed flow:**

1. Product/cart captures substitution and cancellation preference.
2. Fulfillment status exposes material changes before delivery where feasible.
3. The customer can accept, reject, or resolve a changed item through one order timeline.

**Core value proposition:** Give customers control over the failure modes that make category experimentation costly.

**Assumptions:** Preference capture is operationally actionable; customers value control more than maximum fulfillment speed in selected missions.

**Risks:** Dark-store execution may not support real-time choice; extra decisions can slow urgent missions; inventory volatility may limit available alternatives.

**Primary success metric:** Accepted fulfillment rate for orders containing first/dormant-category items.

**Effort:** Large.

**Zepto controllability:** Medium.

## Provisional recommendation — not final

**Provisional primary candidate:** Product-quality confidence for category trial.

It is the best match to the approved business goal because it addresses a decision barrier before and immediately after entry into unfamiliar categories. It also has the strongest non-Google support: Reddit and Trustpilot evidence includes explicit consideration, authenticity checks, first-category purchases, abandonment, and channel switching.

**Provisional backup candidate:** Refund and support escalation visibility.

This has broader bounded frequency and is more operationally general, but its connection to category expansion is less direct and its refund Theme currently lacks non-Google corroboration.

**Confidence:** Medium, directional.

## Evidence required before final PRD selection

- A larger authorized App Store export with rating, date, country, version, and source URL
- Approved Reddit OAuth access, or more manually reviewed explicit Reddit URLs/CSV records
- More public forum/Trustpilot evidence collected through permitted explicit URLs or CSV
- More positive and disconfirming evidence about authenticity and category trial
- Category-level transaction data to connect stated quality risk with actual entry, repeat, and abandonment
- Validation of the lifetime-new versus dormant-category metric definition and dormant lookback

No claim of cross-source prevalence should be made until source balance and coverage improve. Final selection requires the readiness gates in `docs/CATEGORY_EXPANSION_RESEARCH_PLAN.md` to pass on a human-reviewed frozen corpus.
