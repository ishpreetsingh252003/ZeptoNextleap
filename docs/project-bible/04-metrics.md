# Metrics Framework

- **Status:** Draft v1 — Awaiting human review
- **Owner:** Product Lead
- **Version:** 1.0
- **Last reviewed:** 2026-07-19
- **Purpose:** Define candidate outcome, diagnostic, and guardrail metrics without inventing baselines or targets.

## Evidence status

No baseline, target, uplift, or internal Zepto metric value is available. All formulas require validation against future data availability.

## Primary metric candidates

### Lifetime-New Category Expansion Rate

```text
Monthly Active Customers purchasing from at least one lifetime-new category
÷ Monthly Active Customers
```

### Dormant-Category Expansion Rate

```text
Monthly Active Customers purchasing from at least one category not purchased
within the approved lookback period
÷ Monthly Active Customers
```

The dormant lookback remains undecided. A 180-day window may be tested as a provisional assumption but must not be presented as validated.

## Metric eligibility decisions required

- Define a Monthly Active Customer.
- Define the measured category level.
- Define completed purchase and treatment of cancellation/refund.
- Define minimum reliable history.
- Decide whether users with no eligible categories remain in the denominator.
- Decide how category taxonomy changes are handled.

## Candidate diagnostic metrics

- Eligible-category consideration rate
- Unfamiliar-category product-detail view rate
- Unfamiliar-category add-to-cart rate
- Add-to-cart-to-purchase conversion
- Number of distinct categories purchased per active customer
- Time between initial consideration and purchase
- 30- or 60-day repeat purchase from the expanded category

These metrics are candidates, not approved success criteria.

## Candidate guardrails

- Core shopping-mission conversion
- Cart abandonment
- Checkout completion time
- Cancellation, refund, and replacement rate
- Intervention dismissal or hide rate
- Customer-support contacts
- Discount or incentive cost
- Gross-margin impact

## Measurement integrity

- Separate eligibility, assignment, exposure, engagement, and purchase events.
- Do not count a configured treatment as an exposure unless it was visible.
- Use stable customer-level assignment for future experiments.
- Label simulated data and results explicitly.
- Do not claim causal impact without a valid controlled evaluation.
