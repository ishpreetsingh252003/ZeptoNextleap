"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Award, BookOpen, Briefcase, FileText, Quote, Scale, Target } from "lucide-react";
import { EmptyState, GlassCard, MetricsSkeleton, SkeletonRows } from "@/components/ui";
import { cachedJson } from "@/lib/client-cache";
import { titleCase, type OpportunityReport } from "@/lib/api";

const STRENGTH_TONE: Record<string, string> = { "Very Strong": "badge-success", Strong: "badge-success", Moderate: "badge-warning", Emerging: "badge-neutral" };
const CONFIDENCE_TONE: Record<string, string> = { High: "badge-success", "Med-High": "badge-warning", Medium: "badge-warning" };
const EFFORT_TONE: Record<string, string> = { High: "badge-warning", Medium: "badge-neutral", Low: "badge-success" };

function theoryName(line: string): string {
  const colon = line.indexOf(":");
  return colon > 0 ? line.slice(0, colon) : line;
}

export function OpportunitiesIndex() {
  const [data, setData] = useState<OpportunityReport | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    cachedJson<OpportunityReport>("/api/opportunities")
      .then(setData)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Failed to load opportunities."));
  }, []);

  if (error) return <div className="page"><div className="notice notice-error">{error}</div></div>;
  if (!data) return <div className="page"><div className="page-heading"><div><span className="eyebrow">Final research phase</span><h1>Opportunities</h1><p>Ranked decision-support for "what problem is worth solving next", based on the consolidated evidence and behaviour knowledge base.</p></div></div><MetricsSkeleton /><GlassCard className="panel-pad"><SkeletonRows count={6} /></GlassCard></div>;

  const { report, opportunities } = data;
  const totalEvidence = opportunities.reduce((sum, o) => sum + o.evidenceCount, 0);
  const top = opportunities[0];

  return <div className="page">
    <div className="page-heading"><div><span className="eyebrow">{report?.date ?? "Final research phase"}</span><h1>Opportunities</h1><p>Ranked decision-support for "what problem is worth solving next", based on the consolidated evidence and behaviour knowledge base.</p></div></div>

    {opportunities.length === 0 ? <GlassCard className="panel-pad"><EmptyState icon={Target} title="No opportunities yet" body="Opportunities are scored from reviewed evidence. Run a discovery, then return here for the ranked shortlist." action={{ href: "/discovery", label: "Start a discovery" }} /></GlassCard> : <></>}

    {opportunities.length > 0 && <>
    <div className="metrics">
      <GlassCard className="metric"><span>Prioritized opportunities</span><strong>{opportunities.length}</strong><p>From reviewed evidence</p></GlassCard>
      <GlassCard className="metric"><span>Verified records</span><strong>{totalEvidence}</strong><p>Across the research corpus</p></GlassCard>
      <GlassCard className="metric"><span>Top opportunity</span><strong>{top?.combinedScore ?? 0}</strong><p>{top?.headline ?? ""}</p></GlassCard>
      <GlassCard className="metric"><span>Recommended MVP</span><strong>{opportunities.filter((o) => o.mvpRole.startsWith("PRIMARY")).length}</strong><p>Primary graduation MVP</p></GlassCard>
    </div>

    <div className="panel-pad" style={{ display: "grid", gap: "16px", paddingBottom: "24px" }}>
      {opportunities.map((opportunity) => <GlassCard className="panel" key={opportunity.id} style={{ display: "grid", gap: "16px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "16px", alignItems: "start" }}>
          <div style={{ display: "grid", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <span className="rank-badge" style={{ width: 26, height: 26, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #c0c1ff, #ddb7ff)", color: "#15151b", fontWeight: 700, fontSize: "12px", fontFamily: "var(--font-geist-mono), monospace" }}>{opportunity.rank}</span>
              <h2 style={{ margin: 0, fontSize: "15px", lineHeight: 1.4 }}>{opportunity.title}</h2>
              <span className={`badge ${opportunity.mvpRole.startsWith("PRIMARY") ? "badge-success" : "badge-warning"}`}><span className="badge-dot" />{opportunity.mvpRole}</span>
            </div>
            <p style={{ margin: 0, fontSize: "12.5px", lineHeight: 1.65, color: "rgba(229,226,225,.82)" }}>{opportunity.problem}</p>
          </div>
          <div style={{ display: "grid", gap: "8px", justifyContent: "end", textAlign: "right" }}>
            <div><span style={{ display: "block", color: "var(--muted)", fontSize: "9px", textTransform: "uppercase", letterSpacing: ".12em" }}>Overall score</span><strong style={{ fontSize: "30px", lineHeight: 1, background: "linear-gradient(90deg, #c0c1ff, #ddb7ff)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{opportunity.combinedScore}</strong><span style={{ color: "var(--muted)", fontSize: "10px" }}>/ 100</span></div>
            <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
              <span className={`badge ${CONFIDENCE_TONE[opportunity.confidence]}`}><span className="badge-dot" />{opportunity.confidence}</span>
              <span className={`badge ${STRENGTH_TONE[opportunity.evidenceStrength]}`}><span className="badge-dot" />{opportunity.evidenceStrength}</span>
              <span className={`badge ${EFFORT_TONE[opportunity.estimatedEffort]}`}><span className="badge-dot" />{opportunity.estimatedEffort} effort</span>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "10px" }}>
          <div className="mini-metric"><Quote size={12} style={{ color: "var(--accent)" }} /><span>Reviews supporting</span><strong>{opportunity.evidenceCount}</strong><small>{Object.entries(opportunity.sourceBreakdown).map(([s, c]) => `${s}: ${c}`).join(" · ")}</small></div>
          <div className="mini-metric"><BookOpen size={12} style={{ color: "var(--accent)" }} /><span>Theory matches</span><strong>{opportunity.theoryMatches}</strong><small>Behavioural theories</small></div>
          <div className="mini-metric"><Briefcase size={12} style={{ color: "var(--accent)" }} /><span>Case studies</span><strong>{opportunity.caseStudyMatches}</strong><small>Industry support</small></div>
          <div className="mini-metric"><FileText size={12} style={{ color: "var(--accent)" }} /><span>Academic papers</span><strong>{opportunity.academicMatches}</strong><small>Research support</small></div>
        </div>

        <div className="grid-2">
          <div style={{ padding: "12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,.07)", background: "rgba(255,255,255,.03)" }}><span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--muted)", fontSize: "9px", textTransform: "uppercase", letterSpacing: ".1em" }}><Scale size={11} />Business impact</span><p style={{ margin: "6px 0 0", fontSize: "11.5px", lineHeight: 1.6, color: "rgba(229,226,225,.8)" }}>{opportunity.businessImpact}</p></div>
          <div style={{ padding: "12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,.07)", background: "rgba(255,255,255,.03)" }}><span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--muted)", fontSize: "9px", textTransform: "uppercase", letterSpacing: ".1em" }}><Target size={11} />User impact</span><p style={{ margin: "6px 0 0", fontSize: "11.5px", lineHeight: 1.6, color: "rgba(229,226,225,.8)" }}>{opportunity.userImpact}</p></div>
        </div>

        <div style={{ display: "grid", gap: "8px" }}>
          {opportunity.supportingThemes.length > 0 && <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}><span style={{ color: "var(--muted)", fontSize: "9px", textTransform: "uppercase", letterSpacing: ".1em" }}>Supporting themes</span>{opportunity.supportingThemes.map((t) => <span className="chip" key={t.theme}>{titleCase(t.theme)} <span style={{ opacity: .6 }}>· {t.count}</span></span>)}</div>}
          {opportunity.behaviouralTheories.length > 0 && <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}><span style={{ color: "var(--muted)", fontSize: "9px", textTransform: "uppercase", letterSpacing: ".1em" }}>Explained by</span>{opportunity.behaviouralTheories.slice(0, 3).map((t) => <span className="chip" key={t}>{theoryName(t)}</span>)}</div>}
          {opportunity.categories.length > 0 && <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}><span style={{ color: "var(--muted)", fontSize: "9px", textTransform: "uppercase", letterSpacing: ".1em" }}>Categories affected</span>{opportunity.categories.map((c) => <span className="chip" key={c}>{c}</span>)}</div>}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: "4px", borderTop: "1px solid rgba(255,255,255,.06)" }}>
          <Link className="button button-primary" href={`/opportunities/${opportunity.id}`}>View Full Analysis<ArrowUpRight size={16} /></Link>
        </div>
      </GlassCard>)}
    </div>

    {report?.executiveSummary && <div className="research-rule" style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}><Award size={17} style={{ color: "var(--accent)", flex: "0 0 auto" }} /><div><strong>{report.title}</strong><p>{report.executiveSummary}</p></div></div>}
    </>}
  </div>;
}
