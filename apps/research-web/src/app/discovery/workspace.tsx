"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, FileText, Play, Clock, FolderOutput } from "lucide-react";
import { EmptyState, GlassCard, SkeletonRows } from "@/components/ui";
import { titleCase, type DiscoveryRunPayload, type DiscoveryStageId, type HistoryRun } from "@/lib/api";

const SOURCES = [
  { id: "play_store", label: "Play Store", desc: "Google Play reviews" },
  { id: "app_store", label: "App Store", desc: "Apple App Store reviews" },
  { id: "reddit", label: "Reddit", desc: "Subreddit discussions" },
  { id: "youtube", label: "YouTube", desc: "Video comments" },
  { id: "trustpilot", label: "Trustpilot", desc: "Review platform" },
  { id: "twitter", label: "X", desc: "Public tweets" },
  { id: "linkedin", label: "LinkedIn", desc: "Professional posts" },
  { id: "community_forums", label: "Community Forums", desc: "Online communities" },
];

const STAGES: { id: DiscoveryStageId; label: string }[] = [
  { id: "preparing", label: "Preparing" },
  { id: "searching", label: "Searching sources" },
  { id: "collecting", label: "Collecting reviews" },
  { id: "scoring", label: "Scoring candidates" },
  { id: "opportunities", label: "Generating opportunities" },
  { id: "finalizing", label: "Finalizing" },
];

type StageState = Record<DiscoveryStageId, { status: "pending" | "active" | "done"; message: string }>;

const INITIAL_STAGES: StageState = Object.fromEntries(
  STAGES.map((s) => [s.id, { status: "pending" as const, message: "" }])
) as StageState;

