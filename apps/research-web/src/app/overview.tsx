"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { api, formatDate, type EvidenceRow, type Project, type Run, type Theme } from "@/lib/api";
import { EmptyState, Metric, SectionHeader, SkeletonRows, StatusBadge } from "@/components/ui";

export function Overview() {
  const [data, setData] = useState<{ projects: Project[]; runs: Run[]; evidence: EvidenceRow[]; themes: Theme[] }>();
  const [error, setError] = useState<string>();
  useEffect(() => { Promise.all([api<Project[]>("/v1/projects"), api<Run[]>("/v1/runs"), api<EvidenceRow[]>("/v1/evidence"), api<Theme[]>("/v1/themes")]).then(([projects, runs, evidence, themes]) => setData({ projects, runs, evidence, themes })).catch((cause: Error) => setError(cause.message)); }, []);
  return <div className="page">
    <div className="page-heading"><div><span className="eyebrow">Behavioral research</span><h1>Evidence before opportunity.</h1><p>Collect public conversations, isolate category-expansion behavior, and keep every synthesis traceable to its source.</p></div><Link className="button button-primary" href="/collect"><Plus size={16} />New collection</Link></div>
    {error && <div className="notice notice-error">API unavailable: {error}. Start PostgreSQL, run migrations, then start the API and worker.</div>}
    <div className="metrics"><Metric label="Research projects" value={data?.projects.length ?? "—"} detail="Includes separately labelled manual datasets" /><Metric label="Collection runs" value={data?.runs.length ?? "—"} detail="Counts describe this workspace only" /><Metric label="Evidence items" value={data?.evidence.length ?? "—"} detail="Pending human review unless approved" /><Metric label="Behavioral themes" value={data?.themes.length ?? "—"} detail="Qualitative support, not prevalence" /></div>
    <div className="grid-main">
      <section className="panel"><SectionHeader eyebrow="Recent activity" title="Collection runs" description="Live state from source collection through human review." />
        {!data ? <SkeletonRows /> : data.runs.length === 0 ? <EmptyState title="No collection runs yet" body="Create a project and start with one supported public source. Errors stay visible and retryable." action={{ href: "/collect", label: "Start collection" }} /> : <div className="table-wrap"><table><thead><tr><th>Run</th><th>Source</th><th>Evidence</th><th>Status</th><th /></tr></thead><tbody>{data.runs.slice(0, 8).map((run) => <tr key={run.id}><td><span className="row-title">{run.currentStage?.replaceAll("_", " ") ?? "Waiting"}</span><span className="row-meta">{formatDate(run.createdAt)}</span></td><td>{run.sourceType.replaceAll("_", " ")}</td><td>{run.evidenceCount}</td><td><StatusBadge status={run.status} /></td><td><Link className="trace-link" href={`/runs/${run.id}`}>Inspect <ArrowRight size={11} /></Link></td></tr>)}</tbody></table></div>}
      </section>
      <aside className="panel"><SectionHeader eyebrow="Synthesis" title="Latest themes" description="AI-suggested, evidence-linked, human-reviewed." /><div className="panel-pad">{!data ? <SkeletonRows count={2} /> : data.themes.length === 0 ? <div className="research-rule"><strong>No themes yet</strong><p>The engine will not create themes until relevant evidence has passed structured validation.</p></div> : data.themes.slice(0, 4).map((theme) => <Link href={`/themes/${theme.id}`} className="theme-mini" key={theme.id}><h3>{theme.title}</h3><p>{theme.summary}</p><StatusBadge status={theme.evidenceStrength} /></Link>)}<div className="research-rule"><strong>Interpretation boundary</strong><p>Monthly Active Customer is the business-metric population, not a public-research sampling criterion.</p></div></div></aside>
    </div>
  </div>;
}
