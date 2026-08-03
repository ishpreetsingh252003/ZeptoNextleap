"use client";

import { useEffect, useState } from "react";
import { ArrowDown, BookOpen, Briefcase, FileSearch, GraduationCap, Lightbulb, LineChart, Quote, ShieldCheck, Sparkles, Target } from "lucide-react";
import { EmptyState, GlassCard, MetricsSkeleton, SkeletonRows } from "@/components/ui";
import { cachedJson } from "@/lib/client-cache";
import { titleCase, type AiTheme, type BehaviorRecord, type InsightsReport } from "@/lib/api";

const THEME_META: Record<string, { icon: typeof BookOpen; tone: string }> = {
  theories: { icon: BookOpen, tone: "badge-warning" },
  commerce: { icon: LineChart, tone: "badge-success" },
  caseStudies: { icon: Briefcase, tone: "badge-warning" },
  papers: { icon: GraduationCap, tone: "badge-success" },
};

const STRENGTH_TONE: Record<string, string> = { High: "badge-success", Medium: "badge-warning", Low: "badge-neutral" };

function StrengthBadge({ strength }: { strength: string }) {
  return <span className={`badge ${STRENGTH_TONE[strength] ?? "badge-neutral"}`}><span className="badge-dot" />{strength} strength</span>;
}

function ThemeTag({ theme }: { theme: string }) {
  return <span className="chip">{titleCase(theme)}</span>;
}

function Snippet({ excerpt }: { excerpt: string }) {
  return <blockquote style={{ margin: 0, padding: "10px 12px", borderRadius: "8px", background: "rgba(255,255,255,.04)", borderLeft: "2px solid var(--accent)", fontSize: "11px", lineHeight: 1.6, color: "rgba(229,226,225,.8)" }}><Quote size={11} style={{ color: "var(--accent)", marginRight: 4 }} /><em>{excerpt}</em></blockquote>;
}

function KnowledgeRecordCard({ record }: { record: BehaviorRecord }) {
  return <div style={{ padding: "14px", borderRadius: "12px", border: "1px solid rgba(255,255,255,.07)", background: "rgba(255,255,255,.025)", display: "grid", gap: "8px" }}>
    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
      <ThemeTag theme={record.theme} />
      {record.reviewed && <span className="badge badge-success"><span className="badge-dot" />Reviewed</span>}
    </div>
    <strong style={{ fontSize: "12px", lineHeight: 1.5 }}>{record.source}</strong>
    <p style={{ margin: 0, fontSize: "11.5px", lineHeight: 1.65, color: "rgba(229,226,225,.75)" }}>{record.summary}</p>
    {record.notes && <span style={{ color: "var(--muted)", fontSize: "10px", lineHeight: 1.5 }}>{record.notes}</span>}
  </div>;
}

function ThemeCard({ theme }: { theme: AiTheme }) {
  const example = theme.examples[0];
  const theories = theme.theories.slice(0, 2);
  return <GlassCard className="panel" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
      <div>
        <h3 style={{ margin: 0, fontSize: "14px", color: "var(--ink)" }}>{theme.name}</h3>
        <span style={{ color: "var(--muted)", fontSize: "10px", fontFamily: "var(--font-geist-mono), monospace" }}>{theme.count} items · {theme.distinctSources} source{theme.distinctSources === 1 ? "" : "s"}</span>
      </div>
      <StrengthBadge strength={theme.strength} />
    </div>
    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
      {theme.sourceTypes.map((s) => <span className="chip" key={s}>{s}</span>)}
    </div>
    {example && <Snippet excerpt={example.excerpt} />}
    {theories.length > 0 && <div style={{ display: "grid", gap: "6px" }}>
      <span style={{ color: "var(--muted)", fontSize: "9px", textTransform: "uppercase", letterSpacing: ".1em" }}>Explained by</span>
      {theories.map((theory) => <div key={theory.id} style={{ display: "flex", gap: "8px", alignItems: "baseline" }}><ThemeTag theme={theory.theme} /><span style={{ fontSize: "11px", lineHeight: 1.5 }}>{theory.source}</span></div>)}
    </div>}
    {theme.opportunities.length > 0 && <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "auto", paddingTop: "2px" }}>
      {theme.opportunities.map((opp) => <span className="chip" key={opp.id}><Target size={10} style={{ marginRight: 4 }} />{opp.label}</span>)}
    </div>}
  </GlassCard>;
}

