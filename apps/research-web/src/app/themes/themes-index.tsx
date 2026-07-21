"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Theme } from "@/lib/api";
import { EmptyState, SkeletonRows, StatusBadge } from "@/components/ui";

export function ThemesIndex() {
  const [themes, setThemes] = useState<Theme[]>();
  const [error, setError] = useState<string>();
  useEffect(() => { api<Theme[]>("/v1/themes").then(setThemes).catch((cause: Error) => setError(cause.message)); }, []);
  return <div className="page"><div className="page-heading"><div><span className="eyebrow">Behavioral synthesis</span><h1>Themes with their edges intact.</h1><p>Supporting, opposing, and boundary evidence remain separate. Strength is qualitative corpus support, not statistical confidence.</p></div></div>{error && <div className="notice notice-error">{error}</div>}{!themes ? <div className="panel"><SkeletonRows count={5} /></div> : themes.length === 0 ? <div className="panel"><EmptyState title="No synthesized themes" body="Complete an AI-backed run with relevant evidence. The system will not create placeholder insights." action={{ href: "/collect", label: "Start a run" }} /></div> : <div className="evidence-grid">{themes.map((theme) => <Link href={`/themes/${theme.id}`} className="evidence-card" key={theme.id}><div className="card-top"><h3>{theme.title}</h3><StatusBadge status={theme.evidenceStrength} /></div><p>{theme.summary}</p><div className="card-meta"><span className="chip">{theme.applicability}</span><span className="chip">{theme.claimStatus}</span><span className="chip">Review: {theme.reviewerStatus}</span></div></Link>)}</div>}</div>;
}
