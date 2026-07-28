import { createHash } from "node:crypto";
import { dirname, relative, resolve } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { findRepositoryRoot } from "@zepto/shared-config";

export const candidateColumns = [
  "candidate_id",
  "query_id",
  "category",
  "behavior_focus",
  "search_query",
  "title",
  "domain",
  "url",
  "snippet",
  "source_type",
  "fetch_eligibility",
  "manual_review_required",
  "duplicate_group",
  "approval_status",
  "review_note"
] as const;

export type ResearchCandidate = Record<
  (typeof candidateColumns)[number],
  string
>;

export type PriorityBand = "A" | "B" | "C" | "D";
export type RecommendedAction =
  | "review_first"
  | "review_manual"
  | "fetch_after_approval"
  | "backup"
  | "exclude_catalogue"
  | "exclude_duplicate"
  | "exclude_irrelevant";

export type PrioritizedCandidate = ResearchCandidate & {
  priority_score: number;
  priority_band: PriorityBand;
  priority_reasons: string[];
  quality_flags: string[];
  content_cluster_id: string;
  cluster_size: number;
  cluster_representative: boolean;
  category_coverage_bonus: number;
  behavior_coverage_bonus: number;
  source_coverage_bonus: number;
  recommended_action: RecommendedAction;
};

export type CandidatePriorityReport = {
  candidateCount: number;
  bands: Record<PriorityBand, number>;
  shortlist: PrioritizedCandidate[];
  shortlistBySource: Record<string, number>;
  shortlistByCategory: Record<string, number>;
  shortlistByBehavior: Record<string, number>;
  excludedCatalogueCount: number;
  excludedDuplicateCount: number;
  weakAreas: string[];
  outputPath: string | null;
};

type BaseScore = {
  score: number;
  reasons: string[];
  flags: string[];
  behavioralSignalCount: number;
  hardExclusion: "catalogue" | "irrelevant" | null;
};

/*
 * Every weight is named here so reviewers can debate the policy without
 * reverse-engineering arithmetic. Scores indicate review priority, not truth.
 */
export const priorityWeights = {
  explicitZepto: 15,
  explicitCategory: 10,
  firstPersonExperience: 12,
  behavioralLanguage: 18,
  clearOutcome: 8,
  userGeneratedSource: 8,
  positiveOrContradictory: 6,
  usablePublicUrl: 5,
  genericNoBehavior: -22,
  promotional: -20,
  insufficientSocialContext: -12,
  weakCategoryMatch: -18,
  unrelatedPricing: -14,
  ambiguousPremiumMatch: -12
} as const;

const behavioralPatterns = [
  /\b(?:bought|buy|purchase|purchased|ordered|ordering)\b/iu,
  /\b(?:try|trial|tried|experiment)\b/iu,
  /\b(?:abandon|cancel|avoid|stop(?:ped)? using|never buy)\b/iu,
  /\b(?:reorder|repeat|again|regularly)\b/iu,
  /\b(?:trust|authentic|genuine|fake)\b/iu,
  /\b(?:fresh|freshness|quality|expired|rotten|spoiled)\b/iu,
  /\b(?:elsewhere|offline|local shop|instead|pharmacy)\b/iu
];

const outcomePattern =
  /\b(?:received|delivered|returned|refund|exchange|switched|stopped|reordered|bought elsewhere|went to|chose|avoided)\b/iu;
