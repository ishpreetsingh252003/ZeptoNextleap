"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Compass } from "lucide-react";
import { formatDate, type DiscoveryStatus, type HistoryRun, type InsightsReport, type Opportunity, type RecommendationReport } from "@/lib/api";
import { cachedJson } from "@/lib/client-cache";
import { EmptyState, GlassCard, Metric, MetricsSkeleton, SectionHeader, SkeletonRows, StatusBadge } from "@/components/ui";

type HistoryResponse = { runs: HistoryRun[]; latest: HistoryRun | null };
type ReviewsResponse = { reviews: unknown[]; meta?: { label: string; total: number; mode: "live" | "cached" | "verified" } };
type OpportunityResponse = { report: { title: string; project: string; date: string; status: string; executiveSummary: string } | null; opportunities: Opportunity[] };

const DATASET_LABELS: Record<string, string> = { live: "Live Reviews", cached: "Cached Dataset", verified: "Verified Dataset" };

type DashboardData = {
  history: HistoryResponse | null;
  reviews: ReviewsResponse | null;
  status: DiscoveryStatus | null;
  insights: InsightsReport | null;
  opportunities: OpportunityResponse | null;
  recommendation: RecommendationReport | null;
};

async function getJson<T>(path: string): Promise<T | null> {
  try {
    return await cachedJson<T>(path);
  } catch {
    return null;
  }
}

function formatDuration(durationMs: number): string {
  if (!durationMs) return "—";
  return durationMs >= 60_000 ? `${(durationMs / 60_000).toFixed(1)}m` : `${Math.max(1, Math.round(durationMs / 1000))}s`;
}

const QUALITY_TONE: Record<string, string> = { Excellent: "badge-success", Good: "badge-warning", Limited: "badge-neutral" };

function runTitle(run: HistoryRun): string {
  if (run.config.company) return `${run.config.company} · category expansion`;
  if (run.config.objective) return run.config.objective;
  return "Discovery run";
}

