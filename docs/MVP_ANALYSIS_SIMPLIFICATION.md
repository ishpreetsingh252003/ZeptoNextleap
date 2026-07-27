# MVP Analysis Simplification

## Status

Draft implementation on `feat/mvp-analysis-simplification`. The checkpoint branch `feat/theme-completeness-repair` remains the preserved experimental research-infrastructure design.

## Primary MVP path

The primary NextLeap MVP path is:

1. Existing source collection
2. Existing normalization and exact deduplication
3. Deterministic local Evidence creation
4. One AI request for a bounded 5–8 Theme taxonomy
5. Bounded, record-oriented AI classification batches
6. Local Theme membership assembly and explicit Uncategorized fallback
7. Local Theme metrics and representative-review selection
8. One AI business-synthesis request
9. Local IDs, counts, canonical reviews, and source traceability

The MVP command is `pnpm --filter @zepto/research-worker mvp:live`. It requires an existing verified frozen snapshot and never collects Google Play data.

## Experimental path retained

`runScaledAnalysisPipeline` and its Evidence Extraction, hierarchical Theme consolidation, completeness repair, quote-mismatch diagnostics, and repeated stability harness remain available for comparison and research. They are not invoked by `runMvpAnalysis`.

No experimental implementation was deleted.

## Deterministic Evidence policy

- Every selected eligible document creates exactly one Evidence record locally.
- The Evidence ID is a SHA-256 identity over source type, source document ID, and normalized source text.
- Canonical Evidence text is copied directly from normalized source text.
- Long records use a deterministic prefix ending at a local whitespace boundary.
- Rating, review date, source type, canonical source URL, and source document ID remain attached.
- Evidence generation makes no provider request.

## Taxonomy and classification policy

The taxonomy request discovers definitions only. It cannot return Evidence IDs, membership, quotes, counts, or representative reviews. Temporary model keys are replaced with deterministic application-owned Theme IDs.

Evidence is classified in deterministic batches of 40 records by default. Each response is record-oriented: one supplied Evidence ID maps to one supplied Theme ID. Unknown references are rejected.

Persistent duplicate or conflicting assignments, omissions, and provider-failed batches are retained locally in `Uncategorized / Needs Review`; valid unrelated assignments remain usable. A reconciled run with fallback records is reported as `valid_with_uncategorized`, not fully failed. The MVP path does not invoke Theme completeness repair.

## Local Theme metrics

The application calculates membership, Evidence count, corpus percentage, rating distribution, dominant sentiment, categorized count, and Uncategorized count.

Representative Evidence is selected deterministically:

1. Negative records before neutral or unknown and positive records
2. Longer records before very short records
3. Newer records as a tie-breaker
4. Evidence ID as the final tie-breaker

## Provider strategy

The MVP depends only on the existing `AiProvider` interface and provider factory. Gemini remains selected through the current environment configuration.

A later provider-routing change can introduce:

```env
AI_PRIMARY_PROVIDER=gemini
AI_FALLBACK_PROVIDER=groq
GROQ_API_KEY=
```

These variables are proposals only. They are not required by this phase, and Groq is not treated as a substitute for a simpler analysis contract.

## Output ownership

The model may discover a taxonomy, classify records, and synthesize findings. The application owns:

- Evidence and final Theme IDs
- Evidence membership
- Evidence and Theme counts
- canonical review text
- representative review selection
- source URLs and document IDs
- rating distributions and rating-derived sentiment
- corpus reconciliation and fingerprint

The business-synthesis request receives final Theme metrics and bounded representative Evidence text. It cannot modify membership, counts, identifiers, representative selection, or traceability. Canonical representative reviews are attached locally after synthesis.

## Non-goals

- Database redesign
- Frontend implementation
- New framework
- New source adapter
- Google Play recollection
- Production provider failover
- Removal of the experimental pipeline
