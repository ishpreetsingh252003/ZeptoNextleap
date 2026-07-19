"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Globe2, Import, SearchCode, ShoppingBag } from "lucide-react";
import { api, type Project, type Run } from "@/lib/api";
import { SectionHeader } from "@/components/ui";

const sourceOptions = [
  { value: "google_play", label: "Google Play", detail: "Public Zepto reviews", icon: ShoppingBag },
  { value: "public_url", label: "Public URL", detail: "One policy-checked page", icon: Globe2 },
  { value: "tavily_query", label: "Tavily discovery", detail: "Optional verified search", icon: SearchCode },
  { value: "manual_text", label: "Manual text", detail: "Labelled fallback import", icon: Import }
] as const;

export function CollectionWorkspace() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [sourceType, setSourceType] = useState("google_play");
  const [urlOrQuery, setUrlOrQuery] = useState("https://play.google.com/store/apps/details?id=com.zeptoconsumerapp&hl=en");
  const [manualText, setManualText] = useState("");
  const [maxRecords, setMaxRecords] = useState(10);
  const [policyConfirmed, setPolicyConfirmed] = useState(false);
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => { api<Project[]>("/v1/projects").then((rows) => { setProjects(rows); if (rows[0]) setProjectId(rows[0].id); }).catch((cause: Error) => setError(cause.message)); }, []);

  async function createProject() {
    const name = window.prompt("Project name", "Category Expansion Research");
    if (!name) return;
    const project = await api<Project>("/v1/projects", { method: "POST", body: JSON.stringify({ name, description: "Public behavioral research for category expansion." }) });
    setProjects((current) => [project, ...current]); setProjectId(project.id);
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(undefined); setSubmitting(true);
    try {
      const run = await api<Run>("/v1/runs", { method: "POST", body: JSON.stringify({ projectId, sourceType, urlOrQuery: urlOrQuery || undefined, manualText: sourceType === "manual_text" ? manualText : undefined, policyConfirmed, maxRecords }) });
      router.push(`/runs/${run.id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create the run."); setSubmitting(false); }
  }

  return <div className="page"><div className="page-heading"><div><span className="eyebrow">Collection workspace</span><h1>Bring in one source, honestly.</h1><p>Every collection path is bounded by public access, policy checks, minimal storage, and explicit failure states.</p></div></div>
    <div className="form-layout"><form className="panel form-grid" onSubmit={submit}>
      <div className="field"><label>Project</label><div className="field-row"><select className="input" value={projectId} onChange={(event) => setProjectId(event.target.value)} required><option value="">Select a project</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}{project.datasetLabel ? ` — ${project.datasetLabel}` : ""}</option>)}</select><button className="button button-secondary" type="button" onClick={() => void createProject()}>Create project</button></div></div>
      <div className="field"><label>Source type</label><div className="source-cards">{sourceOptions.map(({ value, label, detail, icon: Icon }) => <button type="button" key={value} className={`source-card ${sourceType === value ? "active" : ""}`} onClick={() => { setSourceType(value); setUrlOrQuery(value === "google_play" ? "https://play.google.com/store/apps/details?id=com.zeptoconsumerapp&hl=en" : ""); }}><Icon size={17} /><strong>{label}</strong><span>{detail}</span></button>)}</div></div>
      {sourceType === "manual_text" ? <><div className="field"><label>Public source URL <small>(recommended)</small></label><input className="input" type="url" placeholder="https://…" value={urlOrQuery} onChange={(event) => setUrlOrQuery(event.target.value)} /></div><div className="field"><label>Manually captured public text</label><textarea className="input" value={manualText} onChange={(event) => setManualText(event.target.value)} placeholder="Paste only the minimum public context needed. Do not include private or sensitive content." required /></div></> : <div className="field"><label>{sourceType === "tavily_query" ? "Discovery query" : sourceType === "google_play" ? "Google Play URL or package ID" : "Public URL"}</label><input className="input" value={urlOrQuery} onChange={(event) => setUrlOrQuery(event.target.value)} placeholder={sourceType === "tavily_query" ? "Zepto baby care trust purchase" : "https://…"} required /><small>Tavily results are retained only after their underlying public pages pass source checks.</small></div>}
      <div className="field-row"><div className="field"><label>Maximum records</label><input className="input" type="number" min={1} max={50} value={maxRecords} onChange={(event) => setMaxRecords(Number(event.target.value))} /></div><div className="field"><label>Date range</label><input className="input" disabled placeholder="Adapter support required" /><small>Not silently applied when a source cannot support it.</small></div></div>
      <label className="policy-check"><input type="checkbox" checked={policyConfirmed} onChange={(event) => setPolicyConfirmed(event.target.checked)} /><span><strong>I verified this access method is permitted.</strong><small>The source is public, contains no sensitive content, and its platform terms allow this collection method.</small></span></label>
      {error && <div className="notice notice-error">{error}</div>}
      <button className="button button-primary" disabled={!projectId || !policyConfirmed || submitting}>{submitting ? "Creating run…" : "Collect reviews"}<ArrowRight size={16} /></button>
    </form>
    <aside className="panel"><SectionHeader eyebrow="Before collection" title="Source contract" description="A run can fail safely; it cannot invent a result." /><div className="steps">{["Public without login", "Policy and address checks", "Minimal readable context", "Normalize and deduplicate", "Validated AI analysis", "Human review"].map((label, index) => <div className="step" key={label}><span className="step-index">{index + 1}</span><div><h4>{label}</h4><p>{index === 0 ? "No private, paywalled, sensitive, or bypassed material." : index === 4 ? "Groq output is stored only after schema and evidence-grounding checks." : "The run records what happened and why."}</p></div></div>)}</div><div className="research-rule"><strong>Manual Pilot v1 stays separate</strong><p>The approved ten pilot items enter only through the explicit import command and retain their manual provenance.</p></div></aside></div>
  </div>;
}
