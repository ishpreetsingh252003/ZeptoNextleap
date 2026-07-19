"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { api, type EvidenceItem, type Theme } from "@/lib/api";
import { SkeletonRows, StatusBadge } from "@/components/ui";

type ThemePayload = { theme: Theme; evidence: Array<{ relationship: string; item: EvidenceItem; source: { url: string; platform: string; title: string | null } }> };

export function ThemeDetail({ themeId }: { themeId: string }) {
  const [payload, setPayload] = useState<ThemePayload>();
  const [error, setError] = useState<string>();
  useEffect(() => { api<ThemePayload>(`/v1/themes/${themeId}`).then(setPayload).catch((cause: Error) => setError(cause.message)); }, [themeId]);
  if (!payload) return <div className="page"><div className="page-heading"><div><span className="eyebrow">Theme detail</span><h1>Loading synthesis…</h1></div></div>{error ? <div className="notice notice-error">{error}</div> : <div className="panel"><SkeletonRows count={5} /></div>}</div>;
  const groups = ["supporting", "opposing", "boundary"] as const;
  return <div className="page"><div className="page-heading"><div><span className="eyebrow">Theme · {payload.theme.id.slice(0, 8)}</span><h1>{payload.theme.title}</h1><p>{payload.theme.summary}</p></div><div className="filters"><StatusBadge status={payload.theme.evidenceStrength} /><StatusBadge status={payload.theme.reviewerStatus} /></div></div>
    <div className="detail-grid"><section className="panel"><div className="detail-section"><h3>Behavioral mechanism</h3><p>{payload.theme.behavioralMechanism}</p></div><div className="detail-section"><h3>Transfer rationale</h3><p>{payload.theme.transferRationale}</p></div><div className="detail-section"><h3>Evidence-strength rationale</h3><p>{payload.theme.strengthRationale}</p></div><div className="detail-section"><h3>Limitations</h3><p>{payload.theme.limitations}</p></div></section><aside className="panel panel-pad"><div className="key-values"><div className="key-value"><span>Claim status</span><strong>{payload.theme.claimStatus}</strong></div><div className="key-value"><span>Applicability</span><strong>{payload.theme.applicability}</strong></div><div className="key-value"><span>Evidence strength</span><strong>{payload.theme.evidenceStrength}</strong></div><div className="key-value"><span>Human review</span><strong>{payload.theme.reviewerStatus}</strong></div></div><div className="research-rule" style={{ margin: "24px 0 0" }}><strong>Not a product idea</strong><p>This is a candidate behavioral synthesis. Opportunity framing remains outside this vertical slice.</p></div></aside></div>
    {groups.map((group) => { const rows = payload.evidence.filter((row) => row.relationship === group); return <section className="panel" style={{ marginTop: 16 }} key={group}><div className="section-header"><div><span className="eyebrow">{group} evidence</span><h2>{group === "supporting" ? "What supports the theme" : group === "opposing" ? "What pushes against it" : "Where the theme stops"}</h2><p>{rows.length} traceable item(s). This count describes the collected corpus only.</p></div></div>{rows.length === 0 ? <div className="research-rule"><strong>None linked</strong><p>No {group} evidence IDs were returned in the validated synthesis.</p></div> : <div className="panel-pad evidence-grid">{rows.map(({ item, source }) => <div className="evidence-card" key={`${group}-${item.id}`}><div className="card-top"><Link href={`/evidence/${item.id}`}><h3>{item.neutralParaphrase}</h3></Link><StatusBadge status={item.evidenceValence} /></div><div className="card-meta"><span className="chip">{item.categoryGroup}</span><span className="chip">{item.applicability}</span><span className="chip">{item.interpretationCertainty}</span></div><div className="source-line"><span>{source.platform}</span><a className="trace-link" href={source.url} target="_blank" rel="noreferrer">Source <ExternalLink size={10} /></a></div></div>)}</div>}</section>; })}
  </div>;
}
