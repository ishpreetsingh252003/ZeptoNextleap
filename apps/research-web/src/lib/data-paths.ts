import { existsSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { findRepositoryRoot } from "@zepto/shared-config";

// NOTE: keep these joins statically scoped to the "data" subfolder so that
// Turbopack's output file tracing bundles the corpus without tracing the
// entire project.
export function resolveDataFile(relativePath: string): string | null {
  const candidate = join(process.cwd(), "data", relativePath);
  return existsSync(candidate) ? candidate : null;
}

/**
 * Root directory for all runtime-generated artifacts (runs, discovery and
 * opportunity outputs). Prefers the real repository root when it can be
 * resolved; otherwise falls back to a writable workspace under the OS temp
 * directory so that serverless deployments (Vercel, where process.cwd() is
 * read-only and pnpm-workspace.yaml is absent) can still persist artifacts.
 * Never throws.
 */
export function runtimeRoot(): string {
  const repoRoot = findRepositoryRoot();
  if (repoRoot) return repoRoot;
  const dir = join(/*turbopackIgnore: true*/ tmpdir(), "zepto-nextleap-runtime");
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    // best-effort; reads will simply report the file as missing
  }
  return dir;
}

export function runtimeFile(relativePath: string): string | null {
  const root = runtimeRoot();
  const candidate = join(/*turbopackIgnore: true*/ root, relativePath);
  return existsSync(candidate) ? candidate : null;
}
