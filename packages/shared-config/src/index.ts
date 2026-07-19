import { z } from "zod";

export const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  API_PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  PUBLIC_API_BASE_URL: z.string().url().optional(),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(500).default(2000),
  SOURCE_FETCH_USER_AGENT: z.string().min(10).default("ZeptoNextLeapResearch/0.1"),
  MAX_SOURCE_BYTES: z.coerce.number().int().positive().default(1_000_000),
  MAX_NORMALIZED_CHARACTERS: z.coerce.number().int().positive().default(20_000),
  GROQ_API_KEY: z.string().min(1).optional(),
  GROQ_MODEL: z.string().default("openai/gpt-oss-20b"),
  TAVILY_API_KEY: z.string().min(1).optional()
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function getServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ""));
  return serverEnvSchema.parse(cleaned);
}
