# Category Expansion Research Plan

## Document control

- Status: Draft — awaiting human review
- Owner: Product research lead
- Version: v1
- Last reviewed: 2026-07-27
- Purpose: Focus the next evidence-collection phase on category entry and repeat behavior rather than broad service sentiment.

## Objective

Understand what prevents Zepto customers and relevant quick-commerce shoppers from trying, purchasing, and repeating categories they do not already buy regularly.

Monthly Active Customer is the business-metric population, not a public-research sampling criterion. Public evidence can describe shopper behavior but cannot verify MAC status or transaction history.

Primary scope is category-level expansion. Product-level trial is retained only when it explains entry, abandonment, purchase, or repeat behavior for a new or dormant category. Flavours, brands, pack sizes, and variants inside familiar categories are excluded unless they directly explain a category-expansion mechanism.

## Behavioral research questions

1. What triggers consideration of a new category?
2. What risks or uncertainties prevent trial?
3. Why do shoppers buy the same category elsewhere?
4. What information is missing before purchase?
5. Which trust signals reduce hesitation?
6. What causes cart or category abandonment?
7. What happens after a disappointing first trial?
8. What creates repeat purchase after initial trial?
9. Which workarounds do shoppers adopt?
10. Which categories carry the highest perceived risk?
11. What evidence contradicts the presumed barriers?
12. When do shoppers experiment without additional assurance?

Late delivery, generic app satisfaction, broad support dissatisfaction, account management, and unrelated payment complaints are not category-expansion evidence by themselves. Retain them only when they explain category entry, abandonment, purchase elsewhere, a workaround, or repeat behavior.

## Initial category scope

These are research starting points, not predetermined MVP choices.

| Category | Likely perceived risks | Possible trust requirements | Information needs | Reasons for buying elsewhere | Evidence required |
|---|---|---|---|---|---|
| Pet care | [Hypothesis] authenticity, suitability, expiry | [Hypothesis] verified sourcing and eligibility for resolution | [Hypothesis] ingredients, life stage, size | [Hypothesis] specialist-store advice or range | [Unknown] consideration, first trial, repeat and contrary cases |
| Baby care | [Hypothesis] safety, authenticity, skin reaction | [Hypothesis] clear sourcing, expiry and return policy | [Hypothesis] ingredients, age suitability, sizing | [Hypothesis] pharmacy or specialist trust | [Unknown] caregiver decision journeys without retaining sensitive details |
| Personal care | [Hypothesis] suitability and counterfeit risk | [Hypothesis] authenticity and sealed packaging | [Hypothesis] ingredients, usage, size | [Hypothesis] broader assortment or prior trust elsewhere | [Unknown] abandonment and repeat mechanisms |
| Health and wellness | [Hypothesis] authenticity, safety, expiry | [Hypothesis] verified seller and bounded claims | [Hypothesis] ingredients, dosage/specification, warnings | [Hypothesis] pharmacy credibility | [Unknown] policy-safe behavioral evidence; exclude medical advice and sensitive health data |
| Beauty and skincare | [Hypothesis] authenticity, skin suitability, damage | [Hypothesis] sourcing, seals, return eligibility | [Hypothesis] ingredients, shade/skin-type fit, size | [Hypothesis] specialist content and trial options | [Unknown] trial, channel switching, positive counter-evidence |
| Fresh produce | [Hypothesis] freshness, ripeness, substitution | [Hypothesis] freshness standards and visible resolution | [Hypothesis] grade, quantity, ripeness | [Hypothesis] physical inspection offline | [Unknown] category entry versus routine replenishment and repeat |
| Meat and seafood | [Hypothesis] freshness, handling, cut quality | [Hypothesis] cold-chain and handling assurance | [Hypothesis] source, cut, weight, pack date | [Hypothesis] known local specialist | [Unknown] barriers, triggers, failed trials and repeat |
| Premium/high-value packaged products | [Hypothesis] authenticity, damage, expensive failure | [Hypothesis] verified source and predictable recovery | [Hypothesis] specifications, warranty/returns, seller | [Hypothesis] specialist marketplace protection | [Unknown] trial intent, abandonment, recovery and repeat |

Current bounded evidence observes general product-quality/authenticity, support/refund, and fulfillment concerns. It does **not** establish which category-expansion mechanism or category has the largest opportunity.

## Collection and coding workflow

1. Import only public, policy-compliant, traceable records using `research/templates/category-expansion-evidence.csv`.
2. Preserve source link, source name, stable external ID, capture/import date, category, behavior stage, evidence type, and provenance note.
3. Run deterministic relevance classification. It prioritizes directly and potentially relevant records but never deletes broad or irrelevant records.
4. Review classifications manually, including contradictory and boundary cases.
5. Run the readiness report. Do not invoke AI while status is `not_ready`.
6. Freeze the reviewed, balanced selection before the next bounded multi-source analysis.

## Operational readiness criteria

These thresholds are configurable MVP research-quality gates, not statistical sufficiency or representativeness claims.

| Criterion | Default | Environment variable |
|---|---:|---|
| Directly or potentially relevant records | At least 100 | `RESEARCH_READINESS_MIN_RELEVANT_RECORDS` |
| Genuine sources represented | At least 3 | `RESEARCH_READINESS_MIN_SOURCES` |
| Largest source share | At most 75% | `RESEARCH_READINESS_MAX_SOURCE_CONCENTRATION` |
| Target categories represented | At least 3 | `RESEARCH_READINESS_MIN_CATEGORIES` |
| Largest category share among categorized eligible records | At most 75% | `RESEARCH_READINESS_MAX_CATEGORY_CONCENTRATION` |
| Barriers or perceived risks | At least 20 | `RESEARCH_READINESS_MIN_BARRIERS_OR_RISKS` |
| Triggers or trust signals | At least 10 | `RESEARCH_READINESS_MIN_TRIGGERS_OR_TRUST_SIGNALS` |
| Purchase elsewhere, abandonment, or workaround records | At least 10 | `RESEARCH_READINESS_MIN_ABANDONMENT_OR_WORKAROUNDS` |
| Provenance | Complete for every selected relevant record | Fixed safety requirement |

Readiness counts describe only the reviewed bounded corpus. They must not be interpreted as prevalence or used to claim causal impact.

## Stop conditions

- Stop if records cannot be traced to public source material.
- Stop if one source or category dominates beyond the configured gate.
- Stop if operational complaints overwhelm category-behavior evidence.
- Stop if private, sensitive, login-gated, or policy-restricted material would be required.
- Stop before AI analysis until a human approves the frozen selection.
