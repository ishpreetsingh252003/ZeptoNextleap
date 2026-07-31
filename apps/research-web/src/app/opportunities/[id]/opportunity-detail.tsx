"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Award, BookOpen, Briefcase, FileText, Lightbulb, Quote, Scale, ShieldCheck, Target, TrendingUp } from "lucide-react";
import { GlassCard, SkeletonRows } from "@/components/ui";
import { titleCase, type OpportunityReport } from "@/lib/api";

const STRENGTH_TONE: Record<string, string> = { "Very Strong": "badge-success", Strong: "badge-success", Moderate: "badge-warning", Emerging: "badge-neutral" };
const CONFIDENCE_TONE: Record<string, string> = { High: "badge-success", "Med-High": "badge-warning", Medium: "badge-warning" };

function theoryName(line: string): string {
  const colon = line.indexOf(":");
  return colon > 0 ? line.slice(0, colon) : line;
}

function CriterionBar({ label, value, max }: { label: string; value: number; max: number }) {
  return <div style={{ display: "grid", gap: "5px" }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}><span style={{ color: "var(--muted)", fontSize: "10px" }}>{label}</span><span style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: "11px" }}>{value}</span></div>
    <div style={{ height: "6px", borderRadius: "4px", background: "rgba(255,255,255,.06)", overflow: "hidden" }}>
      <div style={{ width: `${(value / max) * 100}%`, height: "100%", borderRadius: "4px", background: "linear-gradient(90deg, #c0c1ff, #ddb7ff)" }} />
    </div>
  </div>;
}

function FlowStep({ icon, label, body }: { icon: React.ReactNode; label: string; body: string }) {
  return <div style={{ display: "grid", gap: "5px", padding: "14px", borderRadius: "12px", border: "1px solid rgba(255,255,255,.07)", background: "rgba(255,255,255,.03)" }}>
    <span style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--muted)", fontSize: "9px", textTransform: "uppercase", letterSpacing: ".1em" }}>{icon}{label}</span>
    <p style={{ margin: 0, fontSize: "12px", lineHeight: 1.65, color: "rgba(229,226,225,.85)" }}>{body}</p>
  </div>;
}

