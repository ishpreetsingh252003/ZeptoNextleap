import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { resolveInput } from "./repo-paths";
import { CODE_TO_THEORY_THEMES, OPPORTUNITY_LABELS } from "./behavior-mapping";
import type { BehaviorRecord, InsightsReport } from "./api";

export type SynthesisSources = {
  evidenceRows: Record<string, string>[];
  sourceLogRows: Record<string, string>[];
  theories: BehaviorRecord[];
  commerce: BehaviorRecord[];
  caseStudies: BehaviorRecord[];
  papers: BehaviorRecord[];
};

export type SynthesisPayload = InsightsReport & {
  scoringSummary: {
    opportunities: { id: string; title: string; combinedScore: number; evidenceCount: number; confidenceLevel: string }[];
    evidenceCount: number;
  };
};

function readCsv(realRelativePath: string, bundledRelativePath: string): Record<string, string>[] {
  const file = resolveInput(realRelativePath, bundledRelativePath);
  if (!file) return [];
  return parse(readFileSync(file, "utf-8"), { columns: true, skip_empty_lines: true, bom: true, trim: true }) as Record<string, string>[];
}

function behaviorRecords(rows: Record<string, string>[]): BehaviorRecord[] {
  return rows.map((row) => ({
    id: row.record_id ?? "",
    theme: row.theme ?? "",
    summary: row.summary ?? "",
    source: row.source ?? "",
    opportunityIds: (row.opportunity_ids ?? "").split(";").map((o) => o.trim()).filter(Boolean),
    reviewed: (row.reviewed ?? "").toLowerCase() === "true",
    notes: row.notes ?? "",
  }));
}

function strength(count: number, distinctSources: number): "High" | "Medium" | "Low" {
  if (count >= 3 && distinctSources >= 2) return "High";
  if (count >= 2) return "Medium";
  return "Low";
}

export function loadSynthesisSources(): SynthesisSources {
  return {
    evidenceRows: readCsv("research/pilot/evidence-items.csv", "pilot/evidence-items.csv"),
    sourceLogRows: readCsv("research/pilot/source-log.csv", "pilot/source-log.csv"),
    theories: behaviorRecords(readCsv("research/behavior/behavioural-theories.csv", "behavior/behavioural-theories.csv")),
    commerce: behaviorRecords(readCsv("research/behavior/commerce-insights.csv", "behavior/commerce-insights.csv")),
    caseStudies: behaviorRecords(readCsv("research/behavior/industry-case-studies.csv", "behavior/industry-case-studies.csv")),
    papers: behaviorRecords(readCsv("research/behavior/research-papers.csv", "behavior/research-papers.csv")),
  };
}

