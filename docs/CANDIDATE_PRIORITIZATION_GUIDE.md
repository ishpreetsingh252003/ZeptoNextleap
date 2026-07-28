# Candidate Prioritization Guide

**Status:** Draft v1 — Awaiting human review  
**Owner:** Product research lead  
**Version:** 1.0  
**Last reviewed:** 2026-07-28  
**Purpose:** Explain how to review discovery candidates before Fetch or evidence intake.

## What this workflow does

More scraping is not automatically better. A larger result set can amplify
catalogue pages, repeated posts, promotional copy, and broad complaints that do
not explain category expansion. This workflow ranks the existing discovery
candidates so a human can inspect the most promising material first. It does
not collect, approve, Fetch, or convert anything into Evidence.

- A **candidate** is a search result with a URL, title, and snippet. It is a lead.
- A **fetched document** is content retrieved from an explicitly approved
  public URL. It still requires research review.
- **Evidence** is an accepted, traceable observation that satisfies the research
  protocol and codebook. A candidate score cannot create Evidence.

## Priority score

The deterministic score ranges from 0 to 100. Named weights live beside the
scoring code. Positive signals include explicit Zepto and category references,
first-person experience, purchase or trial behavior, outcomes, usable public
URLs, user-generated sources, and positive counterevidence. Penalties cover
promotional copy, generic content without behavior, weak category matches,
pricing complaints unrelated to category trial, thin social snippets, and
ambiguous premium-category matches.

Bands are derived from the final score:

- **A — review first:** 70–100
- **B — useful backup:** 50–69
- **C — weak/manual investigation:** 25–49
- **D — exclude unless new context appears:** below 25 or a hard exclusion

Product catalogue pages, clearly irrelevant pages, and non-representative
duplicates are hard D-band exclusions. Reddit, Instagram, Facebook, and Quora
are not excluded merely because access is manual. Access method and research
relevance are separate decisions.

## Duplicate clustering

Clustering uses no embeddings. Exact normalized URLs cluster together. Different
paths cluster only on the same domain and only when titles are identical or both
title and snippet token overlap is very high. This conservative rule avoids
merging different pages simply because they discuss the same topic.

The representative is chosen by relevance score, amount of behavioral language,
accessibility, then candidate ID. These tie-breakers are stable. Clustering does
not merge or delete the source rows; it adds a cluster ID, size, and representative
flag.

## Coverage bonus

Small bonuses highlight underrepresented categories, behavior focuses, and
source types. The combined bonus is capped at 10 points. A hard-excluded or
clearly irrelevant candidate remains D-band regardless of diversity. Missing
coverage is reported rather than fabricated or filled with weak material.

The current discovery run needs particular scrutiny for beauty/skincare, baby
care relevance, premium/high-value specificity, repeat purchase, and positive
counterevidence.

## Run the review

Report without writing a file:

```powershell
pnpm research:prioritize-candidates --input research/discovery-output/category-pilot-candidates.csv --report-only
```

Write an optional local, Git-ignored review file:

```powershell
pnpm research:prioritize-candidates --input research/discovery-output/category-pilot-candidates.csv --output research/discovery-output/category-pilot-prioritized.csv
```

The shortlist contains at most 40 leads, preserves backups for a planned
24–32-record retained set, and caps one source type at 60% where the eligible
pool permits. It is not a quota-filled sample and is not final Evidence.

For each shortlisted row:

1. Open the URL manually and confirm it is public, relevant, and policy-compliant.
2. Check the category-expansion behavior in full context; do not rely on the
   search snippet.
3. Confirm the source, date, and minimal excerpt can be traced.
4. Record the human decision without changing the original discovery file.
5. For an eligible public page, copy its URL to
   `research/templates/research-url-approval.csv`, review the source policy,
   and set approval explicitly. A score never approves Fetch.
6. After review, map accepted material into
   `research/templates/category-expansion-evidence.csv`. Preserve its source
   URL and provenance, then run the existing intake checks.

## Legacy pilot reuse

Eight earlier pilot records were identified as potentially useful, but their
semantic fields cannot be inferred safely. Use
`research/templates/legacy-pilot-mapping.csv` to record an explicit human
decision for category, behavior stage, evidence type, retention, and review
notes. The template intentionally contains no mappings.

## Human judgment remains required

Search snippets may omit context, social pages may require manual access, and
deterministic keyword rules cannot determine truth or research validity. Scores
order attention; they do not measure prevalence, approve sources, or replace
product-research judgment.
