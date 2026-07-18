# Decision Log

- **Status:** Draft v1 — Awaiting human review
- **Owner:** Project Lead
- **Version:** 1.0
- **Last reviewed:** 2026-07-19
- **Purpose:** Record consequential project decisions and their rationale without creating a heavyweight approval process.

## Decision format

Only decisions that change scope, evidence standards, architecture, metrics, or product direction belong here.

| ID | Date | Decision | Rationale | Status / revisit trigger |
|---|---|---|---|---|
| D001 | 2026-07-19 | Use two separate applications: internal research workflow and Zepto-native MVP. | Their users, UX, data, and release concerns differ. | Approved in Architecture v1.1. Revisit only if project scope changes. |
| D002 | 2026-07-19 | Keep the MVP runtime independent from the research application. | Unreviewed AI output must not control the customer experience. | Approved. Research transfers through reviewed artifacts. |
| D003 | 2026-07-19 | Insert behavioral modeling, PDD, and Opportunity Tree between research and PRD. | The project is evaluated on discovery reasoning, not feature volume. | Approved. |
| D004 | 2026-07-19 | Create a structured Research Knowledge Base and evidence explorer later. | Insights, hypotheses, and decisions need source traceability. | Architecture approved; implementation not authorized. |
| D005 | 2026-07-19 | Use specialized, inspectable AI stages rather than an uncontrolled agent swarm. | Narrow contracts improve reviewability and debugging. | Architecture approved; implementation not authorized. |
| D006 | 2026-07-19 | Preserve both lifetime-new and dormant-category metric definitions. | The correct definition depends on business intent and available history. | Open metric decision. |
| D007 | 2026-07-19 | Treat 180 days only as a provisional dormant-category lookback. | No evidence or internal cadence data validates that period. | Must be validated before metric approval. |
| D008 | 2026-07-19 | Optimize review gates for a graduation project. | Each gate should resolve a material decision without enterprise-style overhead. | Approved execution constraint. |
| D009 | 2026-07-19 | Authorize Phase 1 documentation only. | Research foundations must be reviewed before implementation. | Current authorization boundary. |

## Pending decisions

- Monthly Active Customer definition
- Category hierarchy used for measurement
- Dormant-category lookback
- Initial source and language coverage
- Pilot corpus stopping rule
- Acceptable evidence excerpt length by source policy review
