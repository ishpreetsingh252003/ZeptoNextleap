import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  analysisRuns,
  closeDb,
  collectionRuns,
  evidenceItems,
  getDb,
  projects,
  sources,
  themeEvidence,
  themes
} from "@zepto/research-database";
import { getServerEnv, loadRootEnv } from "@zepto/shared-config";
import { processRun } from "./pipeline.js";

const LABEL = "Phase 3 Gemini Integration Test";
const MANUAL_TEXT = "Manual pilot evidence E002. A commenter reported switching from Blinkit to Zepto for diapers, receiving torn and dirty packaging, and deciding not to order diapers from Zepto again. Minimal public excerpt retained under the approved source policy: never ordering diapers from zepto. This is a bounded manual research input. Urgency is inferred, and category-expansion prevalence cannot be inferred.";
const EXPECTED_STAGES = ["relevance", "evidence_extraction", "behavioral_coding", "contradiction_detection", "theme_synthesis"];

describe("live Gemini manual-text pipeline", () => {
  beforeAll(() => loadRootEnv());
  afterAll(closeDb);

  it("validates all five stages and persists traceable evidence and themes", async () => {
    const env = getServerEnv();
    expect(env.AI_PROVIDER).toBe("gemini");
    const db = getDb();
    await db.delete(projects).where(eq(projects.datasetLabel, LABEL));

    let projectId: string | undefined;
    try {
      const [project] = await db.insert(projects).values({ name: LABEL, description: "Disposable live Gemini validation fixture.", datasetLabel: LABEL }).returning();
      expect(project).toBeDefined();
      if (!project) throw new Error("Could not create the Gemini integration project.");
      projectId = project.id;

      const input = { projectId, sourceType: "manual_text", manualText: MANUAL_TEXT, policyConfirmed: true, maxRecords: 1 } as const;
      const [run] = await db.insert(collectionRuns).values({ projectId, sourceType: "manual_text", input, maxRecords: 1, status: "collecting", currentStage: "collection", claimedAt: new Date(), startedAt: new Date(), attemptCount: 1 }).returning();
      expect(run).toBeDefined();
      if (!run) throw new Error("Could not create the Gemini integration run.");

      await processRun(run, env);

      const [finished] = await db.select().from(collectionRuns).where(eq(collectionRuns.id, run.id));
      expect(finished).toMatchObject({ status: "completed", currentStage: "human_review", sourceCount: 1 });
      expect(finished?.evidenceCount).toBeGreaterThan(0);
      expect(finished?.themeCount).toBeGreaterThan(0);

      const lineage = await db.select().from(analysisRuns).where(eq(analysisRuns.collectionRunId, run.id));
      expect(lineage.map((item) => item.stage).sort()).toEqual([...EXPECTED_STAGES].sort());
      expect(lineage.every((item) => item.status === "completed" && item.provider === "gemini" && item.attemptCount > 0)).toBe(true);

      const sourceRows = await db.select().from(sources).where(eq(sources.collectionRunId, run.id));
      const evidenceRows = await db.select({ item: evidenceItems, source: sources }).from(evidenceItems).innerJoin(sources, eq(evidenceItems.sourceId, sources.id)).where(eq(sources.collectionRunId, run.id));
      expect(sourceRows).toHaveLength(1);
      expect(evidenceRows.length).toBeGreaterThan(0);
      expect(evidenceRows.every(({ item, source }) => Boolean(source.normalizedContent?.includes(item.minimalExcerpt)))).toBe(true);

      const themeRows = await db.select().from(themes).where(eq(themes.collectionRunId, run.id));
      expect(themeRows.length).toBeGreaterThan(0);
      const links = await db.select().from(themeEvidence).where(eq(themeEvidence.themeId, themeRows[0]!.id));
      expect(links.length).toBeGreaterThan(0);
      expect(links.every((link) => evidenceRows.some(({ item }) => item.id === link.evidenceItemId))).toBe(true);
    } finally {
      if (projectId) await db.delete(projects).where(eq(projects.id, projectId));
      await db.delete(projects).where(eq(projects.datasetLabel, LABEL));
    }

    expect(await db.select({ id: projects.id }).from(projects).where(eq(projects.datasetLabel, LABEL))).toHaveLength(0);
  }, 120_000);
});
