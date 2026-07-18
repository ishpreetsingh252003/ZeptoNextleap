# Rejected Ideas

- **Status:** Draft v1 — Awaiting human review
- **Owner:** Product Lead
- **Version:** 1.0
- **Last reviewed:** 2026-07-19
- **Purpose:** Preserve intentionally excluded approaches so they are not reintroduced without new evidence.

## Scope note

These are architecture or process rejections from the approved brief. They are not research-derived rejections of customer solutions because no user evidence has been collected.

| ID | Rejected approach | Reason | Reconsider only if |
|---|---|---|---|
| R001 | Begin MVP implementation before research synthesis. | It would anchor the project on an unsupported solution. | PDD and Opportunity Tree are reviewed. |
| R002 | Generic recommendation engine. | It assumes relevance is the core barrier and weakens the behavioral problem framing. | Research identifies recommendation relevance as the strongest tractable mechanism. |
| R003 | Standalone AI dashboard presented as Zepto. | It is not native to the shopping journey. | Never for the Zepto MVP; internal research tooling remains separate. |
| R004 | Chatbot as the Zepto customer feature. | It foregrounds AI rather than solving a validated shopping behavior. | Research and UX evidence support a conversational behavior in a specific journey. |
| R005 | Sentiment analysis as the principal research method. | Sentiment does not explain context, mechanism, workaround, or outcome. | It may be used only as secondary metadata. |
| R006 | Treat “users like discounts” as an insight. | It is generic, lacks a behavioral mechanism, and ignores purchase quality. | A specific incentive mechanism is supported with context and counterevidence. |
| R007 | Separate database tables for every behavioral concept. | It adds schema and maintenance cost without improving the graduation-project outcome. | Scale or integrity needs make the simplified concept/link model insufficient. |
| R008 | Graph database, Kafka, Kubernetes, or autonomous microservice swarm. | Operational complexity exceeds current scale and evidence needs. | Demonstrated load or capability requirements justify them. |
| R009 | Fix the dormant-category window at 180 days. | It is an unvalidated operational assumption. | Internal cadence data or an approved business rule supports it. |
| R010 | Automatically promote AI-generated insights into the PDD or PRD. | Generated synthesis requires evidence and human review. | Never without an explicit human approval step. |
