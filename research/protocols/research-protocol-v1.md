# Research Protocol v1

- **Status:** Draft v1.1 — Awaiting human review
- **Owner:** Research Lead
- **Version:** 1.1
- **Last reviewed:** 2026-07-19
- **Purpose:** Specify how public evidence will be collected, reviewed, coded, synthesized, and translated into product discovery.

## 1. Study objective

Identify evidence-backed behavioral mechanisms that prevent or enable monthly category expansion, while preserving contrary cases and avoiding claims of population prevalence.

## 2. Business goal

Increase the percentage of Monthly Active Customers purchasing from at least one new category each month.

**Monthly Active Customer is the business-metric population, not a public-research sampling criterion.** Public research samples customers and quick-commerce shoppers; it cannot verify an author's MAC status.

Two metric interpretations remain under review:

- Lifetime-new category
- Dormant category not purchased within an approved lookback period

The dormant lookback is undecided. A 180-day period is only a provisional assumption to evaluate.

## 3. Research scope

### Include

- Public descriptions of category consideration, purchase, postponement, abandonment, or repeat behavior
- Shopping mission, trigger, barrier, decision criterion, information need, trust, perceived risk, workaround, and outcome
- Zepto-specific evidence and relevant broader quick-commerce or category-purchase evidence
- Positive, negative, mixed, and contradictory cases
- Product-level trial only when it explains entry, abandonment, purchase, purchase elsewhere, workaround, or repeat behavior for a lifetime-new or dormant category

### Exclude

- Private, paywalled-without-access, access-controlled, or sensitive content
- Pure delivery complaints with no connection to category behavior
- Promotional content without authentic customer behavior
- Unsupported summaries copied from other sources
- Content with insufficient context for responsible interpretation
- Flavors, brands, pack sizes, and variants within familiar categories unless directly relevant to a category-expansion mechanism

Primary scope is category-level expansion. Product-level evidence is contextual support, not a separate product-discovery objective.

## 4. Evidence-status language

- **Observed evidence:** A traceable public statement or behavior description.
- **Synthesis:** A bounded interpretation linked to multiple evidence items.
- **Research hypothesis:** A falsifiable explanation not yet accepted.
- **Operational assumption:** A temporary research or measurement choice.
- **Illustrative example:** Non-evidence used to explain a structure.

### Evidence applicability

Every retained evidence item must have one applicability value:

- **Zepto-direct:** The source explicitly describes Zepto behavior.
- **Quick-commerce transferable:** The source describes another quick-commerce context with a stated mechanism plausibly transferable to Zepto.
- **Category-general contextual:** The source explains category behavior without a quick-commerce context.

Every retained item must also include **Transfer rationale**: why the evidence is or is not applicable to Zepto. Category-general contextual evidence must never be presented as direct Zepto-user behavior.

## 5. Sampling strategy

Use purposive, maximum-variation sampling. The goal is directional behavioral depth, not statistical representation.

Track variation across:

- Platforms and source types
- Categories
- Shopping missions
- Behavioral constructs
- Successful, abandoned, and repeated experiments
- Confirming and disconfirming language
- Publication dates

### Provisional manual pilot plan

The pilot will use these **operational assumptions**, not statistical sufficiency thresholds:

- Review 30–40 candidate sources manually.
- Retain approximately 20–25 evidence items.
- Include at least 3 source types.
- Include at least 4 category groups.
- Include at least 5 contradictory or boundary cases.
- Keep every platform at or below 50% of retained evidence.
- Stop or revise early if relevance or context quality is poor.

Scale only if the evidence is relevant, context-rich, traceable, and sufficiently diverse for bounded directional synthesis. Pilot ranges may be revised after human review.

## 6. Collection procedure

1. Approve the starter query matrix.
2. Record query, platform, retrieval date, and result URL.
3. Check source-policy eligibility before storing content.
4. Store minimal permitted excerpts and a researcher paraphrase.
5. Record canonical link, source type, publication date when visible, and capture date.
6. Remove duplicates, spam, copied content, and irrelevant results.
7. Assign a stable evidence ID.
8. Preserve rejection reasons for excluded candidates in lightweight collection notes.

## 7. Evidence-unit structure

Each evidence item should contain:

- Evidence ID
- Source link and source type
- Publication and capture dates where available
- Minimal excerpt
- Neutral paraphrase
- Behavioral context
- Explicit versus inferred fields
- Linked category and shopping mission
- Linked behavioral codes
- Outcome if stated
- Applicability: Zepto-direct, Quick-commerce transferable, or Category-general contextual
- Transfer rationale: why the evidence is or is not applicable to Zepto
- Reviewer state

One item should express one bounded behavioral observation. Split sources containing multiple distinct behaviors.

## 8. Coding procedure

1. Apply only codes supported by the available context.
2. Distinguish explicit statements from researcher or AI inference.
3. Allow multiple codes when behavior genuinely spans constructs.
4. Do not infer demographics or motivation without support.
5. Record uncertainty instead of forcing a code.
6. Review code disagreements during the pilot and refine the codebook once before full collection.

## 9. Synthesis procedure

1. Group evidence by behavioral mechanism and context, not sentiment alone.
2. Compare patterns across source, category, and mission.
3. Search deliberately for counterexamples.
4. Separate recurring evidence from duplicated narratives.
5. Separate Zepto-direct evidence from transferable and category-general context.
6. Draft insights with supporting and opposing evidence IDs, applicability, and transfer rationale.
7. Apply the insight acceptance criteria.
8. Update hypothesis status only after human review.
9. Build behavior models and the PDD from accepted insights.

## 10. Quality controls

- Review a pilot sample manually before scaling.
- Apply the corpus-quality rubric before corpus freeze.
- Require source traceability for every accepted evidence item.
- Require contradictory-evidence search for every candidate insight.
- Require applicability and transfer rationale before synthesis.
- Record prompt/model lineage when AI stages are implemented later.
- Never treat an AI score as statistical confidence.

## 11. Outputs

- Versioned, reviewed evidence corpus
- Evidence map and behavioral concepts
- Updated hypothesis register
- Accepted insights with contradictions
- Behavioral models, JTBD, mental models, and current workarounds
- Product Discovery Document
- Opportunity Solution Tree and Opportunity Briefs

## 12. Human review decisions required before collection

- Initial platforms and source priorities
- Language and geography scope
- Date/recency window
- Approval or revision of the provisional pilot assumptions and early-stop rule
- Category taxonomy depth
- Treatment of broader non-Zepto evidence
- Permitted excerpt-length guidance

## 13. Phase boundary

This protocol authorizes no automated collector, AI agent, database, API, or UI. Those require later review gates.