const firstPersonPattern =
  /\b(?:i|i'm|i've|i'd|my|me|we|our|us)\b/iu;
const positivePattern =
  /\b(?:good|great|genuine|fresh|trusted|satisfied|recommend|worked|love|positive)\b/iu;
const promotionalPattern =
  /\b(?:best price|shop now|buy .* online|delivery in mins|we are .*live|offer|deal starts|products near you)\b/iu;
const pricingPattern = /\b(?:fee|price|pricing|expensive|cost|charge)\b/iu;

const categoryTerms: Record<string, readonly string[]> = {
  "pet care": ["pet", "cat food", "dog food"],
  "baby care": ["baby", "diaper", "infant"],
  "personal care": ["personal care", "hygiene", "shampoo", "soap"],
  "health and wellness": [
    "health",
    "wellness",
    "supplement",
    "protein",
    "vitamin",
    "pharmacy"
  ],
  "beauty and skincare": ["beauty", "skincare", "skin care", "makeup"],
  "fresh produce": ["fruit", "vegetable", "produce", "tomato"],
  "meat and seafood": ["meat", "seafood", "chicken", "fish"],
  "premium/high-value packaged products": [
    "premium",
    "luxury",
    "high-value",
    "expensive"
  ]
};

const userGeneratedSources = new Set([
  "reddit",
  "social_media",
  "trustpilot",
  "app_store"
]);

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function candidateText(candidate: ResearchCandidate): string {
  return `${candidate.title} ${candidate.snippet}`;
}

function matchesCategory(candidate: ResearchCandidate): boolean {
  const text = normalize(candidateText(candidate));
  return (categoryTerms[normalize(candidate.category)] ?? [
    normalize(candidate.category)
  ]).some((term) => text.includes(normalize(term)));
}

function validPublicUrl(raw: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(raw).protocol);
  } catch {
    return false;
  }
}

function baseScore(candidate: ResearchCandidate): BaseScore {
  const text = candidateText(candidate);
  const normalizedText = normalize(text);
  const reasons: string[] = [];
  const flags: string[] = [];
  let score = 25;
  const add = (points: number, reason: string) => {
    score += points;
    reasons.push(`${points > 0 ? "+" : ""}${points} ${reason}`);
  };

  const catalogue =
    candidate.source_type === "product_catalogue"
    || candidate.fetch_eligibility === "product_catalogue";
  if (catalogue) {
    return {
      score: 0,
      reasons: ["hard exclusion: product catalogue"],
      flags: ["PRODUCT_CATALOGUE"],
      behavioralSignalCount: 0,
      hardExclusion: "catalogue"
    };
  }

  if (/\bzepto\b/iu.test(text)) {
    add(priorityWeights.explicitZepto, "explicit Zepto mention");
  }
  const categoryMatch = matchesCategory(candidate);
  if (categoryMatch) {
    add(priorityWeights.explicitCategory, "explicit category match");
  } else {
    add(priorityWeights.weakCategoryMatch, "weak category match");
    flags.push("WEAK_CATEGORY_MATCH");
  }
  if (firstPersonPattern.test(text)) {
    add(priorityWeights.firstPersonExperience, "first-person experience");
  }
  const behavioralSignalCount = behavioralPatterns.filter(
    (pattern) => pattern.test(text)
  ).length;
  if (behavioralSignalCount > 0) {
    add(
      priorityWeights.behavioralLanguage,
      "purchase or category-behavior language"
    );
  }
  if (outcomePattern.test(text)) {
    add(priorityWeights.clearOutcome, "clear user outcome");
  }
  if (userGeneratedSources.has(candidate.source_type)) {
    add(priorityWeights.userGeneratedSource, "user-generated source");
  }
  if (positivePattern.test(text)) {
    add(
      priorityWeights.positiveOrContradictory,
      "positive or contradictory counterevidence"
    );
  }
  if (validPublicUrl(candidate.url)) {
    add(priorityWeights.usablePublicUrl, "usable public URL");
  }
  if (behavioralSignalCount === 0) {
    add(priorityWeights.genericNoBehavior, "generic content without behavior");
    flags.push("NO_BEHAVIORAL_SIGNAL");
  }
  if (promotionalPattern.test(text)) {
    add(priorityWeights.promotional, "promotional or catalogue-like language");
    flags.push("PROMOTIONAL_CONTENT");
  }
  if (
    candidate.source_type === "social_media"
    && normalizedText.length < 90
  ) {
    add(
      priorityWeights.insufficientSocialContext,
      "social snippet has insufficient visible context"
    );
    flags.push("MANUAL_CONTEXT_REQUIRED");
  } else if (candidate.manual_review_required === "true") {
    flags.push("MANUAL_CONTEXT_REQUIRED");
  }
  if (
    pricingPattern.test(text)
    && behavioralSignalCount === 0
  ) {
    add(priorityWeights.unrelatedPricing, "pricing without category behavior");
    flags.push("BROAD_PRICING_ONLY");
  }
  if (
    normalize(candidate.category)
      === "premium high value packaged products"
    && !/\b(?:premium|luxury|high-value|expensive|costly|authentic|genuine)\b/iu
      .test(text)
  ) {
    add(
      priorityWeights.ambiguousPremiumMatch,
      "ambiguous premium/high-value match"
    );
    flags.push("AMBIGUOUS_PREMIUM_MATCH");
  }

  const clearlyIrrelevant =
    !categoryMatch
    && behavioralSignalCount === 0
    && !firstPersonPattern.test(text);
  if (clearlyIrrelevant) {
    flags.push("CLEARLY_IRRELEVANT");
  }
  return {
    score: Math.max(0, Math.min(100, score)),
    reasons,
    flags,
    behavioralSignalCount,
    hardExclusion: clearlyIrrelevant ? "irrelevant" : null
  };
}

