# Project Status Report

**Repository:** `zepto-nextleap-research`  
**Branch:** `chore/project-consolidation`  
**Date:** July 2026  
**Objective:** Repository audit and consolidation for MVP readiness.

---

## 1. Executive Summary

This report documents the repository status, architecture, and module classification for the Zepto NextLeap Graduation Project. As per project guidelines, all infrastructure development is paused, and the repository is consolidated into a deterministic, human-review-first pipeline with zero runtime AI dependence or scraping for the core MVP path.

---

## 2. Module Classification & Status

### A. Completed Production Modules

The primary offline, deterministic research pipeline is fully operational across 6 core phases:

| Phase | Core Module / File | Status | Description |
|---|---|---|---|
| **1. Category Evidence Collection** | `services/research-worker/src/category-evidence-intake.ts` | Complete | Ingests reviewed CSV evidence & interview notes with strict validation. |
| **2. Free Research Discovery** | `services/research-worker/src/free-research-discovery.ts` | Complete | Generates structured search query plans and extracts candidate URLs safely. |
| **3. Candidate Prioritization** | `services/research-worker/src/research/candidate-prioritization.ts` | Complete | Ranks research candidates deterministically based on source authority and provenance. |
| **4. Opportunity Scoring** | `services/research-worker/src/research/scoring/core.ts` | Complete | Calculates objective evidence strength, source diversity, and relevance scores. |
| **5. Behaviour Knowledge Base** | `research/behavior/` & `scoring/core.ts` | Complete | Validates and links qualitative behavioral knowledge base records to opportunities. |
| **6. Opportunity Synthesis** | `services/research-worker/src/pipelines/synthesize_evidence.ts` | Complete | Synthesizes scored evidence and behavioral insights into final decision reports. |

### B. Remaining Modules (Post-Consolidation Roadmap)

- **Customer-Facing MVP UI**: Binding synthesized opportunity reports to user-facing recommendation flows.
- **Production Hardening**: Auth, monitoring, and database integration for multi-user deployment (if required post-MVP).

### C. Deprecated or Duplicated Code

- **Legacy Database Worker Loop** (`services/research-worker/src/pipeline.ts` & `src/index.ts`):
  - *Status*: Marked as `[LEGACY RUNTIME]`. Uses older 5-stage DB processing and live AI providers. Retained for historical compatibility; not used in the offline MVP pipeline.
- **Duplicated Scoring Logic**:
  - *Status*: Refactored. Monolithic `opportunity-scoring.ts` has been modularized into `src/research/scoring/{core,types,utils}.ts`.

### D. Experimental & Reference Code

- **LLM-based Analysis Pipeline** (`services/research-worker/src/analysis-pipeline.ts`):
  - *Status*: Marked as `[EXPERIMENTAL]`. Heavy multi-stage LLM pipeline retained strictly for offline benchmark testing.
- **AI Provider Integrations** (`services/research-worker/src/ai/` - Gemini, Groq):
  - *Status*: Marked as `[EXPERIMENTAL / REFERENCE]`. Provider clients retained for reference testing, unused by default in offline deterministic scoring.

---

## 3. Recommended Production Architecture

The canonical execution flow for the Zepto graduation MVP follows a 100% deterministic, audit-first pipeline:

```text
  Evidence Collection
           ↓
    Evidence Intake
           ↓
  Research Readiness
           ↓
Candidate Prioritization
           ↓
  Opportunity Scoring
           ↓
Behaviour Knowledge Base
           ↓
 Opportunity Synthesis
           ↓
   Final MVP Decision
```

---

## 4. Architectural Rules & Constraints

1. **Deterministic & Offline**: No live network calls or LLM inference required for opportunity evaluation.
2. **Human-in-the-Loop**: All candidate sources and evidence items require explicit human review (`reviewed = true`).
3. **No New Providers / DB Schemas**: No additional infrastructure, third-party LLM dependencies, or schema changes are permitted.