export function Overview() {
  const [data, setData] = useState<DashboardData>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getJson<HistoryResponse>("/api/history"),
      getJson<ReviewsResponse>("/api/reviews"),
      getJson<DiscoveryStatus>("/api/discovery/status"),
      getJson<InsightsReport>("/api/insights"),
      getJson<OpportunityResponse>("/api/opportunities"),
      getJson<RecommendationReport>("/api/recommendation"),
    ])
      .then(([history, reviews, status, insights, opportunities, recommendation]) => {
        if (cancelled) return;
        setData({ history, reviews, status, insights, opportunities, recommendation });
        if (!history && !reviews && !status) setError("The live pipeline data sources are unavailable. Start the research server, then reload.");
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Failed to load the dashboard.");
      });
    return () => { cancelled = true; };
  }, []);

  if (!data) {
    return <div className="page">
      <div className="page-heading"><div><span className="eyebrow">Research command center</span><h1>Every stage, one view.</h1><p>From public reviews to a scored recommendation — the current state of the discovery pipeline, the evidence corpus, and the leading MVP.</p></div><Link className="button button-primary" href="/discovery"><Compass size={16} />New discovery</Link></div>
      <MetricsSkeleton />
      <div className="grid-main"><section className="panel"><SectionHeader eyebrow="Recent activity" title="Discovery runs" description="Live state of every pipeline execution." /><SkeletonRows count={5} /></section><aside className="panel"><SectionHeader eyebrow="Current state" title="Insights summary" description="Top behavioural themes across the corpus." /><SkeletonRows count={3} /></aside></div>
    </div>;
  }

  const { history, reviews, status, insights, opportunities, recommendation } = data;
  const reviewsCollected = reviews?.meta?.total ?? history?.latest?.reviewsCollected ?? reviews?.reviews.length ?? status?.evidenceCount ?? 0;
  const reviewsDatasetLabel = reviews?.meta?.label ?? (history?.latest?.mode ? DATASET_LABELS[history.latest.mode] : "Verified Research Dataset");
  const sourcesConnected = status?.sourceCount ?? 0;
  const opportunitiesFound = opportunities?.opportunities.length ?? history?.latest?.opportunitiesFound ?? 0;
  const runCount = history?.runs.length ?? 0;
  const latest = history?.latest ?? null;

  return <div className="page">
    <div className="page-heading"><div><span className="eyebrow">Research command center</span><h1>Every stage, one view.</h1><p>From public reviews to a scored recommendation — the current state of the discovery pipeline, the evidence corpus, and the leading MVP.</p></div><Link className="button button-primary" href="/discovery"><Compass size={16} />New discovery</Link></div>

    {error && <div className="notice notice-error" style={{ marginBottom: 20 }}>{error}</div>}

    {recommendation ? (
      <div className="glass-card glass-hover" style={{ marginBottom: 20, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "26px", background: "radial-gradient(120% 140% at 15% 0%, rgba(192,193,255,.14), rgba(221,183,255,.08) 45%, transparent 70%)", display: "grid", gap: 16 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <span className="badge badge-success"><span className="badge-dot" />{recommendation.hero.status}</span>
            <span className="badge badge-success"><span className="badge-dot" />{recommendation.hero.mvpRole}</span>
            <span className="badge badge-neutral"><span className="badge-dot" />{recommendation.hero.confidence} confidence</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <span style={{ display: "block", color: "var(--muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: ".14em", marginBottom: 8 }}>Current recommendation</span>
              <h2 style={{ margin: 0, fontSize: "clamp(18px, 2.4vw, 24px)", letterSpacing: "-.02em", lineHeight: 1.25 }}>{recommendation.hero.title}</h2>
              <p style={{ margin: "8px 0 0", fontSize: 12.5, lineHeight: 1.6, color: "rgba(229,226,225,.78)", maxWidth: "62ch" }}>{recommendation.hero.tagline}</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
              <div>
                <span style={{ color: "var(--muted)", fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em" }}>Weighted score</span>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}><strong style={{ fontSize: 34, lineHeight: 1.1, background: "linear-gradient(90deg, #c0c1ff, #ddb7ff)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{recommendation.hero.weightedScore}</strong><span style={{ color: "var(--muted)", fontSize: 12 }}>/ {recommendation.hero.weightedMax}</span></div>
              </div>
              <Link className="button button-primary" href="/recommendation">View recommendation<ArrowUpRight size={16} /></Link>
            </div>
          </div>
        </div>
      </div>
    ) : (
      <div className="panel" style={{ marginBottom: 20 }}><EmptyState title="No recommendation yet" body="Run a discovery, let it score the evidence, and the leading MVP recommendation will appear here." action={{ href: "/discovery", label: "Start a discovery" }} /></div>
    )}

    <div className="metrics">
      <Metric label="Reviews collected" value={reviewsCollected} detail={reviewsDatasetLabel} />
      <Metric label="Sources connected" value={sourcesConnected} detail="Public sources with retained evidence" />
      <Metric label="Opportunities found" value={opportunitiesFound} detail="Scored by the deterministic engine" />
      <Metric label="Discovery runs" value={runCount} detail={latest ? `Last run ${formatDuration(latest.durationMs)}` : "No runs in this workspace yet"} />
    </div>

    <div className="grid-main">
      <section className="panel">
        <SectionHeader eyebrow="Recent activity" title="Discovery runs" description="Every pipeline execution, most recent first." action={<Link className="trace-link" href="/discovery">Open discovery <ArrowRight size={12} /></Link>} />
        {history && history.runs.length === 0 ? <EmptyState title="No discovery runs yet" body="Configure a company, country, and date range to start collecting public reviews through the pipeline." action={{ href: "/discovery", label: "Start a discovery" }} /> : <div className="table-wrap"><table><thead><tr><th scope="col">Run</th><th scope="col">Sources</th><th scope="col">Reviews</th><th scope="col">Themes</th><th scope="col">Signals</th><th scope="col">Opportunities</th><th scope="col">Duration</th><th scope="col">Quality</th><th scope="col">Status</th></tr></thead><tbody>{(history?.runs ?? []).slice(0, 6).map((run) => <tr key={run.id}><td><span className="row-title">{runTitle(run)}</span><span className="row-meta">{formatDate(run.timestamp)} · {run.config.country}</span>{run.mode ? <span className="row-meta">Dataset: {DATASET_LABELS[run.mode] ?? run.mode}</span> : null}{run.topOpportunityTitle ? <span className="row-meta" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>MVP: {run.topOpportunityTitle}</span> : null}</td><td>{run.config.sources.length}</td><td>{run.reviewsCollected}</td><td>{run.themesFound ?? "—"}</td><td>{run.behaviorSignals ?? "—"}</td><td>{run.opportunitiesFound}</td><td>{formatDuration(run.durationMs)}</td><td>{run.qualityLevel ? <span className={`badge ${QUALITY_TONE[run.qualityLevel] ?? "badge-neutral"}`}><span className="badge-dot" />{run.qualityLevel}</span> : "—"}</td><td><StatusBadge status={run.status} /></td></tr>)}</tbody></table></div>}
      </section>

      <aside className="panel">
        <SectionHeader eyebrow="Current state" title="Insights summary" description="Top behavioural themes across the reviewed corpus." action={<Link className="trace-link" href="/insights">Open insights <ArrowRight size={12} /></Link>} />
        <div className="panel-pad" style={{ paddingTop: 0 }}>
          {insights ? insights.executiveSummary.topThemes.slice(0, 4).map((theme) => <div className="theme-mini" key={theme.name}><h3>{theme.name}</h3><p>{theme.count} reviewed records · {theme.strength} strength</p></div>) : <div className="research-rule"><strong>No themes yet</strong><p>The engine will not create insights until relevant evidence has passed structured validation.</p></div>}
          <div className="research-rule" style={{ marginBottom: 0 }}><strong>Knowledge base</strong><p>{(insights?.executiveSummary.knowledgeCounts.theories ?? 0)} behavioural theories · {(insights?.executiveSummary.knowledgeCounts.caseStudies ?? 0)} case studies · {(insights?.executiveSummary.knowledgeCounts.papers ?? 0)} papers · {(insights?.executiveSummary.knowledgeCounts.commerceInsights ?? 0)} commerce insights support the scored opportunities.</p></div>
        </div>
      </aside>
    </div>

    <div className="quick-actions" style={{ marginTop: 16 }}>
      <Link className="quick-action" href="/discovery"><span>Stage 1</span><strong>Discovery</strong><p>Collect and score public reviews</p></Link>
      <Link className="quick-action" href="/reviews"><span>Stage 2</span><strong>Reviews</strong><p>Browse the reviewed evidence corpus</p></Link>
      <Link className="quick-action" href="/insights"><span>Stage 3</span><strong>Insights</strong><p>Themes, theories, and knowledge support</p></Link>
      <Link className="quick-action" href="/opportunities"><span>Stage 4</span><strong>Opportunities</strong><p>Scored category-expansion bets</p></Link>
      <Link className="quick-action" href="/recommendation"><span>Stage 5</span><strong>Recommendation</strong><p>The leading MVP decision report</p></Link>
    </div>
  </div>;
}