function canonicalPage(raw: string): string {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLocaleLowerCase("en").replace(/^www\./u, "");
    const path = url.pathname.replace(/\/+$/u, "") || "/";
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (
        key.toLocaleLowerCase("en").startsWith("utm_")
        || ["fbclid", "gclid"].includes(key.toLocaleLowerCase("en"))
      ) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    return `${host}${path}${url.search}`;
  } catch {
    return normalize(raw);
  }
}

const stopWords = new Set([
  "a", "an", "and", "are", "at", "for", "from", "in", "is", "it", "of",
  "on", "or", "the", "this", "to", "with", "you", "your"
]);

function tokens(value: string): Set<string> {
  return new Set(
    normalize(value).split(" ").filter(
      (token) => token.length > 2 && !stopWords.has(token)
    )
  );
}

function jaccard(first: Set<string>, second: Set<string>): number {
  if (first.size === 0 || second.size === 0) return 0;
  const intersection = [...first].filter((token) => second.has(token)).length;
  return intersection / (first.size + second.size - intersection);
}

function sameContent(
  first: ResearchCandidate,
  second: ResearchCandidate
): boolean {
  const firstPage = canonicalPage(first.url);
  const secondPage = canonicalPage(second.url);
  if (firstPage === secondPage) return true;
  const firstHost = firstPage.split("/")[0];
  const secondHost = secondPage.split("/")[0];
  if (firstHost !== secondHost) return false;
  const titleSimilarity = jaccard(tokens(first.title), tokens(second.title));
  const snippetSimilarity = jaccard(tokens(first.snippet), tokens(second.snippet));
  return (
    (titleSimilarity === 1 && snippetSimilarity >= 0.65)
    || (titleSimilarity >= 0.86 && snippetSimilarity >= 0.78)
  );
}

function clusters(candidates: readonly ResearchCandidate[]): number[][] {
  const parent = candidates.map((_, index) => index);
  const root = (index: number): number => {
    let current = index;
    while (parent[current] !== current) {
      current = parent[current] ?? current;
    }
    return current;
  };
  const unite = (first: number, second: number) => {
    const firstRoot = root(first);
    const secondRoot = root(second);
    if (firstRoot !== secondRoot) parent[secondRoot] = firstRoot;
  };
  for (let first = 0; first < candidates.length; first += 1) {
    for (let second = first + 1; second < candidates.length; second += 1) {
      if (sameContent(candidates[first]!, candidates[second]!)) {
        unite(first, second);
      }
    }
  }
  const grouped = new Map<number, number[]>();
  candidates.forEach((_, index) => {
    const key = root(index);
    grouped.set(key, [...(grouped.get(key) ?? []), index]);
  });
  return [...grouped.values()];
}