function ConnectionCard({ theme }: { theme: AiTheme }) {
  const example = theme.examples[0];
  const theory = theme.theories[0];
  const opportunity = theme.opportunities[0];
  const step = (icon: React.ReactNode, label: string, title: string, body: string) => <div style={{ display: "grid", gap: "4px" }}>
    <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--muted)", fontSize: "9px", textTransform: "uppercase", letterSpacing: ".1em" }}>{icon}{label}</span>
    <strong style={{ fontSize: "12px" }}>{title}</strong>
    <p style={{ margin: 0, fontSize: "11px", lineHeight: 1.55, color: "rgba(229,226,225,.72)" }}>{body}</p>
  </div>;
  return <GlassCard className="panel" style={{ display: "grid", gap: "10px" }}>
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}><Lightbulb size={15} style={{ color: "var(--accent)" }} /><h3 style={{ margin: 0, fontSize: "13px" }}>{theme.name}</h3><span className={`badge ${STRENGTH_TONE[theme.strength]}`}><span className="badge-dot" />{theme.strength}</span></div>
    {example ? step(<Quote size={11} style={{ color: "var(--accent)" }} />, "What users say", `${example.sourceType} review`, example.excerpt) : <span style={{ color: "var(--muted)", fontSize: "11px" }}>No example review available.</span>}
    <ArrowDown size={13} style={{ color: "var(--muted)", marginLeft: 8 }} />
    {step(<Sparkles size={11} style={{ color: "var(--accent)" }} />, "Pattern", theme.name, `Coded across ${theme.count} items in ${theme.categories.slice(0, 3).join(", ")}.`)}
    <ArrowDown size={13} style={{ color: "var(--muted)", marginLeft: 8 }} />
    {theory ? step(<BookOpen size={11} style={{ color: "var(--accent)" }} />, "Why it happens", theory.source, theory.summary) : <span style={{ color: "var(--muted)", fontSize: "11px" }}>No matching theory in the knowledge base.</span>}
    <ArrowDown size={13} style={{ color: "var(--muted)", marginLeft: 8 }} />
    {opportunity ? step(<Target size={11} style={{ color: "var(--accent)" }} />, "What to act on", opportunity.label, `${theme.theoryThemes.map(titleCase).join(" / ")} · ${theme.count} evidence items`) : <span style={{ color: "var(--muted)", fontSize: "11px" }}>No linked opportunity.</span>}
  </GlassCard>;
}

