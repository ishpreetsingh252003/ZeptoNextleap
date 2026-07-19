"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { api, type EvidenceRow } from "@/lib/api";
import { EmptyState, SkeletonRows, StatusBadge } from "@/components/ui";

export function EvidenceExplorer() {
  const [rows, setRows] = useState<EvidenceRow[]>();
  const [query, setQuery] = useState("");
  const [applicability, setApplicability] = useState("all");
  const [error, setError] = useState<string>();
  useEffect(() => { api<EvidenceRow[]>("/v1/evidence").then(setRows).catch((cause: Error) => setError(cause.message)); }, []);
  const filtered = useMemo(() => (rows ?? []).filter(({ item, source }) => {
    const haystack = `${item.neutralParaphrase} ${item.categoryGroup} ${item.behavioralCodes.join(" ")} ${source.platform}`.toLowerCase();
    return haystack.includes(query.toLowerCase()) && (applicability === "all" || item.applicability === applicability);
  }), [rows, query, applicability]);
  return <div className="page"><div className="page-heading"><div><span className="eyebrow">Evidence explorer</span><h1>Inspect the claim beneath the theme.</h1><p>Search bounded behavioral observations. Corpus counts describe only collected material and do not imply prevalence.</p></div><div className="filters"><div style={{ position: "relative" }}><Search size={14} style={{ position: "absolute", left: 11, top: 11, color: "#8b838e" }} /><input className="input" style={{ paddingLeft: 32 }} placeholder="Search behavior or category" value={query} onChange={(event) => setQuery(event.target.value)} /></div><select className="input" value={applicability} onChange={(event) => setApplicability(event.target.value)}><option value="all">All applicability</option><option>Zepto-direct</option><option>Quick-commerce transferable</option><option>Category-general contextual</option></select></div></div>
    {error && <div className="notice notice-error">{error}</div>}
    {!rows ? <div className="panel"><SkeletonRows count={6} /></div> : filtered.length === 0 ? <div className="panel"><EmptyState title="No matching evidence" body="Change the filters or complete a relevant collection run. The engine will not fill this state with examples." action={{ href: "/collect", label: "Open collection" }} /></div> : <div className="evidence-grid">{filtered.map(({ item, source }) => <Link href={`/evidence/${item.id}`} className="evidence-card" key={item.id}><div className="card-top"><h3>{item.neutralParaphrase}</h3><StatusBadge status={item.evidenceValence} /></div><div className="card-meta"><span className="chip">{item.categoryGroup}</span><span className="chip">{item.shoppingMission}</span><span className="chip">{item.applicability}</span>{item.behavioralCodes.slice(0, 3).map((code) => <span className="chip" key={code}>{code}</span>)}</div><div className="source-line"><span>{source.platform} · {item.interpretationCertainty}</span><span>{item.reviewerStatus}</span></div></Link>)}</div>}
  </div>;
}
