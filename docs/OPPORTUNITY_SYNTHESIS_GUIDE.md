# Opportunity Synthesis Guide

**Status:** Draft v1 — Awaiting human review  
**Owner:** Product research lead  
**Version:** 1.0  
**Last reviewed:** 2026-07-29  
**Purpose:** Explain the offline, deterministic scoring used to turn reviewed
research evidence into an MVP decision shortlist.

## Evidence boundary

This workflow does not discover, Fetch, scrape, classify, or generate
evidence. It accepts only a human-reviewed CSV with explicit opportunity IDs,
source type, category, and structured relevance tags. It never reads review
text or infers a tag from wording.

The required CSV columns are:

```text
evidence_id,opportunity_id,opportunity_title,source_type,category,relevance_tags,reviewed
```

`reviewed` must be `true`. Allowed semicolon-, comma-, or pipe-separated tags
are `trust_risk`, `purchase_elsewhere`, `repeat_purchase`, and
`positive_counterevidence`. A row with another tag, a duplicate ID, or a missing
required value is rejected instead of guessed at.

## Scoring

Opportunity score is a transparent evidence-strength score out of 100:

| Criterion | Maximum points | Rule |
| --- | ---: | --- |
| Evidence frequency | 25 | Reaches the cap at eight reviewed records. |
| Source diversity | 15 | Reaches the cap at four source types. |
| Trust/risk relevance | 15 | Share explicitly tagged `trust_risk`. |
| Purchase-elsewhere relevance | 15 | Share explicitly tagged `purchase_elsewhere`. |
| Repeat-purchase relevance | 10 | Share explicitly tagged `repeat_purchase`. |
| Category concentration | 10 | Share in the most represented category. |
| Positive counterevidence | 10 | Share explicitly tagged `positive_counterevidence`. |

Equal scores use confidence score, then `opportunity_id`, for stable ordering.
The score is not a business-impact forecast, prevalence estimate, or automatic
MVP decision.

Confidence is reduced for a single source, category imbalance, and an interview
gap. A highly concentrated category can be useful for a category-specific MVP,
but it is still flagged so reviewers do not claim the result generalizes.

## Why no AI is used

The input is already structured and reviewed. Weighted arithmetic is auditable,
repeatable, free to run, and cannot fabricate a rationale or silently reinterpret
evidence. AI would add ambiguity without improving this decision boundary.

## Interviews complement reviews

Reviews reveal public, observable behaviour. Interviews can test the missing
decision context: why a shopper did or did not try a category, what information
they needed, and whether an observed workaround is representative. The report
lists an `INTERVIEW_GAP` whenever no row with `source_type=interview` is linked
to an opportunity. That is a research gap, not proof that the opportunity is
invalid.

The files in `research/behavior/` are empty templates for human-reviewed theory,
industry context, and interview insights. They must not be populated with
generated findings.

## Next phase: Behaviour Knowledge Base

Before final MVP selection, manually review and populate the header-only files
in `research/behavior/`: `behavioural-theories.csv`, `commerce-insights.csv`,
`industry-case-studies.csv`, and `research-papers.csv`. Each row must contain
an explicit opportunity ID, one controlled behavioural theme, a source, and
`reviewed=true`.

Allowed themes are `trust`, `risk`, `habit`, `trial`, `repeat_purchase`,
`abandonment`, `social_proof`, and `decision_fatigue`. Reviewed evidence may
optionally add a `behavioural_themes` column using the same controlled values.
The report joins a knowledge record only when both its named opportunity and
theme match. It reports review-only opportunities, review-plus-behavioural
support, confidence uplift, and remaining gaps. No free-text matching or AI
classification is performed.

## Run the report

Report only; does not write a file:

```powershell
pnpm research:opportunities --input path/to/reviewed-evidence.csv --report-only
```

Write a local report only after review:

```powershell
pnpm research:opportunities --input path/to/reviewed-evidence.csv --output research/opportunity-output/opportunity-report.json
```

Optional manually reviewed knowledge inputs can be supplied alongside either
mode:

```powershell
pnpm research:opportunities --input path/to/reviewed-evidence.csv --behavioural-theories research/behavior/behavioural-theories.csv --commerce-insights research/behavior/commerce-insights.csv --report-only
```

The output directory is Git-ignored. No approval or evidence status changes.

## Select the MVP deliberately

Use the top opportunities as a review queue. For each candidate, check the
linked evidence, source mix, category scope, counterevidence, and interview
gap, then check whether manually reviewed behavioural research aligns to the
same opportunity and theme. Choose an MVP only when the human reviewer can
articulate a behavioural mechanism and an experiment that could change category
expansion. Do not select an idea solely because it has the highest arithmetic
score or a confidence uplift.
