# Project Roadmap

Status: Draft for review
Owner: Project team
Version: v1
Last reviewed: 2026-07-28
Purpose: Provide one authoritative sequence from research foundation to graduation submission.

## Phase 1 — Foundation

**Status: completed**

- Purpose: Establish a minimal production-quality base for the internal research application.
- Completed work: monorepo, shared configuration, provider abstraction, PostgreSQL/Drizzle foundation, source contracts, API, worker, and internal web shell.
- Checkpoint: `feat/research-engine-vertical-slice` at `e242f8e`, including earlier Neon/provider commits.
- Remaining work: no foundation redesign; update overview documentation when runtime responsibilities change.
- Deliverable: buildable internal Review Discovery Engine foundation.

## Phase 2 — Review Collection

**Status: completed**

- Purpose: Collect bounded public or supplied reviews through a shared document contract.
- Completed work: Google Play adapter, Firecrawl/public URL boundary, manual input, source registry/orchestrator, normalization, exact deduplication, and frozen corpus support.
- Checkpoints: `feat/source-ingestion` through `feat/orchestrator-integration`; deduplication at `7f0cab6`.
- Remaining work: source-specific live use remains opt-in and policy-bound.
- Deliverable: normalized `PublicDocument[]` suitable for downstream review.

## Phase 3 — Simplified Review Analysis

**Status: completed**

- Purpose: Replace the unreliable LLM-heavy hierarchy with a smaller, inspectable MVP analysis.
- Completed work: deterministic local Evidence, AI-generated bounded taxonomy, batched Evidence classification, local Theme membership/counts, representative reviews, and business synthesis.
- Checkpoint: `feat/mvp-analysis-simplification` at `5bd8d4e`.
- Remaining work: use it on the approved targeted research corpus; do not revive the experimental pipeline for the graduation MVP.
- Deliverable: traceable MVP analysis artifact with complete local reconciliation.

## Phase 4 — Multi-Source Research

**Status: completed as infrastructure**

- Purpose: Admit more than one source without treating source volume as evidence quality.
- Completed work: CSV import, curated public URLs, provenance, source-quality reports, source caps, exact duplicate reporting, snapshots, and readiness reporting.
- Checkpoint: `feat/multi-source-research-coverage` at `0982aed`.
- Remaining work: populate with genuine category-expansion evidence and review source balance.
- Deliverable: reproducible, policy-compliant multi-source corpus infrastructure.

## Phase 5 — Category Evidence Collection

**Status: active — infrastructure completed, research data pending**

- Purpose: Collect behavioral evidence specifically about new/dormant category consideration and trial.
- Completed work: 64-query pack, interview and category-evidence templates, controlled intake, relevance classification, provenance scoring, sampling controls, and readiness gates.
- Checkpoint: `feat/category-evidence-collection` at `f7ac3be`.
- Remaining work: collect genuine records, review them manually, and keep evidence distinct from search candidates.
- Deliverable: reviewed category-expansion evidence corpus and readiness report.

## Phase 6 — Free Research Discovery

**Status: completed**

- Purpose: Reduce manual discovery effort without making a paid provider or automated extraction mandatory.
- Completed work: optional TinyFish Search, optional human-approved TinyFish Fetch, URL safety, request caps, sanitized failures, and manual fallback.
- Checkpoint: `feat/free-research-discovery` at `4308a5f`.
- Live validation: completed 2026-07-28 with two Search queries, nine unique candidates, one duplicate removed, zero invalid/private URLs, no output file, and Fetch disabled.
- Remaining work: human candidate review only; no returned URL is approved by this smoke test.
- Deliverable: bounded candidate discovery workflow with a provider-free fallback.

## Phase 7 — Targeted Research Collection

**Status: pending**

- Purpose: Determine whether useful category-expansion evidence is available before scaling collection.
- Completed work: supporting protocols, templates, discovery tools, and intake gates exist.
- Current continuation point: branch `feat/free-research-discovery`, commit `4308a5f`.
- Remaining work:
  - collect 24–32 pilot records;
  - target roughly 3–4 records per category;
  - use at least three source types;
  - verify provenance and relevance;
  - expand toward 100 relevant records only if pilot quality is adequate;
  - balance sources and categories.
- Deliverable: reviewed targeted corpus plus a truthful readiness/gap report.

## Phase 8 — Final MVP Decision

**Status: pending**

- Purpose: Select a customer problem and intervention using the targeted corpus.
- Completed work: a provisional decision framework and candidate direction document exist.
- Remaining work: run approved analysis, compare candidate directions, review disconfirming evidence, and select a primary and backup MVP.
- Deliverable: approved PDD update, Opportunity Tree, hypothesis decision, primary MVP, and backup MVP.

## Phase 9 — Customer-Facing Zepto MVP

**Status: pending**

- Purpose: Build a Zepto-native customer experience that addresses the selected category-expansion mechanism.
- Completed work: none in this repository; deliberate separation is preserved.
- Remaining work: product scope, user flow, Zepto-native UI, backend integration if required, instrumentation, and usability/behavior validation.
- Deliverable: customer-facing MVP, expected to be built separately after approval.

## Phase 10 — Internal Dashboard, Deployment and Submission

**Status: pending**

- Purpose: Package the research system and product story for evaluation.
- Completed work: internal web/API/database foundation and documentation base exist.
- Remaining work: decide dashboard scope, connect the approved analysis artifact, deploy appropriate services, verify end-to-end behavior, assemble demo, deck, and final report.
- Deliverable: deployed internal research demonstration and complete graduation submission.

## Current gate

Do not begin the customer MVP from the smoke-test candidates. The current gate is human-reviewed targeted research followed by a final MVP decision.