export function DiscoveryWorkspace() {
  const [objective, setObjective] = useState("");
  const [company, setCompany] = useState("Zepto");
  const [country, setCountry] = useState("IN");
  const [dateRange, setDateRange] = useState("all_time");
  const [minRating, setMinRating] = useState(1);
  const [maxReviews, setMaxReviews] = useState(1000);
  const [sources, setSources] = useState<Set<string>>(new Set(["play_store", "app_store", "reddit", "trustpilot"]));
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DiscoveryRunPayload | null>(null);
  const [error, setError] = useState<string>();
  const [stages, setStages] = useState<StageState>(INITIAL_STAGES);
  const [history, setHistory] = useState<HistoryRun[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const timersRef = useRef<number[]>([]);

  const loadHistory = useCallback(() => {
    fetch("/api/history", { cache: "no-store" })
      .then((r) => r.json())
      .then((body) => setHistory(body.runs ?? []))
      .catch(() => undefined)
      .finally(() => setHistoryLoaded(true));
  }, []);

  useEffect(() => {
    loadHistory();
    return () => timersRef.current.forEach((t) => window.clearTimeout(t));
  }, [loadHistory]);

  const toggleSource = (id: string) => {
    const next = new Set(sources);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSources(next);
  };

  const setStage = (id: DiscoveryStageId, status: StageState[DiscoveryStageId]["status"], message: string) => {
    setStages((prev) => ({ ...prev, [id]: { status, message } }));
  };

  const handleRun = async () => {
    setRunning(true);
    setError(undefined);
    setResult(null);
    setStages(INITIAL_STAGES);
    try {
      const response = await fetch("/api/discovery/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objective, company, country, dateRange, minRating, maxReviews, sources: [...sources] }),
        cache: "no-store",
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Request failed with HTTP ${response.status}.`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;

      const handleEvent = (event: { type: string; stage?: DiscoveryStageId; status?: "active" | "done"; message?: string; payload?: DiscoveryRunPayload }) => {
        if (event.type === "stage" && event.stage && event.status) {
          setStage(event.stage, event.status, event.message ?? "");
          if (event.status === "done") {
            const timer = window.setTimeout(() => {
              setStage(event.stage!, "done", event.message ?? "");
            }, 350);
            timersRef.current.push(timer);
          }
        } else if (event.type === "complete" && event.payload) {
          completed = true;
          setResult(event.payload);
          loadHistory();
        } else if (event.type === "error") {
          throw new Error(event.message ?? "Discovery failed.");
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary;
        while ((boundary = buffer.indexOf("\n\n")) !== -1) {
          const raw = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          for (const line of raw.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            try {
              handleEvent(JSON.parse(line.slice(6)));
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "Discovery failed.");
            }
          }
        }
      }
      if (!completed) {
        // Ensure all done transitions have been observed before finishing.
        await new Promise((resolve) => window.setTimeout(resolve, 400));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Discovery failed.");
    } finally {
      setRunning(false);
    }
  };

  const activeStageIndex = STAGES.findIndex((s) => stages[s.id].status === "active");

  return <div className="page">
    <div className="page-heading"><div><span className="eyebrow">Research</span><h1>Discovery</h1><p>Execute the real research pipeline: load the corpus, score candidates, and generate opportunities.</p></div></div>
    <div className="form-layout">
      <GlassCard className="panel-pad">
        <div className="form-grid">
          <div className="field"><label>Research objective</label><textarea className="input" placeholder="e.g. Understand why users churn after the 14-day trial..." value={objective} onChange={(e) => setObjective(e.target.value)} /></div>
          <div className="field-row">
            <div className="field"><label>Company</label><input className="input" placeholder="e.g. Zepto" value={company} onChange={(e) => setCompany(e.target.value)} /></div>
            <div className="field"><label>Country</label><select className="input" value={country} onChange={(e) => setCountry(e.target.value)}><option value="IN">India</option><option value="US">United States</option><option value="GB">United Kingdom</option><option value="AU">Australia</option></select></div>
          </div>
          <div className="field-row">
            <div className="field"><label>Date range</label><select className="input" value={dateRange} onChange={(e) => setDateRange(e.target.value)}><option value="last_3_months">Last 3 months</option><option value="last_6_months">Last 6 months</option><option value="last_12_months">Last 12 months</option><option value="all_time">All time</option></select></div>
            <div className="field"><label>Min rating</label><input className="input" type="range" min={1} max={5} value={minRating} onChange={(e) => setMinRating(Number(e.target.value))} /><small>{minRating} – 5</small></div>
          </div>
          <div className="field"><label>Max reviews per source</label><input className="input" type="number" min={50} max={10000} step={50} value={maxReviews} onChange={(e) => setMaxReviews(Number(e.target.value))} /></div>
        </div>
      </GlassCard>
      <div style={{ display: "grid", gap: "16px", alignContent: "start" }}>
        <GlassCard className="panel-pad">
          <h3 style={{ margin: "0 0 14px", fontSize: "13px" }}>Sources</h3>
          <div className="source-cards">{SOURCES.map((s) => <button key={s.id} className={`source-card${sources.has(s.id) ? " active" : ""}`} onClick={() => toggleSource(s.id)}><strong>{s.label}</strong><span>{s.desc}</span></button>)}</div>
        </GlassCard>
        <button className="button button-primary" style={{ justifyContent: "center" }} disabled={running || !objective.trim() || !company.trim() || sources.size === 0} onClick={handleRun}><Play size={16} />{running ? "Running Pipeline..." : "Run Discovery"}</button>
        {error && <div className="notice notice-error">{error}</div>}
      </div>
    </div>

    {running && <GlassCard className="panel" style={{ marginTop: "28px" }}>
      <div className="section-header"><div><span className="eyebrow">Pipeline execution</span><h2>Running discovery</h2><p>Each stage runs the real research modules against the repository corpus.</p></div></div>
      <div className="panel-pad stage-list" style={{ paddingTop: 0 }}>
        {STAGES.map((stage, index) => {
          const state = stages[stage.id];
          return <div className={`stage-row ${state.status}`} key={stage.id}>
            <div className="stage-index">{state.status === "done" ? <Check size={12} className="stage-check" /> : state.status === "active" ? index + 1 : index + 1}</div>
            <div>
              <div className="stage-label">{stage.label}</div>
              {state.message && <div className="stage-message">{state.message}</div>}
            </div>
            <div className="stage-status">
              {state.status === "active" && <span className="stage-spinner" />}
              {state.status === "done" && <span style={{ fontSize: "10px", color: "#73c8a0" }}>Complete</span>}
              {state.status === "pending" && <span style={{ fontSize: "10px", color: "var(--muted)" }}>Queued</span>}
            </div>
          </div>;
        })}
      </div>
    </GlassCard>}

    {result && <>
      <div className="metrics" style={{ marginTop: "28px" }}>
        <GlassCard className="metric"><span>Sources</span><strong>{result.summary.totalSources}</strong><p>Retained public sources</p></GlassCard>
        <GlassCard className="metric"><span>Reviews collected</span><strong>{result.summary.matchedEvidence}</strong><p>Matched your filters</p></GlassCard>
        <GlassCard className="metric"><span>Opportunities</span><strong>{result.summary.opportunitiesFound}</strong><p>Scored this run</p></GlassCard>
        <GlassCard className="metric"><span>Duration</span><strong>{(result.durationMs / 1000).toFixed(1)}s</strong><p>Pipeline run time</p></GlassCard>
      </div>

      {result.prioritization && <GlassCard className="panel" style={{ marginBottom: "20px" }}>
        <div className="section-header"><div><span className="eyebrow">Prioritized</span><h2>Candidate shortlist</h2><p>Scored by the candidate prioritization module.</p></div></div>
        <div className="table-wrap"><table><thead><tr><th scope="col">Candidate</th><th scope="col">Category</th><th scope="col">Score</th><th scope="col">Band</th><th scope="col">Action</th></tr></thead><tbody>{result.prioritization.shortlist.slice(0, 10).map((c) => <tr key={c.id}><td><span className="row-title">{c.id}</span><span className="row-meta">{c.snippet.slice(0, 90)}</span></td><td>{titleCase(c.category)}</td><td>{c.score}</td><td><span className={`badge ${c.band === "A" ? "badge-success" : c.band === "D" ? "badge-danger" : "badge-warning"}`}><span className="badge-dot" />{c.band}</span></td><td>{c.action.replaceAll("_", " ")}</td></tr>)}</tbody></table></div>
      </GlassCard>}

      {result.opportunities.length > 0 && <GlassCard className="panel" style={{ marginBottom: "20px" }}>
        <div className="section-header"><div><span className="eyebrow">Opportunities</span><h2>Generated opportunity scores</h2><p>Computed by the opportunity scoring module from this run's reviewed evidence.</p></div></div>
        <div className="table-wrap"><table><thead><tr><th scope="col">Opportunity</th><th scope="col">Records</th><th scope="col">Combined score</th><th scope="col">Confidence</th></tr></thead><tbody>{result.opportunities.map((o) => <tr key={o.id}><td><span className="row-title">{o.id}</span><span className="row-meta">{o.title}</span></td><td>{o.evidenceCount}</td><td>{o.combinedScore}</td><td><span className={`badge ${o.confidenceLevel === "high" ? "badge-success" : o.confidenceLevel === "medium" ? "badge-warning" : "badge-neutral"}`}><span className="badge-dot" />{titleCase(o.confidenceLevel)}</span></td></tr>)}</tbody></table></div>
      </GlassCard>}

      {Object.keys(result.outputs).length > 0 && <GlassCard className="panel" style={{ marginBottom: "20px" }}>
        <div className="section-header"><div><span className="eyebrow">Artifacts</span><h2>Generated outputs</h2><p>Files written by the pipeline to the Git-ignored research output directories.</p></div></div>
        <div className="panel-pad" style={{ display: "grid", gap: "8px", paddingTop: 0 }}>
          {Object.entries(result.outputs).map(([key, path]) => <div key={key} style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "11.5px", fontFamily: "var(--font-geist-mono), monospace", color: "rgba(229,226,225,.8)" }}><FolderOutput size={13} style={{ color: "var(--accent)", flexShrink: 0 }} /><span>{key}</span><a className="trace-link" href={`/api/outputs?path=${encodeURIComponent(path)}`} target="_blank" rel="noreferrer" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }} title={path}>{path}</a></div>)}
        </div>
      </GlassCard>}

      <GlassCard className="panel">
        <div className="section-header"><div><span className="eyebrow">Collected</span><h2>Evidence</h2><p>Items matched to your configuration.</p></div></div>
        {result.evidence.length === 0 ? <div className="panel-pad"><EmptyState icon={FileText} title="No evidence found" body="Try broadening your source selection, lowering the minimum rating, or widening the date range." /></div> : <div className="panel-pad evidence-grid">{result.evidence.slice(0, 12).map((e) => <GlassCard className="evidence-card" key={e.id}><div className="card-top"><h3>{e.paraphrase ?? e.excerpt}</h3></div><div className="card-meta"><span className="chip">{titleCase(e.category)}</span><span className="chip">{e.sourceType}</span>{e.sentiment && <span className="chip">{titleCase(e.sentiment)}</span>}</div><div className="source-line"><span>{e.id}</span><span>{e.date ?? "Date not visible"}</span></div></GlassCard>)}</div>}
      </GlassCard>
    </>}

    <GlassCard className="panel" style={{ marginTop: "28px" }}>
      <div className="section-header"><div><span className="eyebrow">Execution history</span><h2>Recent runs</h2><p>Lightweight local record of each pipeline execution.</p></div></div>
      {!historyLoaded ? <div className="panel-pad"><SkeletonRows count={3} /></div> : history.length === 0 ? <div className="panel-pad"><EmptyState icon={Clock} title="No runs yet" body="Run a discovery to record your first pipeline execution here." /></div>
        : <div className="table-wrap"><table><thead><tr><th scope="col">Run</th><th scope="col">Started</th><th scope="col">Sources</th><th scope="col">Reviews</th><th scope="col">Opportunities</th><th scope="col">Duration</th></tr></thead><tbody>{history.slice(0, 6).map((run) => <tr key={run.id}><td><span className="row-title">{run.id.slice(0, 19)}</span><span className="row-meta">{run.status}</span></td><td>{new Date(run.timestamp).toLocaleString()}</td><td>{run.config.sources.length}</td><td>{run.reviewsCollected}</td><td>{run.opportunitiesFound}</td><td>{(run.durationMs / 1000).toFixed(1)}s</td></tr>)}</tbody></table></div>}
    </GlassCard>
  </div>;
}
