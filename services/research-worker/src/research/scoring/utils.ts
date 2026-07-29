// services/research-worker/src/research/scoring/utils.ts

export function normalized(value: string): string {
  return value.trim().toLocaleLowerCase('en');
}

export function countBy<T>(records: readonly T[], value: (record: T) => string): Record<string, number> {
  const counts = new Map<string, number>();
  for (const record of records) {
    const key = value(record);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

export function cappedRatio(count: number, total: number, weight: number): number {
  if (total === 0) return 0;
  return Math.round((count / total) * weight);
}

export function cappedCount(count: number, target: number, weight: number): number {
  return Math.round(Math.min(1, count / target) * weight);
}

export function tagCount(evidence: readonly any[], tag: string): number {
  // Generic; callers ensure correct typing
  return evidence.filter((e: any) => (e.relevanceTags ?? []).includes(tag)).length;
}
