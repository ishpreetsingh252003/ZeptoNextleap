import cors from "cors";
import express from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { ZodError, z } from "zod";
import { createCollectionRunSchema, createProjectSchema, reviewerStatusSchema } from "@zepto/research-contracts";
import { analysisRuns, collectionRuns, evidenceItems, getDb, projects, reviewDecisions, sources, themeEvidence, themes } from "@zepto/research-database";
import { isSelectedAiModelConfigured, isSelectedAiProviderConfigured, type ServerEnv } from "@zepto/shared-config";

const idSchema = z.string().uuid();

export function buildHealthStatus(env: ServerEnv, databaseReachable: boolean) {
  return {
    database: { configured: Boolean(env.DATABASE_URL), reachable: databaseReachable },
    ai: {
      selectedProvider: env.AI_PROVIDER,
      configured: isSelectedAiProviderConfigured(env),
      modelConfigured: isSelectedAiModelConfigured(env)
    },
    optionalSources: {
      tavilyConfigured: Boolean(env.TAVILY_API_KEY),
      firecrawlConfigured: Boolean(env.FIRECRAWL_API_KEY),
      apifyConfigured: Boolean(env.APIFY_API_TOKEN && env.APIFY_GOOGLE_PLAY_ACTOR_ID)
    }
  };
}