export function InsightsIndex() {
  const [report, setReport] = useState<InsightsReport | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    cachedJson<InsightsReport>("/api/insights")
      .then(setReport)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Failed to load insights."));
  }, []);

  if (error) return <div className="page"><div className="notice notice-error">{error}</div></div>;
  if (!report) return <div className="page"><div className="page-heading"><div><span className="eyebrow">Intelligence report</span><h1>Insights</h1><p>Behavioural principles and recurring patterns, grounded in reviewed evidence from public conversations.</p></div></div><MetricsSkeleton /><GlassCard className="panel-pad"><SkeletonRows count={6} /></GlassCard></div>;

  const summary = report.executiveSummary;
  const knowledgeTotal = Object.values(summary.knowledgeCounts).reduce((a, b) => a + b, 0);
  const topThemes = report.aiThemes.slice(0, 6);
  const themeGroups: { strength: string; themes: AiTheme[] }[] = ["High", "Medium", "Low"].map((strength) => ({ strength, themes: topThemes.filter((t) => t.strength === strength) })).filter((g) => g.themes.length > 0);

  if (summary.evidenceCount === 0) {
    return <div className="page"><GlassCard className="panel-pad"><EmptyState icon={Lightbulb} title="No insights yet" body="Insights are synthesized only from reviewed evidence. Run a discovery to populate the corpus first." action={{ href: "/discovery", label: "Start a discovery" }} /></GlassCard></div>;
  }

  const sections: { label: string; icon: typeof BookOpen; tone: string; records: BehaviorRecord[] }[] = [
    { label: "Behavioural Theories", icon: THEME_META.theories.icon, tone: THEME_META.theories.tone, records: report.behaviouralTheories },
    { label: "Commerce Insights", icon: THEME_META.commerce.icon, tone: THEME_META.commerce.tone, records: report.commerceInsights },
    { label: "Industry Case Studies", icon: THEME_META.caseStudies.icon, tone: THEME_META.caseStudies.tone, records: report.industryCaseStudies },
    { label: "Research Papers", icon: THEME_META.papers.icon, tone: THEME_META.papers.tone, records: report.researchPapers },
  ];

  return <div className="page">
    <div className="page-heading"><div><span className="eyebrow">Intelligence report</span><h1>Insights</h1><p>Behavioural principles and recurring patterns, grounded in reviewed evidence from public conversations.</p></div></div>

    <div className="metrics">
      <GlassCard className="metric"><span>Evidence items</span><strong>{summary.evidenceCount}</strong><p>Retained and coded</p></GlassCard>
      <GlassCard className="metric"><span>Public sources</span><strong>{summary.sourceCount}</strong><p>{Object.keys(summary.sourceTypes).length} source types</p></GlassCard>
      <GlassCard className="metric"><span>Behavioural patterns</span><strong>{report.aiThemes.length}</strong><p>{summary.strengthDistribution.high} high / {summary.strengthDistribution.medium} medium / {summary.strengthDistribution.low} low strength</p></GlassCard>
      <GlassCard className="metric"><span>Knowledge base</span><strong>{knowledgeTotal}</strong><p>Theories, insights, cases, papers</p></GlassCard>
    </div>

    <GlassCard className="panel" style={{ marginBottom: "20px" }}>
      <div className="section-header"><div><span className="eyebrow">Section 1</span><h2>Executive summary</h2><p>Aggregated from the reviewed research corpus. No new analysis is generated.</p></div><Sparkles size={18} style={{ color: "var(--accent)" }} /></div>
      <div className="panel-pad" style={{ display: "grid", gap: "14px" }}>
        {summary.narrative.map((line, i) => <p key={i} style={{ margin: 0, fontSize: "14px", lineHeight: 1.7, color: i === 0 ? "var(--ink)" : "rgba(229,226,225,.75)", fontWeight: i === 0 ? 550 : 400 }}>{line}</p>)}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "10px", marginTop: "6px" }}>
          {summary.topThemes.map((t) => <div key={t.name} style={{ padding: "12px 14px", borderRadius: "10px", border: "1px solid rgba(255,255,255,.07)", background: "rgba(255,255,255,.03)" }}><span style={{ display: "block", color: "var(--muted)", fontSize: "9px", textTransform: "uppercase", letterSpacing: ".1em" }}>Top pattern</span><strong style={{ display: "block", marginTop: "5px", fontSize: "12px" }}>{t.name}</strong><span style={{ display: "block", marginTop: "3px", color: "var(--muted)", fontSize: "10px" }}>{t.count} items · {titleCase(t.strength)}</span></div>)}
        </div>
      </div>
    </GlassCard>

    <GlassCard className="panel" style={{ marginBottom: "20px" }}>
      <div className="section-header"><div><span className="eyebrow">Section 2</span><h2>Top behaviour themes</h2><p>The most repeated behavioural patterns in the evidence, grouped by strength, with what users said and which principles explain them.</p></div><span className="badge badge-success"><span className="badge-dot" />{report.aiThemes.length} patterns</span></div>
      <div className="panel-pad" style={{ display: "grid", gap: "20px", paddingTop: 0 }}>
        {themeGroups.map((group) => <div key={group.strength} style={{ display: "grid", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span className={`badge ${STRENGTH_TONE[group.strength]}`}><span className="badge-dot" />{group.strength} strength</span>
            <span style={{ color: "var(--muted)", fontSize: "10px" }}>{group.themes.length} pattern{group.themes.length === 1 ? "" : "s"}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "14px" }}>
            {group.themes.map((theme) => <ThemeCard theme={theme} key={theme.name} />)}
          </div>
        </div>)}
      </div>
    </GlassCard>

    <GlassCard className="panel" style={{ marginBottom: "20px" }}>
      <div className="section-header"><div><span className="eyebrow">Section 3</span><h2>Behaviour knowledge</h2><p>Human-reviewed records that explain the observed patterns, grouped by mechanism.</p></div></div>
      <div className="panel-pad" style={{ display: "grid", gap: "18px" }}>
        {sections.map((section) => {
          const groups = new Map<string, BehaviorRecord[]>();
          section.records.forEach((record) => { const key = record.theme || "uncategorised"; groups.set(key, [...(groups.get(key) ?? []), record]); });
          return <div key={section.label} style={{ display: "grid", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <section.icon size={16} style={{ color: "var(--accent)" }} />
              <h3 style={{ margin: 0, fontSize: "13px" }}>{section.label}</h3>
              <span className={`badge ${section.tone}`}><span className="badge-dot" />{section.records.length} records</span>
            </div>
            {section.records.length === 0 ? <div className="empty"><div className="empty-icon"><FileSearch size={22} /></div><h3>No records yet</h3><p>This knowledge base section is empty.</p></div> : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px" }}>
              {[...groups.entries()].map(([theme, records]) => <div key={theme} style={{ display: "grid", gap: "8px", alignContent: "start" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--muted)", fontSize: "10px", textTransform: "uppercase", letterSpacing: ".08em" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)" }} />{titleCase(theme)} · {records.length}</div>
                {records.map((record) => <KnowledgeRecordCard record={record} key={record.id} />)}
              </div>)}
            </div>}
          </div>;
        })}
      </div>
    </GlassCard>

    <GlassCard className="panel" style={{ marginBottom: "20px" }}>
      <div className="section-header"><div><span className="eyebrow">Section 4</span><h2>Evidence connections</h2><p>Trace how a user review becomes a theme, is explained by a behavioural principle, and points to an opportunity.</p></div></div>
      <div className="panel-pad" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "14px" }}>
        {topThemes.slice(0, 4).map((theme) => <ConnectionCard theme={theme} key={theme.name} />)}
      </div>
    </GlassCard>

    <div className="research-rule" style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}><ShieldCheck size={17} style={{ color: "var(--accent)", flex: "0 0 auto" }} /><div><strong>Interpretation boundary</strong><p>Behavioural knowledge explains mechanisms; it does not by itself prove that a pattern is prevalent or Zepto-specific. Only reviewed evidence establishes that.</p></div></div>
  </div>;
}
