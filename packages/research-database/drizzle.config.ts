import { defineConfig } from "drizzle-kit";
import { loadRootEnv } from "@zepto/shared-config";

loadRootEnv();

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for Drizzle commands.");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: { url: process.env.DATABASE_URL },
  strict: true,
  verbose: true
});