export function OpportunityDetail() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<OpportunityReport | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    fetch(`/api/opportunities/${params.id}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Opportunity was not found (HTTP ${r.status}).`);
        return r.json();
      })
      .then(setData)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Failed to load opportunity."));
  }, [params.id]);

  if (error) return <div className="page"><div className="notice notice-error">{error}</div></div>;
  if (!data) return <div className="page"><GlassCard className="panel-pad"><SkeletonRows count={6} /></GlassCard></div>;

  const opportunity = data.opportunities[0];
  const maxEvidence = 45;
  const criteriaMax = { evidenceCount: 45, theoryMatches: 10, caseStudyMatches: 7, academicMatches: 6 };

  return <div className="page">
    <Link href="/opportunities" className="back-link" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--muted)", fontSize: "11px", marginBottom: "18px" }}><ArrowLeft size={14} />All opportunities</Link>

    <div className="page-heading">
      <div>
        <span className="eyebrow">Opportunity #{opportunity.rank} · {opportunity.id}</span>
        <h1>{opportunity.title}</h1>
        <p>{opportunity.problem}</p>
      </div>
      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
        <span className={`badge ${CONFIDENCE_TONE[opportunity.confidence]}`}><span className="badge-dot" />{opportunity.confidence} confidence</span>
        <span className={`badge ${STRENGTH_TONE[opportunity.evidenceStrength]}`}><span className="badge-dot" />{opportunity.evidenceStrength} evidence</span>
        <span className={`badge ${opportunity.mvpRole.startsWith("PRIMARY") ? "badge-success" : "badge-warning"}`}><span className="badge-dot" />{opportunity.mvpRole}</span>
      </div>
    </div>

    <div className="metrics">
      <GlassCard className="metric"><span>Overall score</span><strong>{opportunity.combinedScore}</strong><p>Combined evidence score</p></GlassCard>
      <GlassCard className="metric"><span>Supporting reviews</span><strong>{opportunity.evidenceCount}</strong><p>Verified records</p></GlassCard>
      <GlassCard className="metric"><span>Behaviour theories</span><strong>{opportunity.theoryMatches}</strong><p>Supporting records</p></GlassCard>
      <GlassCard className="metric"><span>Industry + academic</span><strong>{opportunity.caseStudyMatches + opportunity.academicMatches}</strong><p>Case studies & papers</p></GlassCard>
    </div>

    <GlassCard className="panel" style={{ marginBottom: "20px" }}>
      <div className="section-header"><div><span className="eyebrow">Evidence strength</span><h2>Criteria breakdown</h2><p>How the overall score is composed from the reviewed research corpus.</p></div></div>
      <div className="panel-pad" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px" }}>
        <CriterionBar label="Evidence count" value={opportunity.evidenceCount} max={maxEvidence} />
        <CriterionBar label="Behavioural theory matches" value={opportunity.theoryMatches} max={criteriaMax.theoryMatches} />
        <CriterionBar label="Industry case study matches" value={opportunity.caseStudyMatches} max={criteriaMax.caseStudyMatches} />
        <CriterionBar label="Academic paper matches" value={opportunity.academicMatches} max={criteriaMax.academicMatches} />
      </div>
    </GlassCard>

    <div style={{ display: "grid", gap: "16px", marginBottom: "20px" }}>
      <FlowStep icon={<Quote size={11} style={{ color: "var(--accent)" }} />} label="Problem" body={opportunity.problem} />

      <FlowStep icon={<TrendingUp size={11} style={{ color: "var(--accent)" }} />} label="Supporting reviews" body={`${opportunity.evidenceCount} verified records across ${Object.keys(opportunity.sourceBreakdown).join(", ")} — ${Object.entries(opportunity.sourceBreakdown).map(([s, c]) => `${s}: ${c}`).join(" · ")}. Full excerpts are browsable in the Reviews workspace.`} />

      <div className="grid-2">
        <GlassCard className="panel" style={{ display: "grid", gap: "12px" }}>
          <div className="section-header" style={{ padding: "16px 18px 12px" }}><div><span className="eyebrow">Behavioural explanation</span><h2 style={{ fontSize: "13px" }}>Behavioural theories</h2></div><BookOpen size={15} style={{ color: "var(--accent)" }} /></div>
          <div className="panel-pad" style={{ paddingTop: 0, display: "grid", gap: "10px" }}>
            {opportunity.behaviouralTheories.map((t) => <div key={t} style={{ display: "grid", gap: "3px" }}><strong style={{ fontSize: "11px" }}>{theoryName(t)}</strong><p style={{ margin: 0, fontSize: "11px", lineHeight: 1.6, color: "rgba(229,226,225,.72)" }}>{t.includes(":") ? t.slice(t.indexOf(":") + 1).trim() : t}</p></div>)}
          </div>
        </GlassCard>
        <div style={{ display: "grid", gap: "12px" }}>
          <GlassCard className="panel">
            <div className="section-header" style={{ padding: "16px 18px 12px" }}><div><span className="eyebrow">Industry support</span><h2 style={{ fontSize: "13px" }}>Case studies</h2></div><Briefcase size={15} style={{ color: "var(--accent)" }} /></div>
            <div className="panel-pad" style={{ paddingTop: 0, display: "grid", gap: "8px" }}>
              {opportunity.industrySupport.map((t) => <div key={t} style={{ fontSize: "11px", lineHeight: 1.55, color: "rgba(229,226,225,.8)" }}>{t}</div>)}
            </div>
          </GlassCard>
          <GlassCard className="panel">
            <div className="section-header" style={{ padding: "16px 18px 12px" }}><div><span className="eyebrow">Academic support</span><h2 style={{ fontSize: "13px" }}>Research papers</h2></div><FileText size={15} style={{ color: "var(--accent)" }} /></div>
            <div className="panel-pad" style={{ paddingTop: 0, display: "grid", gap: "8px" }}>
              {opportunity.academicSupport.map((t) => <div key={t} style={{ fontSize: "11px", lineHeight: 1.55, color: "rgba(229,226,225,.8)" }}>{t}</div>)}
            </div>
          </GlassCard>
        </div>
      </div>

      <div className="grid-2">
        <FlowStep icon={<Scale size={11} style={{ color: "var(--accent)" }} />} label="Business opportunity" body={opportunity.businessImpact} />
        <FlowStep icon={<Target size={11} style={{ color: "var(--accent)" }} />} label="User impact" body={opportunity.userImpact} />
      </div>

      <FlowStep icon={<Lightbulb size={11} style={{ color: "var(--accent)" }} />} label="Recommended product direction" body={opportunity.recommendedMvpFit} />
    </div>

    {(opportunity.proposedUserFlow && opportunity.proposedUserFlow.length > 0) && <GlassCard className="panel" style={{ marginBottom: "20px" }}>
      <div className="section-header"><div><span className="eyebrow">Recommended product direction</span><h2>Proposed non-technical user flow</h2><p>From the consolidated recommendation report.</p></div></div>
      <div className="panel-pad" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "12px" }}>
        {opportunity.proposedUserFlow.map((step, index) => <div key={step} style={{ display: "grid", gap: "6px", padding: "14px", borderRadius: "12px", border: "1px solid rgba(255,255,255,.07)", background: "rgba(255,255,255,.03)" }}>
          <span className="rank-badge" style={{ width: 22, height: 22, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #c0c1ff, #ddb7ff)", color: "#15151b", fontWeight: 700, fontSize: "10px", fontFamily: "var(--font-geist-mono), monospace" }}>{index + 1}</span>
          <p style={{ margin: 0, fontSize: "11.5px", lineHeight: 1.6, color: "rgba(229,226,225,.85)" }}>{step}</p>
        </div>)}
      </div>
      {opportunity.successMetrics && <div className="panel-pad" style={{ paddingTop: 0, display: "flex", gap: "10px", flexWrap: "wrap" }}>{opportunity.successMetrics.map((m) => <span className="chip" key={m}>{m}</span>)}</div>}
    </GlassCard>}

    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "20px", alignItems: "center" }}>
      <span style={{ color: "var(--muted)", fontSize: "9px", textTransform: "uppercase", letterSpacing: ".1em" }}>Supporting themes</span>
      {opportunity.supportingThemes.map((t) => <span className="chip" key={t.theme}>{titleCase(t.theme)} <span style={{ opacity: .6 }}>· {t.count}</span></span>)}
      {opportunity.categories.map((c) => <span className="chip" key={c}>{c}</span>)}
    </div>

    {opportunity.evidenceGaps.length > 0 && <div className="research-rule" style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}><ShieldCheck size={17} style={{ color: "var(--amber)", flex: "0 0 auto" }} /><div><strong>Evidence gaps</strong><p>{opportunity.evidenceGaps.join(" ")}</p></div></div>}

    <div className="research-rule" style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}><Award size={17} style={{ color: "var(--accent)", flex: "0 0 auto" }} /><div><strong>{data.report?.title}</strong><p>{data.report?.executiveSummary}</p></div></div>

    <div style={{ display: "flex", gap: "10px", alignItems: "center", justifyContent: "space-between", padding: "4px 0 8px" }}>
      <Link href="/opportunities" className="button button-secondary" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><ArrowLeft size={14} />Back to opportunities</Link>
      <Link className="button button-primary" href="/reviews">Browse supporting reviews<ArrowUpRight size={16} /></Link>
    </div>
  </div>;
}
