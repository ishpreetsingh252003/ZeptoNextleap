import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  analysisRuns,
  closeDb,
  collectionRuns,
  evidenceItems,
  getDb,
  getPool,
  projects,
  reviewDecisions,
  sources,
  themeEvidence,
  themes
} from "@zepto/research-database";
import { loadRootEnv } from "@zepto/shared-config";

const LABEL = "Phase 2 Database Validation";
const EXPECTED_TABLES = ["projects", "collection_runs", "sources", "analysis_runs", "evidence_items", "themes", "theme_evidence", "review_decisions"];

describe("live Neon persistence", () => {
  beforeAll(() => loadRootEnv());
  afterAll(closeDb);

  it("migrates, persists, relates, enforces, updates, and cleans a synthetic graph", async () => {
    const db = getDb();
    const pool = getPool();
    const client = await pool.connect();
    try {
      const stream = (client as unknown as { connection?: { stream?: { encrypted?: boolean; authorized?: boolean } } }).connection?.stream;
      expect(stream?.encrypted).toBe(true);
      expect(stream?.authorized).toBe(true);
      expect((await client.query("select 1 as ok")).rows[0]?.ok).toBe(1);
    } finally {
      client.release();
    }

    const tableResult = await pool.query<{ table_name: string }>("select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1::text[])", [EXPECTED_TABLES]);
    expect(new Set(tableResult.rows.map((row) => row.table_name))).toEqual(new Set(EXPECTED_TABLES));
    expect((await pool.query<{ count: number }>("select count(*)::int as count from drizzle.__drizzle_migrations")).rows[0]?.count).toBe(2);

    await db.delete(reviewDecisions).where(eq(reviewDecisions.reviewer, LABEL));
    await db.delete(projects).where(eq(projects.datasetLabel, LABEL));

    let capturedFailure: unknown;
    let evidenceId: string | undefined;
    try {
      const [project] = await db.insert(projects).values({ name: LABEL, description: "Synthetic live-database validation only.", datasetLabel: LABEL }).returning();
      expect(project).toBeDefined();
      if (!project) throw new Error("Synthetic project was not persisted.");

      const [run] = await db.insert(collectionRuns).values({ projectId: project.id, sourceType: "manual_text", input: { label: LABEL }, status: "queued", currentStage: "database_validation", maxRecords: 1 }).returning();
      expect(run).toBeDefined();
      if (!run) throw new Error("Synthetic collection run was not persisted.");

      const [source] = await db.insert(sources).values({ projectId: project.id, collectionRunId: run.id, externalId: "phase-2-synthetic-source", sourceType: "manual_text", platform: "Synthetic validation", url: "synthetic-phase-2-source", canonicalUrl: "synthetic-phase-2-source", title: LABEL, capturedAt: new Date(), normalizedContent: "Synthetic content. This is not user research evidence.", contentHash: "phase2databasevalidation0000000000000000000000000000000000000000", accessMethod: "manual_import", policyNote: "Synthetic Phase 2 database validation record." }).returning();
      expect(source).toBeDefined();
      if (!source) throw new Error("Synthetic source was not persisted.");

      const [analysis] = await db.insert(analysisRuns).values({ collectionRunId: run.id, sourceId: source.id, stage: "relevance", provider: "gemini", model: "phase-2-validation-model", promptVersion: "relevance-v1.0.0", status: "completed", attemptCount: 1, inputHash: "phase2databasevalidationinput000000000000000000000000000000000000" }).returning();
      expect(analysis).toMatchObject({ provider: "gemini", model: "phase-2-validation-model", promptVersion: "relevance-v1.0.0", stage: "relevance", status: "completed", attemptCount: 1 });
      if (!analysis) throw new Error("Synthetic analysis lineage was not persisted.");

      const [evidence] = await db.insert(evidenceItems).values({ sourceId: source.id, analysisRunId: analysis.id, neutralParaphrase: "Synthetic persistence observation; not research evidence.", minimalExcerpt: "Synthetic content.", categoryGroup: "Synthetic validation", shoppingMission: "Database validation", behavioralCodes: ["outcome"], interpretationCertainty: "explicit", outcome: "Persistence verified", applicability: "Category-general contextual", transferRationale: "Synthetic record; not applicable to Zepto behavior.", evidenceValence: "boundary case", limitations: "Created only for Phase 2 database validation." }).returning();
      expect(evidence).toBeDefined();
      if (!evidence) throw new Error("Synthetic evidence was not persisted.");
      evidenceId = evidence.id;

      const [theme] = await db.insert(themes).values({ projectId: project.id, collectionRunId: run.id, analysisRunId: analysis.id, title: LABEL, summary: "Synthetic persistence theme; not a research conclusion.", behavioralMechanism: "Database relationship validation only.", applicability: "Category-general contextual", transferRationale: "Synthetic record with no behavioral applicability.", evidenceStrength: "Weak", strengthRationale: "Synthetic validation record only.", limitations: "Must be deleted after Phase 2 validation.", claimStatus: "hypothesized" }).returning();
      expect(theme).toBeDefined();
      if (!theme) throw new Error("Synthetic theme was not persisted.");

      await db.insert(themeEvidence).values({ themeId: theme.id, evidenceItemId: evidence.id, relationship: "supporting" });
      const [review] = await db.insert(reviewDecisions).values({ entityType: "evidence", entityId: evidence.id, decision: "approved", note: "Synthetic Phase 2 validation decision.", reviewer: LABEL }).returning();
      expect(review).toBeDefined();

      const linked = await db.select({ themeId: themeEvidence.themeId, evidenceId: themeEvidence.evidenceItemId, sourceId: evidenceItems.sourceId }).from(themeEvidence).innerJoin(evidenceItems, eq(themeEvidence.evidenceItemId, evidenceItems.id)).where(and(eq(themeEvidence.themeId, theme.id), eq(themeEvidence.evidenceItemId, evidence.id)));
      expect(linked).toEqual([{ themeId: theme.id, evidenceId: evidence.id, sourceId: source.id }]);

      await db.update(collectionRuns).set({ status: "completed", currentStage: "human_review", completedAt: new Date(), updatedAt: new Date() }).where(eq(collectionRuns.id, run.id));
      expect((await db.select({ status: collectionRuns.status }).from(collectionRuns).where(eq(collectionRuns.id, run.id))).at(0)?.status).toBe("completed");

      let foreignKeyEnforced = false;
      try {
        await db.insert(themeEvidence).values({ themeId: randomUUID(), evidenceItemId: evidence.id, relationship: "supporting" });
      } catch (error) {
        const candidate = error as { code?: string; cause?: { code?: string } };
        foreignKeyEnforced = (candidate.code ?? candidate.cause?.code) === "23503";
      }
      expect(foreignKeyEnforced).toBe(true);
    } catch (error) {
      capturedFailure = error;
    } finally {
      await db.delete(reviewDecisions).where(eq(reviewDecisions.reviewer, LABEL));
      await db.delete(projects).where(eq(projects.datasetLabel, LABEL));
    }

    expect(await db.select({ id: projects.id }).from(projects).where(eq(projects.datasetLabel, LABEL))).toHaveLength(0);
    expect(await db.select({ id: reviewDecisions.id }).from(reviewDecisions).where(eq(reviewDecisions.reviewer, LABEL))).toHaveLength(0);
    if (evidenceId) expect(await db.select({ id: evidenceItems.id }).from(evidenceItems).where(eq(evidenceItems.id, evidenceId))).toHaveLength(0);
    if (capturedFailure) throw capturedFailure;
  }, 30_000);
});
