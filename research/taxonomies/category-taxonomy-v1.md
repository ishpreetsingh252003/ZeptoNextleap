# Category Taxonomy v1

- **Status:** Draft v1 — Awaiting human review
- **Owner:** Product Research Lead
- **Version:** 1.0
- **Last reviewed:** 2026-07-19
- **Purpose:** Provide a provisional category vocabulary for query planning and comparative behavioral analysis.

## Status warning

This is an operational research taxonomy, not Zepto's official category hierarchy. It contains illustrative groupings from the project brief and must be checked against the current product before collection and measurement.

## Taxonomy principles

- Use categories broad enough to compare behavioral risk and consideration.
- Preserve product-level detail in source notes without creating excessive taxonomy depth.
- Assign the narrowest supported category and its parent group.
- Mark ambiguous items as `CAT-UNK` rather than guessing.
- Keep category separate from shopping mission and customer segment.

## Starter hierarchy

| ID | Research category | Illustrative contents | Boundary note |
|---|---|---|---|
| CAT-GRO | Grocery and staples | Grains, pulses, flour, oil, spices, packaged staples | Broad familiar-category comparator; may require subdivision after pilot. |
| CAT-FRE | Fresh produce | Fruits, vegetables, herbs | Quality and freshness may create distinct behavior. |
| CAT-DAI | Dairy and breakfast | Milk, curd, paneer, eggs, cereals, breakfast staples | Frequency varies by product; do not assume one cadence. |
| CAT-SNB | Snacks and beverages | Snacks, confectionery, soft drinks, juices, tea, coffee | Keep alcohol or regulated items outside scope unless separately approved. |
| CAT-RTE | Ready-to-eat and frozen | Prepared meals, instant foods, frozen foods | Convenience mission may overlap; code mission separately. |
| CAT-HOU | Household care | Cleaning, laundry, dishwashing, paper, home utility consumables | Excludes durable home goods unless approved. |
| CAT-PER | Personal care | Skin, hair, oral, grooming, hygiene | Sensitive needs may require careful privacy handling. |
| CAT-HNW | Health and wellness | General wellness, non-sensitive self-care, permitted health products | Do not make medical interpretations; regulated or sensitive content needs review. |
| CAT-BAB | Baby care | Diapers, feeding accessories, baby hygiene and care products | Do not infer parenthood; use only explicit context and protect child-related information. |
| CAT-PET | Pet care | Pet food, treats, hygiene, and basic care products | Animal type and life stage may affect decisions; capture only when explicit. |
| CAT-OTH | Other category | Relevant categories outside the starter set | Describe before deciding whether a new code is needed. |
| CAT-UNK | Unknown or ambiguous | Category cannot be determined responsibly | Never force assignment. |

## Analytical tags

The following are provisional comparison tags, not facts about customer behavior:

- Purchase frequency: high / medium / low / unknown
- Perceived consequence of wrong choice: to be coded from evidence, never preassigned
- Replenishment potential: likely / unclear, pending evidence
- Sensitivity flag: ordinary / potentially sensitive / review required
- Category state for a customer: familiar / lifetime-new / dormant / unknown

## Measurement boundaries to decide

- Whether category expansion is measured at these broad groups or a lower level
- How bundles and cross-category products are classified
- Whether substitutions inherit the intended or fulfilled category
- How taxonomy changes affect historical classification
- Whether dormancy should use one lookback or category-specific windows

## Pilot review questions

- Do public sources use category language that maps cleanly to this hierarchy?
- Are any groups too broad to explain different perceived risks?
- Are any groups too narrow to obtain useful evidence?
- Does the taxonomy accidentally embed an untested behavioral assumption?