function frequency(
  candidates: readonly ResearchCandidate[],
  field: "category" | "behavior_focus" | "source_type"
): Map<string, number> {
  const result = new Map<string, number>();
  for (const candidate of candidates) {
    result.set(candidate[field], (result.get(candidate[field]) ?? 0) + 1);
  }
  return result;
}

function coverageBonus(count: number, dimension: "category" | "behavior" | "source"): number {
  if (dimension === "category") return count <= 4 ? 4 : count <= 8 ? 2 : 0;
  if (dimension === "behavior") return count <= 32 ? 2 : 0;
  return count <= 2 ? 4 : count <= 7 ? 2 : 0;
}

function band(score: number, hardExclusion: boolean): PriorityBand {
  if (hardExclusion || score < 25) return "D";
  if (score >= 70) return "A";
  if (score >= 50) return "B";
  return "C";
}

function action(
  candidate: ResearchCandidate,
  priorityBand: PriorityBand,
  exclusion: "catalogue" | "irrelevant" | "duplicate" | null
): RecommendedAction {
  if (exclusion === "catalogue") return "exclude_catalogue";
  if (exclusion === "duplicate") return "exclude_duplicate";
  if (exclusion === "irrelevant" || priorityBand === "D") {
    return "exclude_irrelevant";
  }
  if (
    candidate.manual_review_required === "true"
    || ["manual_only", "manual_review"].includes(candidate.fetch_eligibility)
  ) {
    return "review_manual";
  }
  if (candidate.fetch_eligibility === "fetch_candidate") {
    return "fetch_after_approval";
  }
  return priorityBand === "A" ? "review_first" : "backup";
}

function countBy(
  candidates: readonly PrioritizedCandidate[],
  field: "source_type" | "category" | "behavior_focus"
): Record<string, number> {
  return Object.fromEntries(
    [...frequency(candidates, field).entries()].sort(([a], [b]) =>
      a.localeCompare(b)
    )
  );
}

function weakAreas(candidates: readonly ResearchCandidate[]): string[] {
  const areas: string[] = [];
  for (const category of [
    "beauty and skincare",
    "premium/high-value packaged products"
  ]) {
    const relevant = candidates.filter((candidate) =>
      candidate.category === category
      && baseScore(candidate).hardExclusion === null
      && baseScore(candidate).score >= 50
    ).length;
    if (relevant < 4) {
      areas.push(
        `${category}: only ${relevant} candidates currently clear the useful-backup threshold`
      );
    }
  }
  const babyRelevant = candidates.filter((candidate) => {
    const score = baseScore(candidate);
    return (
      candidate.category === "baby care"
      && /\bzepto\b/iu.test(candidateText(candidate))
      && score.behavioralSignalCount > 0
      && firstPersonPattern.test(candidateText(candidate))
      && !score.flags.includes("PROMOTIONAL_CONTENT")
    );
  }).length;
  if (babyRelevant < 4) {
    areas.push(
      `baby care relevance: only ${babyRelevant} candidates combine Zepto, category, and behavioral context`
    );
  }
  const allText = candidates.map(candidateText);
  const repeatCount = allText.filter((text) =>
    /\b(?:reorder|repeat|again|regularly)\b/iu.test(text)
  ).length;
  const positiveCount = allText.filter((text) =>
    positivePattern.test(text)
    && firstPersonPattern.test(text)
    && outcomePattern.test(text)
  ).length;
  if (repeatCount < 4) {
    areas.push(`repeat purchase: only ${repeatCount} candidates contain an explicit signal`);
  }
  if (positiveCount < 5) {
    areas.push(`positive counterevidence: only ${positiveCount} candidates contain an explicit signal`);
  }
  return areas;
}

