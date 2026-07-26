# Zepto Analysis Pipeline Status

## Project objective

This repository contains an internal Review Discovery Engine for collecting and analysing public Zepto user feedback. It is research infrastructure for evidence-backed product discovery, not the customer-facing Zepto MVP.

## Completed foundations

- Provider abstraction
- PostgreSQL/Neon integration
- Gemini integration
- Source ingestion boundary
- Firecrawl adapter
- Google Play adapter
- Source orchestration
- Deduplication
- Evidence Extraction
- Theme Clustering
- Insight Generation
- Integrated analysis pipeline
- Scale hardening
- Frozen corpus replay
- Sanitized failure diagnostics
- Deterministic Insight IDs
- Bounded Theme completeness repair

## Verified review collection

The latest controlled Google Play collection produced:

- Requested: 1,000
- Collected: 1,000
- Pagination depth: 7
- Invalid: 0
- Normalized empty: 0
- Exact duplicates: 243
- Eligible: 757
- Corpus fingerprint: `f263eac7137a294a3bf0d8c94ee9c4dc87137288f02f8a52c347727290d9742c`
- Fingerprint algorithm: SHA-256

Collection, pagination, normalization, exact deduplication, snapshot verification, and frozen replay are working. This result is a bounded collection of the requested newest reviews; it is not proof of complete historical Google Play coverage.

## Current analysis architecture

1. Source collection
2. Normalization and exact deduplication
3. AI Evidence Extraction
4. Provisional Theme Clustering
5. Bounded Theme completeness repair
6. Hierarchical Theme consolidation
7. Insight Generation
8. Global aggregation and validation

Every downstream stage consumes validated shared contracts. Strict traceability checks reject unknown Evidence references, duplicate assignments, missing Theme assignments, non-exact quotes, and invalid final partitions.

## Current reliability findings

- Exact-quote failures occurred in previous live runs.
- Unknown and missing Evidence references occurred in previous Theme outputs.
- Deterministic final Insight ID handling was added to remove cross-window ID collisions.
- Missing Theme assignments now use one bounded repair request without weakening final completeness validation.
- Targeted repair succeeded for the repeatedly failing Theme batches 0 and 5.
- The latest ten-run frozen-corpus evaluation produced no complete valid corpus.
- Later runs experienced repeated provider errors, likely involving availability or quota pressure.
- One run reached Insight Generation and failed with category `OTHER`.
- Collection reliability is currently stronger than analysis reliability.

## Architectural concern

The pipeline has accumulated multiple strict LLM-dependent stages and repair/diagnostic paths. It may now be more complex than necessary for the NextLeap MVP. A comparison with GaanaNextleap is required before deciding whether to retain or simplify this design.

## Current branch history

The relevant local branches are:

- `feat/research-engine-vertical-slice` — validated provider abstraction, Neon persistence, and the live Gemini vertical slice.
- `feat/source-ingestion` — strengthened the common source-adapter boundary.
- `feat/firecrawl-adapter` — added public-page ingestion through Firecrawl.
- `feat/google-play-adapter` — added paginated Google Play review ingestion.
- `feat/source-orchestrator` — coordinated ordered multi-source collection.
- `feat/orchestrator-integration` — connected source orchestration to the worker pipeline.
- `feat/deduplication-audit` — documented and expanded exact-deduplication coverage.
- `feat/evidence-extraction` — added standalone, exact-quote Evidence Extraction.
- `feat/theme-clustering` — added standalone Theme Clustering and complete-partition validation.
- `feat/insight-generation` — added traceable standalone Insight Generation.
- `feat/analysis-pipeline-integration` — integrated Evidence, Theme, and Insight stages.
- `feat/analysis-scale-audit` — added batching, hierarchical consolidation, reconciliation, and scale tests.
- `feat/real-corpus-validation` — exercised the scaled pipeline on a real Zepto review corpus.
- `feat/insight-aggregation-fix` — made final Insight IDs deterministic across windows.
- `feat/evidence-failure-diagnostics` — added sanitized Evidence failure classification.
- `feat/theme-failure-diagnostics` — added sanitized Theme failure classification.
- `feat/theme-reference-hardening` — improved Theme Evidence-reference reliability.
- `feat/pipeline-stability-evaluation` — repeated bounded corpus analysis to measure failure frequency.
- `feat/quote-mismatch-analysis` — classified exact-quote mismatch mechanisms without retaining text.
- `feat/validation-regression-investigation` — investigated divergent quote-validation results.
- `feat/frozen-corpus-replay` — removed source drift from repeated reliability evaluations.
- `feat/theme-completeness-repair` — added one bounded repair for otherwise-valid incomplete Theme assignments.

Several experimental branches point to the same base commit because their approved work remained inherited in the working tree until this review checkpoint.

## What has not been completed

- Valid end-to-end business insight corpus
- Internal research dashboard
- Customer-facing Zepto MVP
- Prioritization engine
- Final report UI
- Production deployment validation

## Review questions

1. How does Zepto’s review pipeline differ from GaanaNextleap?
2. Which Zepto abstractions are useful and should be retained?
3. Which layers are unnecessary for the MVP?
4. Should Evidence be generated locally instead of by an LLM?
5. Should Gemini remain primary, with Groq as fallback?
6. What is the smallest reliable architecture that can produce grounded business insights?
7. Which current experimental branches should eventually be retained, squashed, or abandoned?
