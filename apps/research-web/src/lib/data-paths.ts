import { existsSync } from "fs";
import { join } from "path";

const DATA_DIR = join(process.cwd(), "data");

export function resolveDataFile(relativePath: string): string | null {
  const candidate = join(DATA_DIR, relativePath);
  return existsSync(candidate) ? candidate : null;
}

export function dataDir(): string {
  return DATA_DIR;
}