export function prioritizeCandidates(
  candidates: readonly ResearchCandidate[]
): {
  candidates: PrioritizedCandidate[];
  report: Omit<CandidatePriorityReport, "outputPath">;
} {
  const baseScores = candidates.map(baseScore);
  const categoryCounts = frequency(candidates, "category");
  const behaviorCounts = frequency(candidates, "behavior_focus");
  const sourceCounts = frequency(candidates, "source_type");
  const clusterList = clusters(candidates);
  const clusterDetails = new Map<number, {
    id: string;
    size: number;
    representative: number;
  }>();

  for (const members of clusterList) {
    const representative = [...members].sort((first, second) => {
      const firstBase = baseScores[first]!;
      const secondBase = baseScores[second]!;
      const accessRank = (value: string) =>
        value === "fetch_candidate" ? 3
          : value === "manual_only" ? 2
            : value === "manual_review" ? 1 : 0;
      return (
        secondBase.score - firstBase.score
        || secondBase.behavioralSignalCount - firstBase.behavioralSignalCount
        || accessRank(candidates[second]!.fetch_eligibility)
          - accessRank(candidates[first]!.fetch_eligibility)
        || candidates[first]!.candidate_id.localeCompare(
          candidates[second]!.candidate_id
        )
      );
    })[0]!;
    const identity = members
      .map((index) => candidates[index]!.candidate_id)
      .sort()
      .join("\0");
    const id = `cluster_${createHash("sha256")
      .update(identity, "utf8")
      .digest("hex")
      .slice(0, 12)}`;
    for (const member of members) {
      clusterDetails.set(member, {
        id,
        size: members.length,
        representative
      });
    }
  }

  const prioritized = candidates.map((candidate, index) => {
    const base = baseScores[index]!;
    const cluster = clusterDetails.get(index)!;
    const duplicate = cluster.size > 1 && cluster.representative !== index;
    const categoryBonus = coverageBonus(
      categoryCounts.get(candidate.category) ?? 0,
      "category"
    );
    const behaviorBonus = coverageBonus(
      behaviorCounts.get(candidate.behavior_focus) ?? 0,
      "behavior"
    );
    const sourceBonus = coverageBonus(
      sourceCounts.get(candidate.source_type) ?? 0,
      "source"
    );
    const totalCoverageBonus = Math.min(
      10,
      categoryBonus + behaviorBonus + sourceBonus
    );
    const exclusion = duplicate ? "duplicate" as const : base.hardExclusion;
    const score = exclusion
      ? 0
      : Math.min(100, base.score + totalCoverageBonus);
    const priorityBand = band(score, exclusion !== null);
    return {
      ...candidate,
      priority_score: score,
      priority_band: priorityBand,
      priority_reasons: [
        ...base.reasons,
        ...(totalCoverageBonus > 0
          ? [`+${totalCoverageBonus} capped coverage diversity`]
          : [])
      ],
      quality_flags: [
        ...base.flags,
        ...(duplicate ? ["NEAR_DUPLICATE_NON_REPRESENTATIVE"] : [])
      ],
      content_cluster_id: cluster.id,
      cluster_size: cluster.size,
      cluster_representative: cluster.representative === index,
      category_coverage_bonus: categoryBonus,
      behavior_coverage_bonus: behaviorBonus,
      source_coverage_bonus: sourceBonus,
      recommended_action: action(candidate, priorityBand, exclusion)
    };
  }).sort((first, second) =>
    second.priority_score - first.priority_score
    || first.candidate_id.localeCompare(second.candidate_id)
  );

  const eligible = prioritized.filter(({ priority_band }) =>
    priority_band !== "D"
  );
  const shortlist: PrioritizedCandidate[] = [];
  const sourceShortlistCounts = new Map<string, number>();
  const shortlistLimit = Math.min(40, eligible.length);
  const sourceLimit = Math.max(1, Math.floor(shortlistLimit * 0.6));
  for (const candidate of eligible) {
    if (shortlist.length >= shortlistLimit) break;
    const current = sourceShortlistCounts.get(candidate.source_type) ?? 0;
    if (current >= sourceLimit) continue;
    shortlist.push(candidate);
    sourceShortlistCounts.set(candidate.source_type, current + 1);
  }

  return {
    candidates: prioritized,
    report: {
      candidateCount: prioritized.length,
      bands: {
        A: prioritized.filter(({ priority_band }) => priority_band === "A").length,
        B: prioritized.filter(({ priority_band }) => priority_band === "B").length,
        C: prioritized.filter(({ priority_band }) => priority_band === "C").length,
        D: prioritized.filter(({ priority_band }) => priority_band === "D").length
      },
      shortlist,
      shortlistBySource: countBy(shortlist, "source_type"),
      shortlistByCategory: countBy(shortlist, "category"),
      shortlistByBehavior: countBy(shortlist, "behavior_focus"),
      excludedCatalogueCount: prioritized.filter(
        ({ quality_flags }) => quality_flags.includes("PRODUCT_CATALOGUE")
      ).length,
      excludedDuplicateCount: prioritized.filter(
        ({ recommended_action }) => recommended_action === "exclude_duplicate"
      ).length,
      weakAreas: weakAreas(candidates)
    }
  };
}

