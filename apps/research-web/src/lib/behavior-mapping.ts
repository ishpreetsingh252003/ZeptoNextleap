export const VALID_THEMES = new Set([
  "trust",
  "risk",
  "habit",
  "trial",
  "repeat_purchase",
  "abandonment",
  "social_proof",
  "decision_fatigue",
]);

export const CODE_TO_THEORY_THEMES: Record<string, string[]> = {
  Barrier: ["risk", "abandonment"],
  "Category consideration": ["trial"],
  Outcome: ["repeat_purchase", "abandonment"],
  Trigger: ["trial"],
  "Perceived risk": ["risk"],
  "Trust signal": ["trust"],
  "Experiment behavior": ["trial"],
  "Shopping mission": ["habit"],
  "Mental model": ["habit"],
  "Decision criterion": ["decision_fatigue", "risk"],
  "Information need": ["risk", "decision_fatigue"],
  Workaround: ["trust", "abandonment"],
  Habit: ["habit"],
  "Platform selection": ["abandonment"],
};

export const OPPORTUNITY_LABELS: Record<string, string> = {
  opp_quality_assurance: "Quality assurance",
  opp_support_refund: "Support & refunds",
  opp_category_onboarding: "Category onboarding",
  opp_fulfillment_control: "Fulfillment control",
  opp_freshness_guarantee: "Freshness guarantee",
};

export const OPPORTUNITY_TITLES: Record<string, string> = {
  opp_quality_assurance: "Product-Quality Assurance & Authenticity Confidence for Category Trial",
  opp_support_refund: "Refund & Resolution Transparency with Support Escalation Visibility",
  opp_fulfillment_control: "Fulfillment Reliability & Real-Time Item Substitution Control",
  opp_freshness_guarantee: "Guaranteed Freshness & Quality Provenance for Perishable Goods",
  opp_category_onboarding: "Guided Category Onboarding & Trial Incentive Badging",
};

export function deriveThemes(codes: readonly string[]): string[] {
  const themes = new Set<string>();
  for (const code of codes) {
    for (const theme of CODE_TO_THEORY_THEMES[code] ?? []) {
      if (VALID_THEMES.has(theme)) themes.add(theme);
    }
  }
  return [...themes];
}

export function deriveRelevanceTags(codes: readonly string[], valence: string): string[] {
  const tags = new Set<string>();
  if (codes.some((code) => code === "Perceived risk" || code === "Trust signal" || code === "Barrier" || code === "Information need")) {
    tags.add("trust_risk");
  }
  if (codes.some((code) => code === "Platform selection" || code === "Workaround")) {
    tags.add("purchase_elsewhere");
  }
  if (codes.some((code) => code === "Habit" || code === "Experiment behavior" || code === "Outcome")) {
    tags.add("repeat_purchase");
  }
  if (valence === "opposing") {
    tags.add("positive_counterevidence");
  }
  return [...tags];
}
