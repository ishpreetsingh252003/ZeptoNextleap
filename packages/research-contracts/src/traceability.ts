import type { ThemeSynthesisOutput } from "./index.js";

export function assertThemeTraceability(output: ThemeSynthesisOutput, evidenceIds: Set<string>): void {
  const referenced = output.themes.flatMap((theme) => [...theme.evidenceIds, ...theme.opposingEvidenceIds, ...theme.boundaryEvidenceIds]);
  const unknown = [...new Set(referenced.filter((id) => !evidenceIds.has(id)))];
  if (unknown.length > 0) throw new Error(`Theme synthesis referenced unknown evidence IDs: ${unknown.join(", ")}`);
}