export function buildSynthesis(sources: SynthesisSources): InsightsReport {
  const { evidenceRows, sourceLogRows, theories, commerce, caseStudies, papers } = sources;
  const allKnowledge = [...theories, ...commerce, ...caseStudies, ...papers];

  const themeCodes = new Map<string, { evidenceIds: string[]; sources: Set<string>; sourceTypes: Set<string>; categories: Set<string> }>();
  const sentimentCounts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  const sourceCounts: Record<string, number> = {};

  for (const row of evidenceRows) {
    const id = row.evidence_id ?? "";
    const url = row.source_url ?? "";
    const sourceType = row.source_type ?? "";
    const codes = (row.behavioral_codes ?? "").split(";").map((c) => c.trim()).filter(Boolean);
    for (const code of codes) {
      const entry = themeCodes.get(code) ?? { evidenceIds: [], sources: new Set<string>(), sourceTypes: new Set<string>(), categories: new Set<string>() };
      entry.evidenceIds.push(id);
      if (url) entry.sources.add(url);
      if (sourceType) entry.sourceTypes.add(sourceType);
      if (row.category_group) entry.categories.add(row.category_group);
      themeCodes.set(code, entry);
    }
    const sentiment = row.evidence_valence ?? "";
    sentimentCounts[sentiment] = (sentimentCounts[sentiment] ?? 0) + 1;
    const category = row.category_group ?? "";
    categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
    sourceCounts[sourceType] = (sourceCounts[sourceType] ?? 0) + 1;
  }

  const evidenceById = new Map(evidenceRows.map((row) => [row.evidence_id, row]));

  const aiThemes = [...themeCodes.entries()]
    .map(([name, entry]) => {
      const matchedTheoryThemes = CODE_TO_THEORY_THEMES[name] ?? [];
      const matchedTheories = theories.filter((t) => matchedTheoryThemes.includes(t.theme));
      const opportunityIds = [...new Set(matchedTheories.flatMap((t) => t.opportunityIds))];
      return {
        name,
        count: entry.evidenceIds.length,
        distinctSources: entry.sources.size,
        sourceTypes: [...entry.sourceTypes].sort(),
        categories: [...entry.categories].sort(),
        strength: strength(entry.evidenceIds.length, entry.sources.size),
        examples: entry.evidenceIds.slice(0, 2).map((id) => {
          const row = evidenceById.get(id);
          return {
            id,
            excerpt: row?.minimal_permitted_excerpt ?? "",
            category: row?.category_group ?? "",
            sourceType: row?.source_type ?? "",
            date: row?.publication_date ?? "",
          };
        }),
        theoryThemes: matchedTheoryThemes,
        theories: matchedTheories,
        opportunities: opportunityIds.map((id) => ({ id, label: OPPORTUNITY_LABELS[id] ?? id })),
      };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const evidenceCount = evidenceRows.length;
  const sourceLogCount = sourceLogRows.length;
  const knowledgeCounts = {
    theories: theories.length,
    commerceInsights: commerce.length,
    caseStudies: caseStudies.length,
    papers: papers.length,
  };
  const strongCount = aiThemes.filter((t) => t.strength === "High").length;
  const mediumCount = aiThemes.filter((t) => t.strength === "Medium").length;
  const lowCount = aiThemes.filter((t) => t.strength === "Low").length;

  const topThemes = aiThemes.slice(0, 3).map((t) => ({ name: t.name, count: t.count, strength: t.strength }));
  const topCategories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => `${name} (${count})`);

  const narrative = [
    evidenceCount > 0
      ? `${evidenceCount} retained evidence items were coded from ${sourceLogCount} public sources.`
      : "No retained evidence is available yet.",
    aiThemes.length > 0
      ? `${strongCount} behavioural patterns show strong cross-source support, ${mediumCount} show moderate support, and ${lowCount} rest on single items.`
      : "No behavioural patterns have been coded yet.",
    topThemes.length > 0
      ? `The most repeated patterns are ${topThemes.map((t) => `${t.name} (${t.count})`).join(", ")}.`
      : "No leading patterns yet.",
    topCategories.length > 0
      ? `Categories with the strongest coverage are ${topCategories.join(", ")}.`
      : "No category coverage is available yet.",
    `The behavioural knowledge base holds ${knowledgeCounts.theories} theories, ${knowledgeCounts.commerceInsights} commerce insights, ${knowledgeCounts.caseStudies} industry case studies, and ${knowledgeCounts.papers} research papers.`,
    evidenceCount > 0 && (sentimentCounts["confirming"] ?? 0) > 0
      ? `${sentimentCounts["confirming"] ?? 0} items support an identified pattern, ${sentimentCounts["opposing"] ?? 0} oppose it, and ${(sentimentCounts["boundary case"] ?? 0) + (sentimentCounts["mixed"] ?? 0)} remain boundary or mixed and need human review.`
      : "Sentiment distribution is not yet available.",
  ];

  return {
    executiveSummary: {
      evidenceCount,
      sourceCount: sourceLogCount,
      sourceTypes: sourceCounts,
      categories: categoryCounts,
      sentiment: sentimentCounts,
      topThemes,
      topCategories,
      knowledgeCounts,
      strengthDistribution: { high: strongCount, medium: mediumCount, low: lowCount },
      narrative,
    },
    aiThemes,
    behaviouralTheories: theories,
    commerceInsights: commerce,
    industryCaseStudies: caseStudies,
    researchPapers: papers,
  };
}
