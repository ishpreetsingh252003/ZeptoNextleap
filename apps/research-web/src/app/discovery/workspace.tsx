"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, FileText, Play, Clock, FolderOutput, Sparkles } from "lucide-react";
import { EmptyState, GlassCard, SkeletonRows } from "@/components/ui";
import { titleCase, type DiscoveryRunPayload, type DiscoverySourceDiagnostic, type DiscoveryStageId, type HistoryRun } from "@/lib/api";
import { cachedJson, clearCached } from "@/lib/client-cache";

type SourceStatus = "live" | "dataset" | "coming_soon";

const SOURCES: { id: string; label: string; desc: string; emoji: string; status: SourceStatus }[] = [
  { id: "play_store", label: "Google Play", desc: "Google Play reviews", emoji: "🛒", status: "live" },
  { id: "app_store", label: "App Store", desc: "Apple App Store reviews", emoji: "🍎", status: "coming_soon" },
  { id: "reddit", label: "Reddit", desc: "Subreddit discussions", emoji: "👽", status: "dataset" },
  { id: "youtube", label: "YouTube", desc: "Video comments", emoji: "▶️", status: "dataset" },
  { id: "trustpilot", label: "Trustpilot", desc: "Review platform", emoji: "⭐", status: "dataset" },
  { id: "twitter", label: "X", desc: "Public tweets", emoji: "🐦", status: "coming_soon" },
  { id: "linkedin", label: "LinkedIn", desc: "Professional posts", emoji: "💼", status: "coming_soon" },
  { id: "community_forums", label: "Community Forums", desc: "Online communities", emoji: "💬", status: "dataset" },
];

const STATUS_LABELS: Record<SourceStatus, string> = {
  live: "Live reviews",
  dataset: "Research dataset",
  coming_soon: "Coming soon",
};

const MODE_BADGES: Record<DiscoverySourceDiagnostic["mode"], { label: string; cls: string }> = {
  live: { label: "✓ Live Reviews", cls: "badge-success" },
  cached: { label: "✓ Cached Research Dataset", cls: "badge-success" },
  dataset: { label: "✓ Research Dataset", cls: "badge-success" },
  coming_soon: { label: "Coming Soon", cls: "badge-neutral" },
};

const QUALITY_TONE: Record<string, string> = { Excellent: "badge-success", Good: "badge-warning", Limited: "badge-neutral" };

const DATE_RANGE_LABELS: Record<string, string> = {
  last_30: "Last 30 Days",
  last_90: "Last 90 Days",
  ytd: `${new Date().getFullYear()} to date`,
  all_time: "All time",
  custom: "Custom range",
};

type DatePreset = "last_30" | "last_90" | "ytd" | "all_time" | "custom";

const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: "last_30", label: "Last 30 days" },
  { id: "last_90", label: "Last 90 days" },
  { id: "ytd", label: `${new Date().getFullYear()} so far` },
  { id: "all_time", label: "All time" },
  { id: "custom", label: "Custom range" },
];

const toDateString = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function presetToRange(preset: DatePreset, customFrom: string, customTo: string): { dateFrom: string | null; dateTo: string | null } {
  const today = new Date();
  if (preset === "last_30") return { dateFrom: toDateString(new Date(today.getTime() - 30 * 86400000)), dateTo: toDateString(today) };
  if (preset === "last_90") return { dateFrom: toDateString(new Date(today.getTime() - 90 * 86400000)), dateTo: toDateString(today) };
  if (preset === "ytd") return { dateFrom: `${today.getFullYear()}-01-01`, dateTo: toDateString(today) };
  if (preset === "all_time") return { dateFrom: null, dateTo: null };
  return { dateFrom: customFrom || null, dateTo: customTo || null };
}

const STAGES: { id: DiscoveryStageId; label: string }[] = [
  { id: "preparing", label: "Preparing research" },
  { id: "searching", label: "Loading dataset" },
  { id: "collecting", label: "Collecting reviews" },
  { id: "scoring", label: "Analyzing behaviour" },
  { id: "opportunities", label: "Scoring opportunities" },
  { id: "finalizing", label: "Generating recommendation" },
];

