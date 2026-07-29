# MVP Readiness Checklist

**Project:** Zepto NextLeap Graduation Project  
**Repository:** `zepto-nextleap-research`  
**Status:** Consolidation Complete  

---

## 1. Evidence Collection
- [x] Header-only CSV templates provided in `research/templates/` (`reviewed_evidence.csv`, `interview_notes.csv`).
- [x] Schema & column validation implemented in `services/research-worker/src/category-evidence-intake.ts`.
- [x] Provenance & duplicate evidence detection validated.
- [x] Human review flag enforcement (`reviewed = true`) for all imported rows.
- [x] Integration tests for evidence intake passing (`category-evidence-intake.test.ts`).

## 2. Behavioural Research
- [x] Behaviour knowledge base schema defined (`research/behavior/`).
- [x] Datasets integrated: `behavioural_theories`, `commerce_insights`, `industry_case_studies`, `research_papers`.
- [x] Controlled taxonomy of behavioural themes established (trust, risk, habit, trial, repeat_purchase, abandonment, social_proof, decision_fatigue).
- [x] Behaviour knowledge parser implemented and tested in `services/research-worker/src/research/scoring/core.ts`.
- [x] Theme matching between evidence and behavioral insights enforced.

## 3. Opportunity Scoring
- [x] Modular scoring engine established (`services/research-worker/src/research/scoring/`).
- [x] Multi-criteria weighting system (evidence frequency, source diversity, trust/risk relevance, purchase elsewhere, repeat purchase, category concentration, positive counterevidence).
- [x] Automated weak evidence flags (e.g. `SINGLE_SOURCE`, `LOW_SOURCE_DIVERSITY`, `CATEGORY_IMBALANCE`, `INTERVIEW_GAP`, `BEHAVIOURAL_RESEARCH_GAP`).
- [x] Behavioural support uplift and review confidence scoring verified.
- [x] Unit test suite passing (`opportunity-scoring.test.ts`).

## 4. MVP Selection
- [x] Deterministic prioritization pipeline active (`services/research-worker/src/research/candidate-prioritization.ts`).
- [x] Automated report generation (`research:opportunities` CLI command).
- [x] Opportunity ranking matrix verified against evidence quality thresholds.
- [x] Graduation decision framework finalized in `docs/ZEPTO_CUSTOMER_MVP_DECISION.md`.

## 5. Customer-Facing MVP
- [ ] Bind synthesized top-ranked opportunities to frontend UI routes (`apps/research-web`).
- [ ] Finalize customer UX flows for evidence review and recommendation display.
- [ ] End-to-end user acceptance testing with stakeholder review.

## 6. Final Deployment
- [ ] Set up production environment configuration (`.env` validation).
- [ ] Perform security and data privacy review.
- [ ] Verify static asset bundle build and backend API containerization.
- [ ] Final sign-off on graduation submission package.
