import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { findRepositoryRoot } from "@zepto/shared-config";
import { resolveDataFile, runtimeFile, runtimeRoot } from "./data-paths";

export function findRepoRoot(): string | null {
  return findRepositoryRoot();
}

/**
 * Resolves a repository-relative path. Looks in the real repository root
 * first (committed corpus, generated outputs) and then in the runtime
 * workspace (generated outputs in serverless /tmp). Returns null when the
 * file is not present anywhere.
 */
export function repoFile(relativePath: string): string | null {
  const root = findRepoRoot();
  if (root) {
    const candidate = join(/*turbopackIgnore: true*/ root, relativePath);
    if (existsSync(candidate)) return candidate;
  }
  return runtimeFile(relativePath);
}

export function repoDir(relativePath: string): string | null {
  const candidate = repoFile(relativePath);
  if (!candidate) return null;
  try {
    return statSync(candidate).isDirectory() ? candidate : null;
  } catch {
    return null;
  }
}

export function latestFileIn(directory: string, options?: { prefix?: string; suffix?: string }): string | null {
  const { prefix = "", suffix = "" } = options ?? {};
  let entries: string[];
  try {
    entries = readdirSync(directory).filter((name) => name.startsWith(prefix) && name.endsWith(suffix));
  } catch {
    return null;
  }
  if (entries.length === 0) return null;
  return entries
    .map((name) => join(/*turbopackIgnore: true*/ directory, name))
    .sort((a, b) => {
      try {
        return statSync(b).mtimeMs - statSync(a).mtimeMs;
      } catch {
        return 0;
      }
    })[0] ?? null;
}

export function resolveInput(realRelativePath: string, bundledRelativePath: string): string | null {
  return repoFile(realRelativePath) ?? resolveDataFile(bundledRelativePath);
}

/**
 * Root used for generated outputs. Never throws: falls back to a writable
 * runtime workspace when the repository root cannot be resolved (e.g. Vercel
 * functions, which have a read-only filesystem and no monorepo layout).
 */
export function repoRootOrThrow(): string {
  return runtimeRoot();
}
