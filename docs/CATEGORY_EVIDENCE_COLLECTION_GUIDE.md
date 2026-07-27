# Category Evidence Collection Guide

## Document control

- Status: Draft — awaiting human review
- Owner: Product research lead
- Version: v1
- Last reviewed: 2026-07-27
- Purpose: Collect the next bounded set of traceable category-expansion evidence without unsupported automation.

## Collection boundary

Collect public, policy-compliant material manually or through already approved source boundaries. Interviews require explicit recorded consent and remain primary-research evidence, not public-source evidence. Do not infer Monthly Active Customer status from public material.

Allowed interview consent values are `consent_given`, `consent_withdrawn`, and `not_recorded`. Only `consent_given` records can receive verified provenance or enter readiness; the other states remain visible but ineligible.

The target is evidence explaining category consideration, trial, abandonment, purchase elsewhere, recovery, and repeat behavior. Broad operational complaints qualify only when they explain one of those behaviors.

Every retained record requires:

- Stable external or deterministic record ID
- Source identity and source type
- Canonical public URL or controlled interview record
- Capture/import date
- Category, behavior stage, and evidence type
- Neutral context plus the original traceable evidence
- Provenance note and consent status for interviews

## Common inclusion criteria

- The record names or clearly identifies a target category.
- It contains a decision, uncertainty, trigger, workaround, outcome, or repeat behavior.
- Its source and original context can be revisited.
- Any interpretation is separated from what the shopper explicitly stated.
- Contradictory and positive evidence is retained alongside complaints.

## Common exclusions

- Generic app sentiment, delivery complaints, or support complaints with no category behavior.
- Brand, flavour, pack-size, or variant choice inside a familiar category unless it explains category expansion.
- Private, login-gated, paywalled, sensitive, or personally identifying material.
- Medical advice, unverified health claims, or personal child/health details.
- Copied text with unclear origin.

## Category collection briefs

Each category has an initial desired minimum of **13 relevant records**. This produces a working target of 104 records across eight categories; it is an operational collection goal, not a statistical threshold.

### Pet care

- Questions: Why avoid pet care on Zepto? Which specialist channel is preferred? What ingredient, life-stage, expiry, or authenticity information is required? What creates repeat purchase?
- Evidence needed: barriers, first trials, purchase elsewhere, trust signals, failed outcomes, and positive repeats.
- Search terms: `Zepto pet food quality`, `Zepto pet care trust`, `pet supplies offline instead of Zepto`, `first pet-care order Zepto`.
- Sources: public search results, approved/manual Reddit, Google Play filtering, specialist public forums, Trustpilot, consented interviews.
- Include: explicit pet-care decisions and outcomes.
- Exclude: general delivery complaints or veterinary/medical advice.
- Provenance: public URL and capture date, or controlled consented interview record.
- Minimum desired: 13.

### Baby care

- Questions: Which safety, sizing, ingredient, expiry, or authenticity concerns block trial? Why choose a pharmacy or specialist? What enables repeat?
- Evidence needed: consideration barriers, trust requirements, channel switching, first-purchase outcomes, and repeats.
- Search terms: `Zepto baby products trust`, `Zepto diapers quality`, `baby care pharmacy instead of quick commerce`, `first baby-care order Zepto`.
- Sources: public search, approved/manual Reddit, authorized App Store exports, public parenting discussions, Trustpilot, consented interviews.
- Include: category decisions with personal details removed.
- Exclude: child identity, medical details, or generic support sentiment.
- Provenance: exact public context or controlled consented interview record.
- Minimum desired: 13.

### Personal care

- Questions: What suitability or authenticity uncertainty prevents trial? What information or recovery assurance is needed? Why buy elsewhere?
- Evidence needed: information needs, barriers, comparisons, abandonment, and repeat signals.
- Search terms: `Zepto personal care authenticity`, `personal care bought offline instead of Zepto`, `Zepto personal care first order`, `Zepto personal care repeat`.
- Sources: search results, approved/manual Reddit, app-review filtering, forums, Trustpilot, interviews.
- Include: explicit personal-care category behavior.
- Exclude: familiar-brand switching without a category-entry mechanism.
- Provenance: canonical source and documented manual/import method.
- Minimum desired: 13.

### Health and wellness

