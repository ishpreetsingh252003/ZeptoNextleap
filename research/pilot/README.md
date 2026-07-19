# Manual Pilot Collection

- **Status:** First batch complete — Awaiting pilot review
- **Owner:** Research Lead
- **Version:** 1.0
- **Last reviewed:** 2026-07-19
- **Purpose:** Run and review a bounded manual source pilot before deciding whether to continue collection.

## Authorization boundary

This directory supports manual pilot collection only. It does not authorize automated collectors, AI agents, a database, API, UI, deployment setup, insight generation, hypothesis updates, PDD work, opportunity mapping, a PRD, or product ideation.

## Approved operating assumptions

The full pilot intends to review 30–40 candidate public sources and retain approximately 20–25 useful evidence items, with at least 3 source types, 4 category groups, and 5 contradictory or boundary cases. No platform should exceed 50% of retained evidence. Collection must stop or revise early when relevance or context quality is poor.

These are operational assumptions, not statistical sufficiency thresholds. Counts describe this corpus only and must not be used to infer prevalence.

## First-batch stop rule

Review only 8–10 candidate sources, record retained and excluded material, complete the pilot review, and stop. Continued collection requires a separate human decision.

## Files

- `source-log.csv`: every candidate source reviewed
- `evidence-items.csv`: retained, atomic evidence items
- `excluded-sources.csv`: excluded candidates and reasons
- `query-execution-log.csv`: exact queries and observed review yield
- `pilot-review-template.md`: first-batch balance, quality issues, and recommendations

## Evidence rules

- Use only public, policy-compliant sources.
- Store minimal permitted excerpts and neutral paraphrases.
- Exclude private, login-gated, paywalled, sensitive, or personal content.
- Do not infer demographics, prevalence, outcomes, or Zepto-specific behavior.
- Retain product-level discussion only when it explains category consideration, channel choice, purchase, abandonment, purchase elsewhere, workaround, or repeat behavior.
- Label every retained item as Zepto-direct, Quick-commerce transferable, or Category-general contextual and explain transfer limits.