type StageState = Record<DiscoveryStageId, { status: "pending" | "active" | "done"; message: string }>;

const INITIAL_STAGES: StageState = Object.fromEntries(
  STAGES.map((s) => [s.id, { status: "pending" as const, message: "" }])
) as StageState;

export function DiscoveryWorkspace() {
  const [company, setCompany] = useState("Zepto");
  const [objective, setObjective] = useState("");
  const [preset, setPreset] = useState<DatePreset>("last_30");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [sources, setSources] = useState<Set<string>>(new Set(["play_store", "app_store", "reddit", "trustpilot"]));
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DiscoveryRunPayload | null>(null);
  const [error, setError] = useState<string>();
  const [stages, setStages] = useState<StageState>(INITIAL_STAGES);
  const [history, setHistory] = useState<HistoryRun[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const timersRef = useRef<number[]>([]);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  const loadHistory = useCallback((force = false) => {
    cachedJson<{ runs: HistoryRun[] }>("/api/history", force ? { force: true } : undefined)
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

  const selectAllSources = () => setSources(new Set(SOURCES.map((s) => s.id)));
  const clearSources = () => setSources(new Set());

  const setStage = (id: DiscoveryStageId, status: StageState[DiscoveryStageId]["status"], message: string) => {
    setStages((prev) => ({ ...prev, [id]: { status, message } }));
  };

  const openRun = async (runId: string) => {
    setError(undefined);
    try {
      const payload = await cachedJson<DiscoveryRunPayload>(`/api/runs/${runId}`);
      setResult(payload);
      window.setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      setError(/404/.test(message) ? "This run was recorded before instant replay was available. Run a new discovery, then click it here to reopen its full report." : cause instanceof Error ? cause.message : "Could not reopen that run.");
    }
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
        body: JSON.stringify({
          objective,
          company,
          country: "IN",
          dateRange: preset,
          minRating: 1,
          maxReviews: 100,
          sources: [...sources],
          ...presetToRange(preset, customFrom, customTo),
        }),
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
          clearCached();
          loadHistory(true);
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

  return <div className="page">
    <div className="page-heading"><div><span className="eyebrow">Research</span><h1>Discovery</h1><p>Run the research pipeline against live Google Play reviews and the dated research corpus to score candidates and generate opportunities.</p></div></div>
    <div className="form-layout">
      <GlassCard className="panel-pad">
        <div className="form-grid">
          <div className="field"><label>Company</label><input className="input" placeholder="e.g. Zepto" value={company} onChange={(e) => setCompany(e.target.value)} /></div>
          <div className="field"><label>Research objective <small style={{ color: "var(--muted)", fontWeight: 400 }}>— optional</small></label><textarea className="input" placeholder="e.g. Understand why users churn after the 14-day trial..." value={objective} onChange={(e) => setObjective(e.target.value)} /></div>
          <div className="field">
            <label>Date range</label>
            <div className="filters">{DATE_PRESETS.map((p) => <button key={p.id} type="button" className={`preset-chip${preset === p.id ? " active" : ""}`} onClick={() => setPreset(p.id)}>{p.label}</button>)}</div>
            {preset === "custom" && <div className="field-row" style={{ marginTop: "12px" }}>
              <div className="field"><label>From</label><input className="input" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /></div>
              <div className="field"><label>To</label><input className="input" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></div>
            </div>}
          </div>
        </div>
      </GlassCard>
      <div style={{ display: "grid", gap: "16px", alignContent: "start" }}>
        <GlassCard className="panel-pad">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 0 14px" }}>
            <h3 style={{ margin: 0, fontSize: "13px" }}>Sources</h3>
            <div style={{ display: "flex", gap: "12px" }}>
              <button type="button" className="link-btn" onClick={selectAllSources}>Select all</button>
              <button type="button" className="link-btn" onClick={clearSources}>Clear</button>
            </div>
          </div>
          <div className="source-cards">{SOURCES.map((s) => <button key={s.id} type="button" className={`source-card${sources.has(s.id) ? " active" : ""}`} onClick={() => toggleSource(s.id)}><span className="source-emoji">{s.emoji}</span><strong>{s.label}</strong><span>{s.desc}</span><em className={`source-mode${s.status === "live" ? " live" : s.status === "dataset" ? " dataset" : ""}`}>{STATUS_LABELS[s.status]}</em></button>)}</div>
        </GlassCard>
        <button className="button button-primary" style={{ justifyContent: "center" }} disabled={running || !company.trim() || sources.size === 0} onClick={handleRun}><Play size={16} />{running ? "Running..." : "Analyze Selected Sources"}</button>
        {error && <div className="notice notice-error">{error}</div>}
      </div>
    </div>

    {running && <GlassCard className="panel" style={{ marginTop: "28px" }}>
      <div className="section-header"><div><span className="eyebrow">Researching</span><h2>{company.trim() || "Discovery"}</h2><p>Collecting and analysing reviews across your selected sources.</p></div><Sparkles size={18} style={{ color: "var(--accent)" }} /></div>
      <div className="panel-pad" style={{ paddingTop: 0, display: "grid", gap: "14px" }}>
        <div className="researching-list">
          {[...sources].map((id) => {
            const source = SOURCES.find((s) => s.id === id);
            if (!source) return null;
            const available = source.status !== "coming_soon";
            return <div className="researching-row" key={id}><span className="source-emoji">{source.emoji}</span><strong>{source.label}</strong><span className={`badge ${available ? "badge-success" : "badge-neutral"}`}>{available && <Check size={11} />}{available ? STATUS_LABELS[source.status] : "Coming Soon"}</span></div>;
          })}
        </div>
        <div className="stage-list">
          {STAGES.map((stage, index) => {
            const state = stages[stage.id];
            return <div className={`stage-row ${state.status}`} key={stage.id}>
              <div className="stage-index">{state.status === "done" ? <Check size={12} className="stage-check" /> : index + 1}</div>
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
      </div>
    </GlassCard>}

    {result && <div ref={resultsRef} style={{ scrollMarginTop: 80 }}>
      <div className="metrics" style={{ marginTop: "28px" }}>
        <GlassCard className="metric"><span>Collected</span><strong>{result.summary.matchedEvidence}</strong><p>Across {result.summary.themesFound} themes</p></GlassCard>
        <GlassCard className="metric"><span>Behaviour signals</span><strong>{result.summary.behaviorSignals}</strong><p>Distinct codes in evidence</p></GlassCard>
        <GlassCard className="metric"><span>High confidence</span><strong>{result.summary.highConfidence}</strong><p>Explicit certainty records</p></GlassCard>
        <GlassCard className="metric"><span>Research quality</span><strong>{result.summary.qualityLevel}</strong><p>{result.summary.qualityScore}/100 · composite metric</p></GlassCard>
      </div>

      <GlassCard className="panel" style={{ marginBottom: "20px" }}>
        <div className="section-header"><div><span className="eyebrow">Summary</span><h2>Discovery summary</h2><p>Aggregated from the processed reviews in this run.</p></div><span className={`badge ${QUALITY_TONE[result.summary.qualityLevel] ?? "badge-neutral"}`}><span className="badge-dot" />Research quality: {result.summary.qualityLevel}</span></div>
        <div className="panel-pad" style={{ paddingTop: 0, display: "grid", gap: "10px" }}>
          <div className="summary-row"><span>Collected</span><strong>{result.summary.matchedEvidence} {result.summary.matchedEvidence === 1 ? "Review" : "Reviews"}</strong></div>
          <div className="summary-row"><span>Across</span><strong>{result.summary.themesFound} {result.summary.themesFound === 1 ? "Theme" : "Themes"}</strong></div>
          <div className="summary-row"><span>Behaviour Signals</span><strong>{result.summary.behaviorSignals}</strong></div>
          <div className="summary-row"><span>High Confidence</span><strong>{result.summary.highConfidence}</strong></div>
          <div className="summary-row"><span>Sources</span><strong>{result.summary.sourceLabels.length > 0 ? result.summary.sourceLabels.join(", ") : "None"}</strong></div>
          <div className="summary-row"><span>Date Range</span><strong>{DATE_RANGE_LABELS[result.config.dateRange] ?? result.config.dateRange}</strong></div>
        </div>
      </GlassCard>

      {result.diagnostics.length > 0 && <GlassCard className="panel" style={{ marginBottom: "20px" }}>
        <div className="section-header"><div><span className="eyebrow">Collection</span><h2>Source collection</h2><p>How each selected source contributed reviews to this run.</p></div></div>
        <div className="panel-pad" style={{ display: "grid", gap: "8px", paddingTop: 0 }}>
          {result.diagnostics.map((d) => <div key={d.source} style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "11.5px", flexWrap: "wrap" }}><span className={`badge ${MODE_BADGES[d.mode].cls}`}><span className="badge-dot" />{MODE_BADGES[d.mode].label}</span><strong>{d.label}</strong><span style={{ color: "var(--muted)" }}>{d.mode === "coming_soon" && d.collected === 0 ? "Coming soon" : `${d.collected} ${d.unit}`}</span></div>)}
        </div>
      </GlassCard>}

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
        {result.evidence.length === 0 ? <div className="panel-pad"><EmptyState icon={FileText} title="No evidence found" body="Try broadening your source selection or widening the date range." /></div> : <div className="panel-pad evidence-grid">{result.evidence.slice(0, 12).map((e) => <GlassCard className="evidence-card" key={e.id}><div className="card-top"><h3>{e.paraphrase ?? e.excerpt}</h3></div><div className="card-meta"><span className="chip">{titleCase(e.category)}</span><span className="chip">{e.sourceType}</span>{e.sentiment && <span className="chip">{titleCase(e.sentiment)}</span>}</div><div className="source-line"><span>{e.id}</span><span>{e.date ?? "Date not visible"}</span></div></GlassCard>)}</div>}
      </GlassCard>
    </div>}

    <GlassCard className="panel" style={{ marginTop: "28px" }}>
      <div className="section-header"><div><span className="eyebrow">Execution history</span><h2>Recent runs</h2><p>Click a run to reopen its report instantly without re-running collection.</p></div></div>
      {!historyLoaded ? <div className="panel-pad"><SkeletonRows count={3} /></div> : history.length === 0 ? <div className="panel-pad"><EmptyState icon={Clock} title="No runs yet" body="Run a discovery to record your first pipeline execution here." /></div>
        : <div className="table-wrap"><table><thead><tr><th scope="col">Company</th><th scope="col">Sources used</th><th scope="col">Date</th><th scope="col">Reviews</th><th scope="col">Themes found</th><th scope="col">Top opportunity</th><th scope="col">Research quality</th><th scope="col">Status</th></tr></thead><tbody>{history.slice(0, 8).map((run) => <tr key={run.id} onClick={() => openRun(run.id)} style={{ cursor: "pointer" }}><td><span className="row-title">{run.config.company || run.id.slice(0, 19)}</span><span className="row-meta">{run.id.slice(0, 19)}</span></td><td>{(run.sourceLabels.length > 0 ? run.sourceLabels : run.config.sources.map((s) => titleCase(s))).join(", ")}</td><td>{new Date(run.timestamp).toLocaleDateString()} <span className="row-meta">{new Date(run.timestamp).toLocaleTimeString()}</span></td><td>{run.reviewsCollected}</td><td>{run.themesFound ?? "—"}</td><td>{run.topOpportunityTitle ? <span style={{ maxWidth: 220, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{run.topOpportunityTitle}</span> : "—"}</td><td><span className={`badge ${QUALITY_TONE[run.qualityLevel] ?? "badge-neutral"}`}><span className="badge-dot" />{run.qualityLevel ?? "—"}</span></td><td><span className={`badge ${run.status === "completed" ? "badge-success" : "badge-danger"}`}><span className="badge-dot" />{titleCase(run.status)}</span></td></tr>)}</tbody></table></div>}
    </GlassCard>
  </div>;
}