function csvCell(value: string): string {
  return /[",\r\n]/u.test(value)
    ? `"${value.replaceAll("\"", "\"\"")}"`
    : value;
}

export function parseCandidateCsv(csvText: string): ResearchCandidate[] {
  const rows = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
    relax_column_count: false
  }) as Array<Record<string, string>>;
  const headers = Object.keys(rows[0] ?? {});
  const missing = candidateColumns.filter((column) => !headers.includes(column));
  if (missing.length > 0) {
    throw new Error(`Candidate CSV is missing columns: ${missing.join(", ")}`);
  }
  return rows.map((row) =>
    Object.fromEntries(candidateColumns.map((column) => [
      column,
      row[column] ?? ""
    ])) as ResearchCandidate
  );
}

export async function runCandidatePrioritization(options: {
  inputPath: string;
  outputPath?: string;
}): Promise<CandidatePriorityReport> {
  const candidates = parseCandidateCsv(
    await readFile(options.inputPath, "utf8")
  );
  const result = prioritizeCandidates(candidates);
  if (options.outputPath) {
    const root = findRepositoryRoot();
    if (!root) throw new Error("Repository root could not be resolved.");
    const outputPath = resolve(options.outputPath);
    const repositoryPath = relative(root, outputPath).replaceAll("\\", "/");
    if (
      repositoryPath === ""
      || repositoryPath === ".."
      || repositoryPath.startsWith("../")
      || !repositoryPath.startsWith("research/discovery-output/")
    ) {
      throw new Error(
        "Output must use the Git-ignored research/discovery-output/ directory."
      );
    }
    const extraColumns = [
      "priority_score",
      "priority_band",
      "priority_reasons",
      "quality_flags",
      "content_cluster_id",
      "cluster_size",
      "cluster_representative",
      "category_coverage_bonus",
      "behavior_coverage_bonus",
      "source_coverage_bonus",
      "recommended_action"
    ] as const;
    const header = [...candidateColumns, ...extraColumns];
    const body = result.candidates.map((candidate) =>
      header.map((column) => {
        const value = candidate[column];
        return Array.isArray(value) ? value.join("; ") : String(value);
      }).map(csvCell).join(",")
    );
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(
      outputPath,
      `${header.join(",")}\n${body.join("\n")}\n`,
      { encoding: "utf8", flag: "wx" }
    );
  }
  return {
    ...result.report,
    outputPath: options.outputPath ? resolve(options.outputPath) : null
  };
}
