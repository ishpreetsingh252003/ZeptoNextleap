# Query Matrix v1

- **Status:** Draft v1 — Awaiting human review
- **Owner:** Research Lead
- **Version:** 1.0
- **Last reviewed:** 2026-07-19
- **Purpose:** Provide a small, reviewable set of search directions covering sources, categories, missions, behavioral constructs, and disconfirming cases.

## Use

Each row is a query family, not a conclusion and not a requirement to run every combination. Adapt syntax to each platform after its access policy is approved. Record the executed query separately during collection.

## Query construction template

```text
[Zepto OR quick commerce OR instant delivery]
+ [category terms]
+ [shopping mission terms]
+ [behavioral language]
+ optional confirming or disconfirming terms
```

Search-result counts must not be interpreted as behavior prevalence.

## Starter matrix

| ID | Platform/source | Category | Shopping mission | Behavioral construct | Positive/confirming language | Contradictory/disconfirming language |
|---|---|---|---|---|---|---|
| Q01 | Google Play / Apple App Store public reviews | Cross-category | Any stated mission | Category consideration | discovered, tried, bought for first time, convenient | only use for groceries, never browse, not for other items |
| Q02 | Reddit public threads | Cross-category | Urgent top-up | Habit / exploration | added while ordering, remembered, tried because needed now | stuck to my list, no time to browse, bought elsewhere later |
| Q03 | Reddit public threads | Baby care | Planned caregiving | Perceived risk / trust | trusted brand, safe to try, reliable, repeat purchase | would not risk, need expert advice, prefer specialist or offline |
| Q04 | Public parenting forums, subject to platform approval | Baby care | Urgent replenishment | Decision criterion / workaround | emergency purchase worked, known product available | checked elsewhere, asked community, waited for store, needed more details |
| Q05 | Public product reviews | Pet care | Replenishment | Habit / trust signal | repeat order, known brand, suitable, convenient | pet refused, wrong variant, need specialist selection, prefer pet store |
| Q06 | Reddit or public pet communities | Pet care | New pet / exploratory | JTBD / information need | beginner guidance, easy choice, starter option | asked vet/community, confusing options, would not buy without research |
| Q07 | App reviews and public forums | Personal care | Routine replenishment | Platform mental model | buy all personal care here, convenient repeat, found a new product | prefer beauty marketplace, need reviews, only buy known brands |
| Q08 | Public beauty/product discussions | Personal care | Exploratory/self-care | Decision criterion / perceived risk | ingredients clear, reviews helped, small trial | skin risk, shade/suitability unclear, need richer comparison |
| Q09 | App reviews and public forums | Household care | Replenishment | Trigger / substitution | added with groceries, substitute acceptable, bulk need | forgot category existed, unavailable size, compare price elsewhere |
| Q10 | Public product/comparison discussions | Household care | Planned stock-up | Workaround / price criterion | one-stop purchase, fast delivery outweighed comparison | bought in bulk elsewhere, better range, price checked on another platform |
| Q11 | Public wellness discussions, policy-approved only | Health and wellness | Need-driven | Trust / perceived consequence | known item, verified details, fast access | need pharmacist/expert, authenticity concern, avoid quick commerce |
| Q12 | Public forums and reviews | Snacks and beverages | Social occasion / impulse | Experiment behavior | tried new flavor, add-on, recommendation worked | browsed but skipped, discount-only, would not reorder |
| Q13 | Public comparison pages or blogs with attributable comments | Cross-category | Planned basket | Platform selection | prefer quick commerce for variety or speed | prefer marketplace/offline for reviews, range, trust, or price |
| Q14 | Public forums and app reviews | Cross-category | Successful first trial | Outcome / mental-model change | now buy regularly, started using for more categories | one-time purchase, poor fit, returned to previous channel |
| Q15 | Public forums and app reviews | Cross-category | Dormant-category return | Trigger / reactivation | bought again after need, availability, reminder, season | no longer relevant, switched channel, reminder ignored |
| Q16 | Public discussions | Cross-category | Any | Disconfirmation of information hypothesis | bought without reviews, details not needed, known brand enough | needed comparison, left to research, information missing |
| Q17 | Public discussions | Cross-category | Any | Disconfirmation of price hypothesis | convenience outweighed price, paid more, no discount needed | waited for offer, compared price, incentive caused first trial |
| Q18 | Public discussions | High-consequence categories | Urgent | Disconfirmation of risk hypothesis | trusted quick commerce, purchased unfamiliar option confidently | postponed, sought expert, chose familiar option only |

## Platform/source groups for review

- Public app-store reviews
- Public Reddit threads
- Public forums and communities
- Public product reviews
- Public comparison discussions
- Public blogs or news comments where the original behavior is attributable and policy-compliant

Search engines and Tavily may discover sources, but their summaries are not evidence unless the underlying page is verified.

## Pilot balance check

Before scaling, confirm the executed pilot includes:

- More than one source type
- At least one familiar-category comparator and several expansion categories
- Urgent, replenishment, planned, and exploratory missions where available
- Successful purchase, abandonment, workaround, and repeat/non-repeat outcomes
- Explicit disconfirming searches for the leading hypotheses

Numerical quotas remain a human decision after reviewing source availability.
