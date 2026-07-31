import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { findRepositoryRoot } from "@zepto/shared-config";
import { resolveDataFile } from "./data-paths";

export function findRepoRoot(): string | null {
  return findRepositoryRoot();
}

export function repoFile(relativePath: string): string | null {
  const root = findRepoRoot();
  if (!root) return null;
  const candidate = join(root, relativePath);
  return existsSync(candidate) ? candidate : null;
}

export function repoDir(relativePath: string): string | null {
  const root = findRepoRoot();
  if (!root) return null;
  const candidate = join(root, relativePath);
  return existsSync(candidate) && statSync(candidate).isDirectory() ? candidate : null;
}

export function latestFileIn(directory: string, options?: { prefix?: string; suffix?: string }): string | null {
  const { prefix = "", suffix = "" } = options ?? {};
  const entries = readdirSync(directory).filter((name) => name.startsWith(prefix) && name.endsWith(suffix));
  if (entries.length === 0) return null;
  return entries
    .map((name) => join(directory, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0] ?? null;
}

export function resolveInput(realRelativePath: string, bundledRelativePath: string): string | null {
  return repoFile(realRelativePath) ?? resolveDataFile(bundledRelativePath);
}

export function repoRootOrThrow(): string {
  const root = findRepoRoot();
  if (!root) throw new Error("Repository root could not be resolved. Cannot reach the research corpus.");
  return root;
}
