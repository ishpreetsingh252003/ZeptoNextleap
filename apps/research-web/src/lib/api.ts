export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export type Project = { id: string; name: string; description: string | null; datasetLabel: string | null; createdAt: string };
export type Run = { id: string; projectId: string; sourceType: string; status: string; currentStage: string | null; sourceCount: number; duplicateCount: number; evidenceCount: number; themeCount: number; errorCode: string | null; errorMessage: string | null; createdAt: string; completedAt: string | null };
export type Source = { id: string; url: string; canonicalUrl: string; platform: string; title: string | null; sourceType: string; publicationDate: string | null; capturedAt: string; accessMethod: string; policyNote: string };
export type EvidenceItem = { id: string; neutralParaphrase: string; minimalExcerpt: string; categoryGroup: string; shoppingMission: string; behavioralCodes: string[]; interpretationCertainty: string; outcome: string | null; jtbd: string | null; mentalModel: string | null; applicability: string; transferRationale: string; evidenceValence: string; reviewerStatus: string; limitations: string };
export type EvidenceRow = { item: EvidenceItem; source: Pick<Source, "id" | "url" | "platform" | "title" | "publicationDate" | "capturedAt" | "policyNote"> };
export type Theme = { id: string; title: string; summary: string; behavioralMechanism: string; applicability: string; transferRationale: string; evidenceStrength: string; strengthRationale: string; limitations: string; claimStatus: string; reviewerStatus: string };
export type AnalysisRun = { id: string; stage: string; provider: string; model: string; promptVersion: string; attemptCount: number; status: string; errorMessage: string | null; startedAt: string; completedAt: string | null };

export class ApiError extends Error {
  constructor(message: string, public readonly code?: string, public readonly status?: number) { super(message); }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers: { "content-type": "application/json", ...init?.headers }, cache: "no-store" });
  const body = await response.json().catch(() => ({})) as { message?: string; error?: string };
  if (!response.ok) throw new ApiError(body.message ?? `Request failed with HTTP ${response.status}.`, body.error, response.status);
  return body as T;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "Not visible";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function titleCase(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
