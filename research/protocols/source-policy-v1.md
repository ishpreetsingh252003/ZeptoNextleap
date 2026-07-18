# Source Policy v1

- **Status:** Draft v1 — Awaiting human review
- **Owner:** Research Lead
- **Version:** 1.0
- **Last reviewed:** 2026-07-19
- **Purpose:** Define ethical and operational rules for using public discussions as research evidence.

## Core rule

Public visibility does not remove privacy, copyright, platform, or contextual obligations. Collect only what is necessary to support the research purpose.

## Eligible sources

A source may be considered when it is:

- Publicly accessible without joining a private group or bypassing access controls
- Relevant to category consideration, experimentation, purchase, or workaround behavior
- Traceable to a stable URL or documented public location
- Permitted for the proposed access method after terms and technical-policy review
- Free from sensitive personal details that are unnecessary for the research question

Potential sources include public app reviews, public forum or community threads, public product reviews, blogs, news comments where permitted, comparison discussions, and other openly accessible web discussions.

Eligibility is not automatic. Each platform's terms and access rules must be checked before collection.

## Prohibited sources and content

- Private or closed groups, private accounts, direct messages, or leaked material
- Content obtained by bypassing login, paywall, robots controls, or technical restrictions
- Sensitive personal information, including health, financial, identity, precise location, or children's identifying data
- Content where the research value does not justify privacy risk
- Deleted content recovered through unauthorized means
- Credentials, contact details, or persistent personal identifiers
- Sources whose terms prohibit the planned collection method

## Privacy and author handling

- Do not store usernames unless essential for provenance and explicitly approved.
- Use a one-way internal author key only when necessary for deduplication.
- Do not infer identity, demographics, family status, or location from weak cues.
- Report segments only from explicit, relevant context.
- Do not contact authors as part of this research.
- Redact incidental personal details from excerpts and screenshots.

## Copyright and excerpt storage

- Store the minimum excerpt needed to substantiate a behavioral observation.
- Prefer neutral paraphrase plus source link over long verbatim text.
- Do not reproduce complete reviews, threads, articles, or substantial portions.
- Keep screenshots tightly cropped to the necessary evidence and redact unrelated identifiers.
- Preserve author meaning and clearly mark paraphrase versus verbatim excerpt.
- Review permitted quotation length before final publication or deck use.

## Source traceability

Every evidence item must include:

- Stable evidence ID
- Canonical source URL where available
- Platform/source type
- Publication date when visible
- Capture date
- Minimal excerpt or screenshot reference
- Neutral paraphrase
- Access or removal status if later changed

Search-result summaries are discovery aids, not final evidence when the underlying source cannot be verified.

## Platform terms and automated access

- Review applicable terms, robots directives, and published API rules before automated retrieval.
- Prefer official APIs or permitted exports when practical.
- Do not evade rate limits, CAPTCHAs, authentication, or blocking.
- If automated access is unclear, use manual research or exclude the source.
- Document the permitted access method for each included platform.

## Rate limits and collection behavior

- Use conservative per-domain request rates.
- Cache previously retrieved public pages where permitted.
- Deduplicate URLs before retrieval.
- Stop on explicit rate-limit or access-denial responses.
- Do not retry aggressively or distribute requests to bypass controls.
- Set numerical rates only after platform review; none are approved in v1.

## Sensitive category handling

Baby care, health and wellness, and other sensitive contexts require additional caution. Store only behaviorally relevant details, avoid medical interpretation, and exclude personal health narratives when they are not necessary.

## Publication and deletion

- Use anonymized evidence IDs in reports and decks.
- Link to sources when appropriate, but do not expose unnecessary author identity.
- If a source is removed, retain only the minimum research metadata needed to explain prior use, subject to policy review.
- Remove evidence that later presents a material privacy, permission, or accuracy concern.

## Escalation rule

If accessibility, permission, sensitivity, or quotation use is ambiguous, exclude the content until a human review decides otherwise.
