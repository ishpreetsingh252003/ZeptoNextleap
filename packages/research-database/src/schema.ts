import { relations } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const audit = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
};

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  datasetLabel: text("dataset_label"),
  ...audit
});

export const collectionRuns = pgTable("collection_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  sourceType: text("source_type").notNull(),
  input: jsonb("input").notNull(),
  status: text("status").notNull().default("queued"),
  currentStage: text("current_stage"),
  maxRecords: integer("max_records").notNull().default(10),
  sourceCount: integer("source_count").notNull().default(0),
  duplicateCount: integer("duplicate_count").notNull().default(0),
  evidenceCount: integer("evidence_count").notNull().default(0),
  themeCount: integer("theme_count").notNull().default(0),
  attemptCount: integer("attempt_count").notNull().default(0),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...audit
}, (table) => [index("collection_runs_queue_idx").on(table.status, table.createdAt)]);

export const sources = pgTable("sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  collectionRunId: uuid("collection_run_id").notNull().references(() => collectionRuns.id, { onDelete: "cascade" }),
  externalId: text("external_id").notNull(),
  sourceType: text("source_type").notNull(),
  platform: text("platform").notNull(),
  url: text("url").notNull(),
  canonicalUrl: text("canonical_url").notNull(),
  title: text("title"),
  publicationDate: timestamp("publication_date", { withTimezone: true }),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  normalizedContent: text("normalized_content"),
  contentHash: text("content_hash").notNull(),
  accessMethod: text("access_method").notNull(),
  policyNote: text("policy_note").notNull(),
  isDuplicate: boolean("is_duplicate").notNull().default(false),
  ...audit
}, (table) => [
  uniqueIndex("sources_run_content_hash_idx").on(table.collectionRunId, table.contentHash),
  index("sources_run_idx").on(table.collectionRunId)
]);

export const analysisRuns = pgTable("analysis_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  collectionRunId: uuid("collection_run_id").notNull().references(() => collectionRuns.id, { onDelete: "cascade" }),
  sourceId: uuid("source_id").references(() => sources.id, { onDelete: "cascade" }),
  stage: text("stage").notNull(),
  provider: text("provider").notNull().default("groq"),
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  status: text("status").notNull().default("running"),
  attemptCount: integer("attempt_count").notNull().default(0),
  inputHash: text("input_hash").notNull(),
  validatedOutput: jsonb("validated_output"),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...audit
}, (table) => [index("analysis_runs_collection_idx").on(table.collectionRunId, table.stage)]);

export const evidenceItems = pgTable("evidence_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceId: uuid("source_id").notNull().references(() => sources.id, { onDelete: "cascade" }),
  analysisRunId: uuid("analysis_run_id").references(() => analysisRuns.id, { onDelete: "set null" }),
  neutralParaphrase: text("neutral_paraphrase").notNull(),
  minimalExcerpt: text("minimal_excerpt").notNull(),
  categoryGroup: text("category_group").notNull(),
  shoppingMission: text("shopping_mission").notNull(),
  behavioralCodes: jsonb("behavioral_codes").notNull().default([]),
  interpretationCertainty: text("interpretation_certainty").notNull(),
  outcome: text("outcome"),
  jtbd: text("jtbd"),
  mentalModel: text("mental_model"),
  applicability: text("applicability").notNull(),
  transferRationale: text("transfer_rationale").notNull(),
  evidenceValence: text("evidence_valence").notNull(),
  reviewerStatus: text("reviewer_status").notNull().default("pending"),
  limitations: text("limitations").notNull(),
  ...audit
}, (table) => [index("evidence_source_idx").on(table.sourceId), index("evidence_applicability_idx").on(table.applicability)]);

export const themes = pgTable("themes", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  collectionRunId: uuid("collection_run_id").notNull().references(() => collectionRuns.id, { onDelete: "cascade" }),
  analysisRunId: uuid("analysis_run_id").notNull().references(() => analysisRuns.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  behavioralMechanism: text("behavioral_mechanism").notNull(),
  applicability: text("applicability").notNull(),
  transferRationale: text("transfer_rationale").notNull(),
  evidenceStrength: text("evidence_strength").notNull(),
  strengthRationale: text("strength_rationale").notNull(),
  limitations: text("limitations").notNull(),
  claimStatus: text("claim_status").notNull(),
  reviewerStatus: text("reviewer_status").notNull().default("pending"),
  ...audit
});

export const themeEvidence = pgTable("theme_evidence", {
  themeId: uuid("theme_id").notNull().references(() => themes.id, { onDelete: "cascade" }),
  evidenceItemId: uuid("evidence_item_id").notNull().references(() => evidenceItems.id, { onDelete: "cascade" }),
  relationship: text("relationship").notNull()
}, (table) => [primaryKey({ columns: [table.themeId, table.evidenceItemId, table.relationship] })]);

export const reviewDecisions = pgTable("review_decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  decision: text("decision").notNull(),
  note: text("note"),
  reviewer: text("reviewer").notNull().default("human reviewer"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull().defaultNow(),
  ...audit
});

export const projectRelations = relations(projects, ({ many }) => ({ collectionRuns: many(collectionRuns), sources: many(sources), themes: many(themes) }));
export const runRelations = relations(collectionRuns, ({ one, many }) => ({ project: one(projects, { fields: [collectionRuns.projectId], references: [projects.id] }), sources: many(sources), analysisRuns: many(analysisRuns), themes: many(themes) }));
export const sourceRelations = relations(sources, ({ one, many }) => ({ run: one(collectionRuns, { fields: [sources.collectionRunId], references: [collectionRuns.id] }), evidenceItems: many(evidenceItems), analysisRuns: many(analysisRuns) }));
export const themeRelations = relations(themes, ({ many }) => ({ evidenceLinks: many(themeEvidence) }));
export const evidenceRelations = relations(evidenceItems, ({ one, many }) => ({ source: one(sources, { fields: [evidenceItems.sourceId], references: [sources.id] }), themeLinks: many(themeEvidence) }));