- Questions: Which authenticity, safety, expiry, or specification risks prevent trial? Why is pharmacy credibility preferred? What enables repeat?
- Evidence needed: channel choice, information needs, trust signals, abandonment, and post-purchase outcomes.
- Search terms: `Zepto wellness authenticity`, `supplements bought from pharmacy instead`, `Zepto wellness first order`, `Zepto health product return risk`.
- Sources: public search, approved/manual Reddit, app-review exports, public specialist discussions, interviews.
- Include: shopping behavior without medical inference.
- Exclude: diagnoses, medical advice, sensitive health information, or unsupported efficacy claims.
- Provenance: traceable public source or controlled consented record.
- Minimum desired: 13.

### Beauty and skincare

- Questions: How do authenticity, ingredients, suitability, shade/fit, or return risk affect trial? Why are specialist marketplaces trusted?
- Evidence needed: comparisons, first trials, authenticity checks, channel switching, failed outcomes, and repeats.
- Search terms: `Zepto skincare authenticity`, `skincare bought elsewhere instead of Zepto`, `Zepto beauty first purchase`, `Zepto skincare repeat purchase`.
- Sources: search, approved/manual Reddit, public beauty forums, app-review exports, Trustpilot, interviews.
- Include: explicit beauty/skincare decision context.
- Exclude: brand preference without category expansion or sensitive health claims.
- Provenance: source URL and context or controlled interview record.
- Minimum desired: 13.

### Fresh produce

- Questions: How do freshness, ripeness, inspection, substitution, and recovery affect trial and repeat? Why buy offline?
- Evidence needed: inspection workarounds, first trial, abandonment, trust signals, and repeats.
- Search terms: `Zepto vegetables freshness`, `buy vegetables offline instead of Zepto`, `Zepto fruit first order`, `Zepto produce repeat`.
- Sources: search, approved/manual Reddit, app reviews, public forums, Trustpilot, interviews.
- Include: evidence distinguishing category choice from routine grocery sentiment.
- Exclude: late delivery unless it changes produce-category behavior.
- Provenance: exact source context or controlled interview record.
- Minimum desired: 13.

### Meat and seafood

- Questions: Which freshness, handling, source, cut, weight, or packaging risks prevent trial? Why prefer a local specialist?
- Evidence needed: channel switching, trust requirements, information needs, failed trials, recovery, and repeat.
- Search terms: `Zepto meat quality`, `Zepto seafood freshness`, `meat local shop instead of Zepto`, `first meat order Zepto`.
- Sources: search, approved/manual Reddit, app filtering, public specialist forums, Trustpilot, interviews.
- Include: explicit category decision and outcome.
- Exclude: food-safety assertions presented as verified fact or private community content.
- Provenance: traceable source and capture date, or controlled consented record.
- Minimum desired: 13.

### Premium/high-value packaged products

- Questions: How do authenticity, damage, specifications, warranty, and recovery risk affect trial? Why choose a specialist marketplace?
- Evidence needed: comparison criteria, first purchase, abandonment, purchase elsewhere, trust signals, and repeat.
- Search terms: `Zepto premium product authenticity`, `expensive product bought elsewhere Zepto`, `Zepto high value first order`, `Zepto expensive product return risk`.
- Sources: search, approved/manual Reddit, app reviews, public specialist discussions, Trustpilot, interviews.
- Include: explicit high-value purchase decisions and outcomes.
- Exclude: low-value brand substitution or generic refund complaints.
- Provenance: canonical public context or controlled interview record.
- Minimum desired: 13.

## Intake workflow

Use the category template for public/manual evidence and the interview template for consented primary research:

```powershell
pnpm research:intake --input research/imports/category-batch.csv --report-only
```

Multiple files:

```powershell
pnpm research:intake --input research/imports/public.csv --input research/imports/interviews.csv --report-only
```

Write a normalized local file only after reviewing diagnostics:

```powershell
pnpm research:intake --input research/imports/category-batch.csv --output research/intake-output/category-evidence-import.json
```

Both local directories are ignored by Git. The command does not contact Gemini, Groq, or any source platform.

## Provenance levels

- **VERIFIED:** canonical public URL or controlled consented interview record, capture date, clear source identity, and traceable original context.
- **PARTIAL:** public source URL exists but some metadata is missing, or manual transcription is documented.
- **INSUFFICIENT:** no traceable source, unclear origin, withdrawn/missing interview consent, or unsupported copied text.

Insufficient records remain visible in intake counts and diagnostics but cannot enter readiness or sampling.

## Sampling policy

Future selection is deterministic:

1. Direct relevance
2. Potential relevance
3. Verified provenance
4. Partial provenance
5. Category and behavior-stage minimums
6. Per-source and per-category caps
7. Stable record-ID tie-breaker

No random selection is used.
