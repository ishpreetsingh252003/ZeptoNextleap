import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parse } from "dotenv";
import { z, ZodError } from "zod";

export const aiProviderSchema = z.enum(["gemini", "groq"]);
export type AiProviderName = z.infer<typeof aiProviderSchema>;

export class EnvironmentConfigurationError extends Error {
  readonly code = "INVALID_ENVIRONMENT_CONFIGURATION";

  constructor(message: string) {
    super(message);
    this.name = "EnvironmentConfigurationError";
  }
}

export const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AI_PROVIDER: aiProviderSchema.default("gemini"),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).optional(),
  GROQ_API_KEY: z.string().min(1).optional(),
  GROQ_MODEL: z.string().min(1).optional(),
  TAVILY_API_KEY: z.string().min(1).optional(),
  FIRECRAWL_API_KEY: z.string().min(1).optional(),
  FIRECRAWL_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).optional(),
  GOOGLE_PLAY_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).optional(),
  APIFY_API_TOKEN: z.string().min(1).optional(),
  APIFY_GOOGLE_PLAY_ACTOR_ID: z.string().min(1).optional(),
  API_PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(500).default(3000),
  SOURCE_FETCH_USER_AGENT: z.string().min(10).default("ZeptoNextLeapResearch/0.1"),
  MAX_SOURCE_BYTES: z.coerce.number().int().positive().default(1_000_000),
  MAX_NORMALIZED_CHARACTERS: z.coerce.number().int().positive().default(60_000),
  ANALYSIS_EVIDENCE_MAX_DOCUMENTS_PER_BATCH: z.coerce.number().int().min(1).max(1_000).default(50),
  ANALYSIS_EVIDENCE_MAX_ESTIMATED_PROMPT_TOKENS_PER_BATCH: z.coerce.number().int().min(1_000).max(500_000).default(32_000),
  ANALYSIS_THEME_MAX_EVIDENCE_PER_BATCH: z.coerce.number().int().min(1).max(2_000).default(100),
  ANALYSIS_THEME_MAX_ESTIMATED_PROMPT_TOKENS_PER_BATCH: z.coerce.number().int().min(1_000).max(500_000).default(32_000),
  ANALYSIS_THEME_MAX_PROVISIONAL_PER_BATCH: z.coerce.number().int().min(2).max(500).default(40),
  ANALYSIS_INSIGHT_MAX_EVIDENCE_PER_BATCH: z.coerce.number().int().min(1).max(2_000).default(100),
  ANALYSIS_INSIGHT_MAX_ESTIMATED_PROMPT_TOKENS_PER_BATCH: z.coerce.number().int().min(1_000).max(500_000).default(32_000),
  MVP_SOURCE_CONCENTRATION_WARNING_THRESHOLD: z.coerce.number().min(0.5).max(1).default(0.6),
  RESEARCH_READINESS_MIN_RELEVANT_RECORDS: z.coerce.number().int().min(1).default(100),
  RESEARCH_READINESS_MIN_SOURCES: z.coerce.number().int().min(1).default(3),
  RESEARCH_READINESS_MAX_SOURCE_CONCENTRATION: z.coerce.number().min(0).max(1).default(0.75),
  RESEARCH_READINESS_MIN_CATEGORIES: z.coerce.number().int().min(1).default(3),
  RESEARCH_READINESS_MAX_CATEGORY_CONCENTRATION: z.coerce.number().min(0).max(1).default(0.75),
  RESEARCH_READINESS_MIN_BARRIERS_OR_RISKS: z.coerce.number().int().min(0).default(20),
  RESEARCH_READINESS_MIN_TRIGGERS_OR_TRUST_SIGNALS: z.coerce.number().int().min(0).default(10),
  RESEARCH_READINESS_MIN_ABANDONMENT_OR_WORKAROUNDS: z.coerce.number().int().min(0).default(10)
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type SelectedAiConfiguration = {
  provider: AiProviderName;
  apiKey: string;
  model: string;
};

export function findRepositoryRoot(startDirectory: string = process.cwd()): string | null {
  let current = resolve(startDirectory);
  while (true) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function loadRootEnv(options: { startDirectory?: string; target?: NodeJS.ProcessEnv } = {}): { loaded: boolean; path?: string } {
  const target = options.target ?? process.env;
  const root = findRepositoryRoot(options.startDirectory);
  if (!root) return { loaded: false };
  const path = join(root, ".env");
  if (!existsSync(path)) return { loaded: false, path };

  const parsed = parse(readFileSync(path));
  for (const [name, value] of Object.entries(parsed)) {
    if (!Object.hasOwn(target, name)) target[name] = value;
  }
  return { loaded: true, path };
}

export function getServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ""));
  try {
    return serverEnvSchema.parse(cleaned);
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    const issues = error.issues.map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`).join("; ");
    throw new EnvironmentConfigurationError(`Invalid environment configuration. ${issues}`);
  }
}

export function getSelectedAiConfiguration(env: ServerEnv): SelectedAiConfiguration {
  if (env.AI_PROVIDER === "gemini") {
    if (!env.GEMINI_API_KEY || !env.GEMINI_MODEL) {
      throw new EnvironmentConfigurationError("AI_PROVIDER=gemini requires GEMINI_API_KEY and GEMINI_MODEL.");
    }
    return { provider: "gemini", apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL };
  }

  if (!env.GROQ_API_KEY || !env.GROQ_MODEL) {
    throw new EnvironmentConfigurationError("AI_PROVIDER=groq requires GROQ_API_KEY and GROQ_MODEL.");
  }
  return { provider: "groq", apiKey: env.GROQ_API_KEY, model: env.GROQ_MODEL };
}

export function isSelectedAiProviderConfigured(env: ServerEnv): boolean {
  try {
    getSelectedAiConfiguration(env);
    return true;
  } catch {
    return false;
  }
}

export function isSelectedAiModelConfigured(env: ServerEnv): boolean {
  return env.AI_PROVIDER === "gemini" ? Boolean(env.GEMINI_MODEL) : Boolean(env.GROQ_MODEL);
}
