"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Award, BookOpen, Briefcase, FileText, Gauge, Lightbulb, Quote, Scale, ShieldCheck, Sparkles, Target, TrendingUp, Zap } from "lucide-react";
import { EmptyState, GlassCard, MetricsSkeleton, SkeletonRows } from "@/components/ui";
import type { RecommendationReport } from "@/lib/api";

const CONFIDENCE_TONE: Record<string, string> = { High: "badge-success", "Med-High": "badge-warning", Medium: "badge-warning" };
const RISK_TONE: Record<string, string> = { High: "badge-danger", Medium: "badge-warning", Low: "badge-success" };

function scoreWidth(value: number, max: number): string {
  return `${Math.min(100, Math.round((value / max) * 100))}%`;
}

export function RecommendationIndex() {
  const [data, setData] = useState<RecommendationReport | null>(null);
  const [error, setError] = useState<string>();
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    fetch("/api/recommendation", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 404) {
          setMissing(true);
          return null;
        }
        if (!r.ok) throw new Error(`Recommendation is not available (HTTP ${r.status}).`);
        return r.json();
      })
      .then((json) => {
        if (json) setData(json);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Failed to load recommendation."));
  }, []);

  if (error) return <div className="page"><div className="notice notice-error">{error}</div></div>;
  if (missing) return <div className="page"><div className="page-heading"><div><span className="eyebrow">Final decision</span><h1>Recommendation</h1><p>The final decision presented to leadership — what to build, why, on what evidence, and what remains unknown.</p></div></div><GlassCard className="panel-pad"><EmptyState icon={Zap} title="No recommendation yet" body="A recommendation is produced once a discovery run scores the evidence and the engine selects the leading MVP. Nothing is shown until then." action={{ href: "/discovery", label: "Run a discovery" }} /></GlassCard></div>;
  if (!data) return <div className="page"><div className="page-heading"><div><span className="eyebrow">Final decision</span><h1>Recommendation</h1><p>The final decision presented to leadership — what to build, why, on what evidence, and what remains unknown.</p></div></div><MetricsSkeleton /><GlassCard className="panel-pad"><SkeletonRows count={6} /></GlassCard></div>;

  const { hero, whyThisWon, supportingEvidence, assumptions, outlook, comparison } = data;
  const selected = comparison[0];

  return <div className="page">
    <div className="page-heading"><div><span className="eyebrow">{data.report.status}</span><h1>Recommendation</h1><p>The final decision presented to leadership — what to build, why, on what evidence, and what remains unknown.</p></div></div>

    <GlassCard className="panel" style={{ marginBottom: "20px", overflow: "hidden" }}>
      <div style={{ padding: "34px 26px", background: "radial-gradient(120% 140% at 15% 0%, rgba(192,193,255,.14), rgba(221,183,255,.08) 45%, transparent 70%)", display: "grid", gap: "20px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          <span className="badge badge-success"><span className="badge-dot" />{hero.status}</span>
          <span className="badge badge-success"><span className="badge-dot" />{hero.mvpRole}</span>
          <span className={`badge ${CONFIDENCE_TONE[hero.confidence]}`}><span className="badge-dot" />{hero.confidence} confidence</span>
          <span className="badge badge-neutral"><span className="badge-dot" />{hero.id}</span>
        </div>
        <div className="grid-hero">
          <div>
            <span style={{ display: "block", color: "var(--muted)", fontSize: "10px", textTransform: "uppercase", letterSpacing: ".14em", marginBottom: "10px" }}>Primary recommended MVP</span>
            <h2 style={{ margin: 0, fontSize: "clamp(20px, 3vw, 30px)", lineHeight: 1.25, letterSpacing: "-.02em" }}>{hero.title}</h2>
            <p style={{ margin: "12px 0 0", fontSize: "13.5px", lineHeight: 1.7, color: "rgba(229,226,225,.8)", maxWidth: "62ch" }}>{hero.tagline}</p>
          </div>
          <div style={{ display: "grid", gap: "14px" }}>
            <div style={{ padding: "18px", borderRadius: "14px", border: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.035)" }}>
              <span style={{ color: "var(--muted)", fontSize: "9px", textTransform: "uppercase", letterSpacing: ".12em" }}>Overall score</span>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}><strong style={{ fontSize: "38px", lineHeight: 1.1, background: "linear-gradient(90deg, #c0c1ff, #ddb7ff)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{hero.weightedScore}</strong><span style={{ color: "var(--muted)", fontSize: "13px" }}>/ {hero.weightedMax}.00</span></div>
              <div style={{ height: "5px", borderRadius: "4px", background: "rgba(255,255,255,.08)", overflow: "hidden", marginTop: "8px" }}><div style={{ width: scoreWidth(hero.weightedScore, hero.weightedMax), height: "100%", borderRadius: "4px", background: "linear-gradient(90deg, #c0c1ff, #ddb7ff)" }} /></div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px", color: "var(--muted)", fontSize: "10px" }}><span>Weighted criteria</span><span style={{ fontFamily: "var(--font-geist-mono), monospace" }}>{hero.combinedScore}/100</span></div>
            </div>
          </div>
        </div>
      </div>
    </GlassCard>

    <GlassCard className="panel" style={{ marginBottom: "20px" }}>
      <div className="section-header"><div><span className="eyebrow">Section 2</span><h2>Why this won</h2><p>The primary MVP wins on every dimension that matters.</p></div><Award size={18} style={{ color: "var(--accent)" }} /></div>
      <div className="panel-pad" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px", paddingTop: 0 }}>
        <div className="why-card"><span style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--muted)", fontSize: "9px", textTransform: "uppercase", letterSpacing: ".1em" }}><Scale size={12} style={{ color: "var(--accent)" }} />Business value · 5/5</span><p>{whyThisWon.businessValue}</p></div>
        <div className="why-card"><span style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--muted)", fontSize: "9px", textTransform: "uppercase", letterSpacing: ".1em" }}><Target size={12} style={{ color: "var(--accent)" }} />User value · 5/5</span><p>{whyThisWon.userValue}</p></div>
        <div className="why-card"><span style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--muted)", fontSize: "9px", textTransform: "uppercase", letterSpacing: ".1em" }}><Lightbulb size={12} style={{ color: "var(--accent)" }} />Behavioural reasoning</span><p>{whyThisWon.behaviouralReasoning}</p></div>
        <div className="why-card"><span style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--muted)", fontSize: "9px", textTransform: "uppercase", letterSpacing: ".1em" }}><Sparkles size={12} style={{ color: "var(--accent)" }} />Evidence summary</span><p>{whyThisWon.evidence.records} verified records across {whyThisWon.evidence.sourceTypes} source types, {whyThisWon.evidence.theories} behavioural theories, {whyThisWon.evidence.caseStudies} industry case studies, {whyThisWon.evidence.papers} academic papers, and {whyThisWon.evidence.commerceInsights} commerce insights.</p></div>
      </div>
    </GlassCard>

    <GlassCard className="panel" style={{ marginBottom: "20px" }}>
      <div className="section-header"><div><span className="eyebrow">Section 3</span><h2>Supporting evidence</h2><p>Depth of triangulation behind the recommendation. No raw datasets are exposed.</p></div></div>
      <div className="panel-pad" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px", paddingTop: 0 }}>
        <div className="mini-metric"><Quote size={12} style={{ color: "var(--accent)" }} /><span>Reviews analysed</span><strong>{supportingEvidence.reviewsAnalysed.primary}</strong><small>Primary MVP records · {supportingEvidence.reviewsAnalysed.corpus} across the corpus</small></div>
        <div className="mini-metric"><BookOpen size={12} style={{ color: "var(--accent)" }} /><span>Behavioural theories</span><strong>{supportingEvidence.theories}</strong><small>Referenced in support</small></div>
        <div className="mini-metric"><Briefcase size={12} style={{ color: "var(--accent)" }} /><span>Industry case studies</span><strong>{supportingEvidence.caseStudies}</strong><small>Referenced in support</small></div>
        <div className="mini-metric"><FileText size={12} style={{ color: "var(--accent)" }} /><span>Academic papers</span><strong>{supportingEvidence.papers}</strong><small>Referenced in support</small></div>
        <div className="mini-metric"><TrendingUp size={12} style={{ color: "var(--accent)" }} /><span>Commerce insights</span><strong>{supportingEvidence.commerceInsights}</strong><small>Referenced in support</small></div>
      </div>
    </GlassCard>

    <GlassCard className="panel" style={{ marginBottom: "20px" }}>
      <div className="section-header"><div><span className="eyebrow">Section 4</span><h2>Comparison</h2><p>Top five opportunities ranked by the weighted decision score. The selected MVP is highlighted.</p></div><span className="badge badge-success"><span className="badge-dot" />{comparison.length} compared</span></div>
      <div className="panel-pad" style={{ display: "grid", gap: "10px", paddingTop: 0 }}>
        {comparison.map((opportunity) => {
          const isSelected = opportunity.id === hero.id;
          return <div key={opportunity.id} style={{ display: "grid", gap: "10px", padding: "14px 16px", borderRadius: "12px", border: isSelected ? "1px solid rgba(192,193,255,.5)" : "1px solid rgba(255,255,255,.07)", background: isSelected ? "rgba(192,193,255,.06)" : "rgba(255,255,255,.025)", boxShadow: isSelected ? "0 0 24px 1px rgba(192,193,255,.12)" : undefined }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <span style={{ width: 26, height: 26, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", background: isSelected ? "linear-gradient(135deg, #c0c1ff, #ddb7ff)" : "rgba(255,255,255,.08)", color: isSelected ? "#15151b" : "var(--muted)", fontWeight: 700, fontSize: "12px", fontFamily: "var(--font-geist-mono), monospace" }}>{opportunity.rank}</span>
              <strong style={{ fontSize: "13px", flex: 1, minWidth: 0 }}>{opportunity.title}</strong>
              {isSelected && <span className="badge badge-success"><span className="badge-dot" />Selected MVP</span>}
              <span className={`badge ${CONFIDENCE_TONE[opportunity.confidence]}`}><span className="badge-dot" />{opportunity.confidence}</span>
              <span style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: "14px" }}>{opportunity.combinedScore}<span style={{ color: "var(--muted)", fontSize: "10px" }}>/100</span></span>
            </div>
            <div className="grid-2" style={{ gap: "14px" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", color: "var(--muted)", fontSize: "9px" }}><span>Weighted decision score</span><span style={{ fontFamily: "var(--font-geist-mono), monospace" }}>{opportunity.weightedScore} / {hero.weightedMax}</span></div>
                <div style={{ height: "5px", borderRadius: "4px", background: "rgba(255,255,255,.07)", overflow: "hidden" }}><div style={{ width: scoreWidth(opportunity.weightedScore, hero.weightedMax), height: "100%", borderRadius: "4px", background: isSelected ? "linear-gradient(90deg, #c0c1ff, #ddb7ff)" : "rgba(255,255,255,.25)" }} /></div>
              </div>
              <p style={{ margin: 0, fontSize: "10.5px", lineHeight: 1.55, color: "rgba(229,226,225,.72)" }}>{opportunity.tradeOff}</p>
            </div>
          </div>;
        })}
      </div>
    </GlassCard>

    <GlassCard className="panel" style={{ marginBottom: "20px" }}>
      <div className="section-header"><div><span className="eyebrow">Section 5</span><h2>Remaining assumptions</h2><p>What the recommendation relies on. Explicit and unchanged from the decision report.</p></div><Gauge size={18} style={{ color: "var(--accent)" }} /></div>
      <div className="panel-pad" style={{ display: "grid", gap: "10px", paddingTop: 0 }}>
        {assumptions.map((assumption, index) => <div key={index} style={{ display: "flex", gap: "12px", alignItems: "flex-start", padding: "12px 14px", borderRadius: "10px", border: "1px solid rgba(255,255,255,.07)", background: "rgba(255,255,255,.03)" }}>
          <span style={{ width: 22, height: 22, borderRadius: "50%", flex: "0 0 auto", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,.08)", color: "var(--muted)", fontSize: "10px", fontFamily: "var(--font-geist-mono), monospace" }}>{index + 1}</span>
          <p style={{ margin: 0, fontSize: "12px", lineHeight: 1.65, color: "rgba(229,226,225,.85)" }}>{assumption}</p>
        </div>)}
      </div>
    </GlassCard>

    <GlassCard className="panel" style={{ marginBottom: "20px" }}>
      <div className="section-header"><div><span className="eyebrow">Section 6</span><h2>Implementation outlook</h2><p>Expected outcomes and known risks. No speculative roadmap.</p></div><Target size={18} style={{ color: "var(--accent)" }} /></div>
      <div className="panel-pad" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px", paddingTop: 0 }}>
        <div className="why-card"><span style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--muted)", fontSize: "9px", textTransform: "uppercase", letterSpacing: ".1em" }}><Target size={12} style={{ color: "var(--accent)" }} />Expected user outcome</span><p>{outlook.expectedUserOutcome}</p></div>
        <div className="why-card"><span style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--muted)", fontSize: "9px", textTransform: "uppercase", letterSpacing: ".1em" }}><Scale size={12} style={{ color: "var(--accent)" }} />Expected business outcome</span><p>{outlook.expectedBusinessOutcome}</p></div>
      </div>
      <div className="panel-pad" style={{ display: "grid", gap: "10px", paddingTop: 0 }}>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <span className="chip"><TrendingUp size={11} style={{ marginRight: 4 }} />Primary metric: {outlook.primaryMetric}</span>
          <span className="chip"><ShieldCheck size={11} style={{ marginRight: 4 }} />Guardrail: {outlook.guardrailMetric}</span>
        </div>
        <h3 style={{ margin: "8px 0 2px", fontSize: "10px", textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted)" }}>Known risks</h3>
        {outlook.risks.map((item, index) => <div key={index} className="risk-grid" style={{ padding: "11px 14px", borderRadius: "10px", border: "1px solid rgba(255,255,255,.07)", background: "rgba(255,255,255,.025)" }}>
          <p style={{ margin: 0, fontSize: "11.5px", lineHeight: 1.55 }}>{item.risk}</p>
          <span className={`badge ${RISK_TONE[item.likelihood]}`}><span className="badge-dot" />{item.likelihood}</span>
          <span className={`badge ${RISK_TONE[item.impact]}`}><span className="badge-dot" />{item.impact} impact</span>
          <p style={{ margin: 0, fontSize: "10.5px", lineHeight: 1.55, color: "rgba(229,226,225,.7)" }}>{item.mitigation}</p>
        </div>)}
      </div>
    </GlassCard>

    <div style={{ display: "flex", gap: "12px", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", paddingBottom: "8px" }}>
      <div className="research-rule" style={{ margin: 0, display: "flex", gap: "10px", alignItems: "flex-start", flex: 1 }}><ShieldCheck size={17} style={{ color: "var(--accent)", flex: "0 0 auto" }} /><div><strong>{data.report.title} — {data.report.status}</strong><p>{data.report.source}. All content is sourced from the existing human-reviewed research output; no AI was used in this interface.</p></div></div>
      <Link className="button button-primary" href={`/opportunities/${hero.id}`}>View MVP analysis<ArrowUpRight size={16} /></Link>
    </div>
  </div>;
}