export function createApp(env: ServerEnv): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: env.CORS_ORIGIN.split(",").map((value) => value.trim()) }));
  app.use(express.json({ limit: "256kb" }));
  const db = getDb();

  app.get("/health", async (_request, response) => {
    let reachable = false;
    try {
      await db.execute(sql`select 1`);
      reachable = true;
    } catch {
      // Health remains available without leaking connection details.
    }
    response.json(buildHealthStatus(env, reachable));
  });

  app.get("/v1/projects", async (_request, response) => {
    response.json(await db.select().from(projects).orderBy(desc(projects.createdAt)));
  });

  app.post("/v1/projects", async (request, response) => {
    const input = createProjectSchema.parse(request.body);
    const [project] = await db.insert(projects).values(input).returning();
    response.status(201).json(project);
  });

  app.get("/v1/runs", async (request, response) => {
    const projectId = request.query.projectId ? idSchema.parse(request.query.projectId) : undefined;
    const rows = projectId
      ? await db.select().from(collectionRuns).where(eq(collectionRuns.projectId, projectId)).orderBy(desc(collectionRuns.createdAt)).limit(50)
      : await db.select().from(collectionRuns).orderBy(desc(collectionRuns.createdAt)).limit(50);
    response.json(rows);
  });

  app.post("/v1/runs", async (request, response) => {
    const input = createCollectionRunSchema.parse(request.body);
    const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, input.projectId)).limit(1);
    if (!project) return response.status(404).json({ error: "PROJECT_NOT_FOUND", message: "Select an existing project." });
    const [run] = await db.insert(collectionRuns).values({ projectId: input.projectId, sourceType: input.sourceType, input, maxRecords: input.maxRecords }).returning();
    response.status(202).json(run);
  });

  app.get("/v1/runs/:id", async (request, response) => {
    const runId = idSchema.parse(request.params.id);
    const [run] = await db.select().from(collectionRuns).where(eq(collectionRuns.id, runId)).limit(1);
    if (!run) return response.status(404).json({ error: "RUN_NOT_FOUND", message: "Collection run not found." });
    const [sourceRows, evidenceRows, themeRows, lineageRows] = await Promise.all([
      db.select().from(sources).where(eq(sources.collectionRunId, runId)).orderBy(sources.createdAt),
      db.select({ item: evidenceItems, source: { id: sources.id, url: sources.url, platform: sources.platform, title: sources.title } }).from(evidenceItems).innerJoin(sources, eq(evidenceItems.sourceId, sources.id)).where(eq(sources.collectionRunId, runId)).orderBy(evidenceItems.createdAt),
      db.select().from(themes).where(eq(themes.collectionRunId, runId)).orderBy(themes.createdAt),
      db.select().from(analysisRuns).where(eq(analysisRuns.collectionRunId, runId)).orderBy(analysisRuns.startedAt)
    ]);
    response.json({ run, sources: sourceRows, evidence: evidenceRows, themes: themeRows, analysisRuns: lineageRows });
  });

  app.post("/v1/runs/:id/retry", async (request, response) => {
    const runId = idSchema.parse(request.params.id);
    const [run] = await db.select().from(collectionRuns).where(eq(collectionRuns.id, runId)).limit(1);
    if (!run) return response.status(404).json({ error: "RUN_NOT_FOUND", message: "Collection run not found." });
    if (!["failed", "partially_completed"].includes(run.status)) return response.status(409).json({ error: "RUN_NOT_RETRYABLE", message: "Only failed or partially completed runs can be retried." });
    const [retry] = await db.insert(collectionRuns).values({ projectId: run.projectId, sourceType: run.sourceType, input: { ...(run.input as object), retryOfRunId: run.id }, maxRecords: run.maxRecords }).returning();
    response.status(202).json(retry);
  });

  app.get("/v1/evidence", async (request, response) => {
    const projectId = request.query.projectId ? idSchema.parse(request.query.projectId) : undefined;
    const conditions = projectId ? [eq(sources.projectId, projectId)] : [];
    const rows = await db.select({ item: evidenceItems, source: { id: sources.id, url: sources.url, platform: sources.platform, title: sources.title, publicationDate: sources.publicationDate, capturedAt: sources.capturedAt, policyNote: sources.policyNote } }).from(evidenceItems).innerJoin(sources, eq(evidenceItems.sourceId, sources.id)).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(evidenceItems.createdAt)).limit(200);
    response.json(rows);
  });

  app.get("/v1/evidence/:id", async (request, response) => {
    const evidenceId = idSchema.parse(request.params.id);
    const [row] = await db.select({ item: evidenceItems, source: sources }).from(evidenceItems).innerJoin(sources, eq(evidenceItems.sourceId, sources.id)).where(eq(evidenceItems.id, evidenceId)).limit(1);
    if (!row) return response.status(404).json({ error: "EVIDENCE_NOT_FOUND", message: "Evidence item not found." });
    response.json(row);
  });

  app.get("/v1/themes", async (request, response) => {
    const projectId = request.query.projectId ? idSchema.parse(request.query.projectId) : undefined;
    response.json(projectId ? await db.select().from(themes).where(eq(themes.projectId, projectId)).orderBy(desc(themes.createdAt)) : await db.select().from(themes).orderBy(desc(themes.createdAt)).limit(100));
  });

  app.get("/v1/themes/:id", async (request, response) => {
    const themeId = idSchema.parse(request.params.id);
    const [theme] = await db.select().from(themes).where(eq(themes.id, themeId)).limit(1);
    if (!theme) return response.status(404).json({ error: "THEME_NOT_FOUND", message: "Theme not found." });
    const links = await db.select({ relationship: themeEvidence.relationship, item: evidenceItems, source: { url: sources.url, platform: sources.platform, title: sources.title } }).from(themeEvidence).innerJoin(evidenceItems, eq(themeEvidence.evidenceItemId, evidenceItems.id)).innerJoin(sources, eq(evidenceItems.sourceId, sources.id)).where(eq(themeEvidence.themeId, themeId));
    response.json({ theme, evidence: links });
  });

  app.post("/v1/reviews", async (request, response) => {
    const input = z.object({ entityType: z.enum(["evidence", "theme"]), entityId: z.string().uuid(), decision: reviewerStatusSchema.exclude(["pending"]), note: z.string().max(1_000).optional(), reviewer: z.string().min(1).max(120).default("human reviewer") }).parse(request.body);
    await db.transaction(async (tx) => {
      await tx.insert(reviewDecisions).values(input);
      if (input.entityType === "evidence") await tx.update(evidenceItems).set({ reviewerStatus: input.decision, updatedAt: new Date() }).where(eq(evidenceItems.id, input.entityId));
      else await tx.update(themes).set({ reviewerStatus: input.decision, updatedAt: new Date() }).where(eq(themes.id, input.entityId));
    });
    response.status(201).json({ ok: true });
  });

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    if (error instanceof ZodError) return response.status(400).json({ error: "INVALID_REQUEST", message: "The request did not match the research contract.", issues: error.issues });
    console.error(error);
    response.status(500).json({ error: "INTERNAL_ERROR", message: "The research service could not complete the request." });
  });
  return app;
}
