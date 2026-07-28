import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  candidateColumns,
  parseCandidateCsv,
  prioritizeCandidates,
  runCandidatePrioritization,
  type ResearchCandidate
} from "./candidate-prioritization.js";

const temporaryDirectories: string[] = [];

function candidate(
  overrides: Partial<ResearchCandidate> = {}
): ResearchCandidate {
  return {
    candidate_id: "candidate_000000000001",
    query_id: "query_1",
    category: "pet care",
    behavior_focus: "trust_or_consideration",
    search_query: "Zepto pet food trust",
    title: "My Zepto pet food order",
    domain: "example.com",
    url: "https://example.com/review/1",
    snippet:
      "I ordered pet food from Zepto, received a fresh genuine pack, and reordered.",
    source_type: "reddit",
    fetch_eligibility: "manual_only",
    manual_review_required: "true",
    duplicate_group: "",
    approval_status: "pending",
    review_note: "",
    ...overrides
  };
}

function csv(rows: readonly ResearchCandidate[]): string {
  const cell = (value: string) =>
    /[",\r\n]/u.test(value)
      ? `"${value.replaceAll("\"", "\"\"")}"`
      : value;
  return [
    candidateColumns.join(","),
    ...rows.map((row) =>
      candidateColumns.map((column) => cell(row[column])).join(",")
    )
  ].join("\n");
}

async function temporaryFile(
  name: string,
  content: string
): Promise<{ directory: string; path: string }> {
  const directory = await mkdtemp(join(tmpdir(), "candidate-priority-"));
  temporaryDirectories.push(directory);
  const path = join(directory, name);
  await writeFile(path, content, "utf8");
  return { directory, path };
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("candidate prioritization", () => {
  it("is deterministic and never changes approval status", () => {
    const input = [
      candidate(),
      candidate({
        candidate_id: "candidate_000000000002",
        url: "https://example.org/review/2",
        approval_status: "rejected"
      })
    ];
    const first = prioritizeCandidates(input);
    const second = prioritizeCandidates(input);
    expect(first).toEqual(second);
    expect(first.candidates.map(({ approval_status }) => approval_status))
      .toEqual(expect.arrayContaining(["pending", "rejected"]));
  });

  it("hard-excludes product catalogue pages", () => {
    const prioritized = prioritizeCandidates([candidate({
      source_type: "product_catalogue",
      fetch_eligibility: "product_catalogue"
    })]);
    const result = prioritized.candidates[0]!;
    expect(result).toMatchObject({
      priority_score: 0,
      priority_band: "D",
      recommended_action: "exclude_catalogue"
    });
    expect(prioritized.report.excludedCatalogueCount).toBe(1);
  });

  it("scores explicit behavior above generic promotional content", () => {
    const behavioral = candidate();
    const promotional = candidate({
      candidate_id: "candidate_000000000002",
      url: "https://shop.example.org/pet",
      title: "Buy pet food online at best price",
      snippet: "Shop now for offers and delivery in mins.",
      source_type: "public_web",
      manual_review_required: "false"
    });
    const results = prioritizeCandidates([behavioral, promotional]).candidates;
    const score = (id: string) =>
      results.find(({ candidate_id }) => candidate_id === id)!.priority_score;
    expect(score(behavioral.candidate_id)).toBeGreaterThan(
      score(promotional.candidate_id)
    );
  });

  it("caps total coverage bonus and cannot promote irrelevant content", () => {
    const irrelevant = candidate({
      category: "beauty and skincare",
      title: "Corporate expansion update",
      snippet: "A market summary about logistics infrastructure.",
      source_type: "rare_source",
      url: "https://rare.example/corporate"
    });
    const result = prioritizeCandidates([
      irrelevant,
      ...Array.from({ length: 12 }, (_, index) => candidate({
        candidate_id: `candidate_pet_${index}`,
        url: `https://example.com/review/${index + 2}`
      }))
    ]).candidates.find(
      ({ candidate_id }) => candidate_id === irrelevant.candidate_id
    )!;
    expect(
      result.category_coverage_bonus
      + result.behavior_coverage_bonus
      + result.source_coverage_bonus
    ).toBeLessThanOrEqual(10);
    expect(result.priority_band).toBe("D");
    expect(result.recommended_action).toBe("exclude_irrelevant");
  });

  it("clusters exact URLs and chooses a representative deterministically", () => {
    const weaker = candidate({
      candidate_id: "candidate_a",
      title: "Zepto pet food",
      snippet: "Pet food listing."
    });
    const stronger = candidate({
      candidate_id: "candidate_b",
      title: "My Zepto pet food order",
      snippet:
        "I ordered pet food, found it spoiled, returned it, and bought elsewhere."
    });
    const results = prioritizeCandidates([weaker, stronger]).candidates;
    expect(new Set(results.map(({ content_cluster_id }) => content_cluster_id)))
      .toHaveLength(1);
    expect(results.find(({ candidate_id }) =>
      candidate_id === "candidate_b"
    )?.cluster_representative).toBe(true);
    expect(results.find(({ candidate_id }) =>
      candidate_id === "candidate_a"
    )?.recommended_action).toBe("exclude_duplicate");
  });

  it("clusters conservative same-domain title/snippet variants", () => {
    const results = prioritizeCandidates([
      candidate({
        candidate_id: "candidate_a",
        url: "https://forum.example/thread/1",
        title: "My rotten pet food order from Zepto",
        snippet: "I ordered cat food and received a spoiled pack from Zepto."
      }),
      candidate({
        candidate_id: "candidate_b",
        url: "https://forum.example/thread/1?ref=search",
        title: "My rotten pet food order from Zepto",
        snippet: "I ordered cat food and received a spoiled pack from Zepto today."
      })
    ]).candidates;
    expect(results[0]?.content_cluster_id)
      .toBe(results[1]?.content_cluster_id);
  });

  it("does not cluster unrelated pages", () => {
    const results = prioritizeCandidates([
      candidate({ candidate_id: "candidate_a" }),
      candidate({
        candidate_id: "candidate_b",
        url: "https://example.com/different",
        title: "Vegetable delivery complaint",
        snippet: "I received rotten tomatoes and bought vegetables offline instead.",
        category: "fresh produce"
      })
    ]).candidates;
    expect(results[0]?.content_cluster_id)
      .not.toBe(results[1]?.content_cluster_id);
  });

  it("preserves meaningful query parameters when separating pages", () => {
    const results = prioritizeCandidates([
      candidate({
        candidate_id: "candidate_video_a",
        url: "https://video.example/watch?v=one",
        title: "Zepto category review",
        snippet: "I ordered pet food and received a genuine fresh pack."
      }),
      candidate({
        candidate_id: "candidate_video_b",
        url: "https://video.example/watch?v=two",
        title: "Zepto category review",
        snippet: "A company announcement about a warehouse opening."
      })
    ]).candidates;
    expect(results[0]?.content_cluster_id)
      .not.toBe(results[1]?.content_cluster_id);
  });

  it("keeps report-only execution offline and writes no output", async () => {
    const { directory, path } = await temporaryFile(
      "candidates.csv",
      csv([candidate()])
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const output = join(directory, "unexpected.csv");
    const report = await runCandidatePrioritization({ inputPath: path });
    await expect(access(output)).rejects.toThrow();
    expect(report.outputPath).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects repository output outside the configured ignored path", async () => {
    const { path } = await temporaryFile(
      "candidates.csv",
      csv([candidate()])
    );
    await expect(runCandidatePrioritization({
      inputPath: path,
      outputPath: join(process.cwd(), "candidate-output.csv")
    })).rejects.toThrow("Git-ignored");
  });

  it("keeps shortlist source concentration at or below 60% where possible", () => {
    const input = [
      ...Array.from({ length: 30 }, (_, index) => candidate({
        candidate_id: `candidate_social_${index}`,
        url: `https://social-${index}.example/post`,
        source_type: "social_media"
      })),
      ...Array.from({ length: 15 }, (_, index) => candidate({
        candidate_id: `candidate_reddit_${index}`,
        url: `https://reddit-${index}.example/post`,
        source_type: "reddit"
      })),
      ...Array.from({ length: 15 }, (_, index) => candidate({
        candidate_id: `candidate_forum_${index}`,
        url: `https://forum-${index}.example/post`,
        source_type: "public_article_or_forum"
      }))
    ];
    const { shortlist, shortlistBySource } =
      prioritizeCandidates(input).report;
    const largest = Math.max(...Object.values(shortlistBySource));
    expect(shortlist.length).toBe(40);
    expect(largest / shortlist.length).toBeLessThanOrEqual(0.6);
  });

  it("reports weak categories instead of filling them with irrelevant rows", () => {
    const result = prioritizeCandidates([
      candidate(),
      candidate({
        candidate_id: "candidate_beauty",
        category: "beauty and skincare",
        title: "Corporate supply-chain announcement",
        snippet: "A general business update without shopper behavior.",
        source_type: "public_web",
        url: "https://example.org/corporate"
      })
    ]);
    expect(result.report.weakAreas.join(" ")).toContain("beauty and skincare");
    expect(result.report.weakAreas.join(" ")).toContain("baby care relevance");
    expect(result.report.weakAreas.join(" ")).toContain(
      "positive counterevidence"
    );
    expect(result.report.shortlist.map(({ candidate_id }) => candidate_id))
      .not.toContain("candidate_beauty");
  });

  it("parses the approved candidate columns without semantic inference", () => {
    expect(parseCandidateCsv(csv([candidate()]))).toEqual([candidate()]);
  });
});
