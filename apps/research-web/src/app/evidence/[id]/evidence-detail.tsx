"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { api, formatDate, type EvidenceItem, type Source } from "@/lib/api";
import { SkeletonRows, StatusBadge } from "@/components/ui";

export function EvidenceDetail({ evidenceId }: { evidenceId: string }) {
  const [row, setRow] = useState<{ item: EvidenceItem; source: Source }>();
  const [error, setError] = useState<string>();
  useEffect(() => { api<{ item: EvidenceItem; source: Source }>(`/v1/evidence/${evidenceId}`).then(setRow).catch((cause: Error) => setError(cause.message)); }, [evidenceId]);
  if (!row) return <div className="page"><div className="page-heading"><div><span className="eyebrow">Evidence detail</span><h1>Loading evidence…</h1></div></div>{error ? <div className="notice notice-error">{error}</div> : <div className="panel"><SkeletonRows count={5} /></div>}</div>;
  const { item, source } = row;
  return <div className="page"><div className="page-heading"><div><span className="eyebrow">Evidence · {item.id.slice(0, 8)}</span><h1>{item.categoryGroup}</h1><p>One bounded observation with source context, coding, transfer boundary, and review state.</p></div><StatusBadge status={item.reviewerStatus} /></div>
    <div className="detail-grid"><section className="panel"><div className="detail-section"><h3>Neutral paraphrase</h3><p>{item.neutralParaphrase}</p></div><div className="detail-section"><h3>Minimal permitted excerpt</h3><blockquote>“{item.minimalExcerpt}”</blockquote></div><div className="detail-section"><h3>Transfer rationale</h3><p>{item.transferRationale}</p></div><div className="detail-section"><h3>Limitations</h3><p>{item.limitations}</p></div>{item.jtbd && <div className="detail-section"><h3>JTBD interpretation</h3><p>{item.jtbd}</p></div>}{item.mentalModel && <div className="detail-section"><h3>Mental model interpretation</h3><p>{item.mentalModel}</p></div>}</section>
    <aside className="panel panel-pad"><div className="key-values"><div className="key-value"><span>Source</span><strong>{source.platform}</strong><a className="trace-link" href={source.url} target="_blank" rel="noreferrer">Open public source <ExternalLink size={11} /></a></div><div className="key-value"><span>Publication date</span><strong>{formatDate(source.publicationDate)}</strong></div><div className="key-value"><span>Captured</span><strong>{formatDate(source.capturedAt)}</strong></div><div className="key-value"><span>Interpretation</span><strong>{item.interpretationCertainty}</strong></div><div className="key-value"><span>Applicability</span><strong>{item.applicability}</strong></div><div className="key-value"><span>Contradiction role</span><strong>{item.evidenceValence}</strong></div><div className="key-value"><span>Shopping mission</span><strong>{item.shoppingMission}</strong></div><div className="key-value"><span>Outcome</span><strong>{item.outcome ?? "Not stated"}</strong></div><div className="key-value"><span>Behavioral codes</span><div className="card-meta">{item.behavioralCodes.map((code) => <span className="chip" key={code}>{code}</span>)}</div></div><div className="key-value"><span>Access note</span><strong>{source.policyNote}</strong></div></div></aside></div>
  </div>;
}
