import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

let pool: Pool | undefined;
let database: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is required.");
    pool = new Pool({ connectionString, max: 10 });
  }
  return pool;
}

export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (!database) database = drizzle(getPool(), { schema });
  return database;
}

export async function closeDb(): Promise<void> {
  if (pool) await pool.end();
  pool = undefined;
  database = undefined;
}

export * from "./schema.js";
