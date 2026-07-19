# Insight Acceptance Criteria v1

- **Status:** Draft v1.1 — Awaiting human review
- **Owner:** Product Research Lead
- **Version:** 1.1
- **Last reviewed:** 2026-07-19
- **Purpose:** Prevent weak, unsupported, duplicated, or non-actionable research statements from becoming approved insights.

## Required insight structure

Every candidate insight must state:

- Observed behavior
- Context or shopping mission
- Affected segment or boundary, when supported
- Behavioral mechanism
- Current workaround or alternative, when present
- Outcome or consequence
- Supporting evidence IDs
- Opposing or contradictory evidence IDs, or a documented search with none found
- Applicability: Zepto-direct, Quick-commerce transferable, or Category-general contextual
- Transfer rationale: why the evidence is or is not applicable to Zepto
- Evidence-strength rationale
- Product implication expressed as an opportunity, not a predetermined feature
- Limitations and open questions

## Acceptance tests

A candidate insight may be approved only when all tests pass.

### 1. Behavioral, not sentiment-only

- **Accept:** Explains what people do, in what context, and why the behavior may occur.
- **Reject:** “Users dislike high prices” without a decision, workaround, or outcome.

### 2. Traceable

- **Accept:** Every material claim links to accessible, policy-compliant evidence.
- **Reject:** Relies on an AI summary, search snippet, memory, or unverifiable source.

### 3. Appropriately bounded

- **Accept:** Names the contexts, categories, sources, and limitations represented.
- **Reject:** Converts a small public corpus into “Zepto users always” or a population percentage.

### 4. No causal overstatement

- **Accept:** Uses language such as “appears associated with,” “participants described,” or “may contribute,” as warranted.
- **Reject:** Claims that a factor caused purchase behavior without valid causal evidence.

### 5. Supported beyond duplication

- **Accept:** Recurrence comes from independent evidence or one rich case is explicitly labeled as a case.
- **Reject:** Counts reposts, copied reviews, or one thread's replies as independent confirmation.

### 6. Contradiction checked

- **Accept:** Includes opposing cases, boundary conditions, or a documented disconfirming search.
- **Reject:** Searches only for confirming language or hides conflicting evidence.

### 7. Distinct

- **Accept:** Adds a materially different mechanism, context, segment, or implication.
- **Reject:** Restates an existing insight with different wording.

### 8. Actionable at the opportunity level

- **Accept:** Identifies a behavior or condition Zepto could plausibly influence and what change would be valuable.
- **Reject:** Is too generic to guide an opportunity or prescribes a feature without establishing the problem.

### 9. Separates observation from inference

- **Accept:** Labels observed evidence, synthesis, and hypothesis separately.
- **Reject:** Presents inferred motivation, demographics, or mental models as direct fact.

### 10. Useful to the business goal

- **Accept:** Explains category consideration, experimentation, purchase, dormant reactivation, or repeat behavior. Product-level trial is used only when it explains one of these category-level mechanisms.
- **Reject:** Describes unrelated satisfaction, operational friction, or a flavor, brand, pack-size, or variant trial within a familiar category with no credible link to category expansion.

### 11. Applicability and transfer are explicit

- **Accept:** Distinguishes Zepto-direct evidence from quick-commerce-transferable and category-general context, with a specific transfer rationale.
- **Reject:** Presents category-general or another platform's evidence as direct Zepto-user behavior, or assumes transfer without explaining the shared mechanism and limitations.

## Automatic rejection conditions

- Sentiment-only conclusion
- No source link or evidence ID
- Invented evidence, statistic, segment, or motive
- Unsupported causal language
- Unresolved copyright, privacy, or source-policy issue
- Duplicate of an accepted insight
- Solution disguised as an insight
- No plausible relationship to category-expansion behavior
- Category-general evidence presented as direct Zepto-user behavior
- Missing applicability label or transfer rationale

## Review outcomes

- **Approve:** All acceptance tests pass.
- **Revise:** The mechanism may be useful but evidence, boundaries, or wording are incomplete.
- **Hold:** Insufficient evidence; retain as a hypothesis or open question.
- **Reject:** Fails a core requirement or duplicates existing knowledge.

## Evidence strength

Use the qualitative bands **Weak**, **Directional**, **Strong**, and **Strong with counterevidence**. The label expresses corpus support, not statistical confidence. No candidate insight has a strength rating until evidence exists.
