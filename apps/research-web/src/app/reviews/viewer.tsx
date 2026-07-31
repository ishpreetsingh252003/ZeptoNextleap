"use client";

import { useEffect, useState } from "react";
import { ExternalLink, FileSearch, MessageSquareText } from "lucide-react";
import { EmptyState, GlassCard, SkeletonRows } from "@/components/ui";
import { titleCase } from "@/lib/api";

type Review = {
  id: string;
  excerpt: string;
  paraphrase: string;
  category: string;
  mission: string;
  behavioralCodes: string[];
  sentiment: string;
  certainty: string;
  confidence: number;
  sourceType: string;
  sourceUrl: string;
  date: string;
  reviewerStatus: string;
  source: { title: string; platform: string } | null;
  generated?: boolean;
  priorityScore?: number;
  priorityBand?: string;
  recommendedAction?: string;
};

const CATEGORIES = ["all", "Cross-category", "Baby care", "Personal care", "Health and wellness", "Fresh produce", "Other / Home and kitchen"];

export function ReviewsViewer() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [source, setSource] = useState("all");
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [error, setError] = useState<string>();
  const hasFilters = query !== "" || category !== "all" || source !== "all";

  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("query", query);
    if (category !== "all") params.set("category", category);
    if (source !== "all") params.set("source", source);
    fetch(`/api/reviews?${params.toString()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((body) => setReviews(body.reviews))
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Failed to load reviews."));
  }, [query, category, source]);

  return <div className="page">
    <div className="page-heading"><div><span className="eyebrow">Evidence</span><h1>Reviews</h1><p>Collected evidence with search and filter controls. Each item traces back to its original source.</p></div></div>
    <div className="filters" style={{ marginBottom: "20px" }}>
      <input className="input" placeholder="Search reviews..." aria-label="Search reviews" value={query} onChange={(e) => setQuery(e.target.value)} style={{ minWidth: "260px" }} />
      <select className="input" aria-label="Filter by category" value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: "auto" }}>{CATEGORIES.map((c) => <option key={c} value={c}>{c === "all" ? "All categories" : c}</option>)}</select>
      <select className="input" aria-label="Filter by source" value={source} onChange={(e) => setSource(e.target.value)} style={{ width: "auto" }}><option value="all">All sources</option><option value="App-store review">App stores</option><option value="Public community thread">Reddit</option><option value="Consumer-review platform">Trustpilot</option></select>
    </div>
    {error && <div className="notice notice-error">{error}</div>}
    {!reviews ? <GlassCard className="panel-pad"><SkeletonRows count={5} /></GlassCard>
      : reviews.length === 0 ? <GlassCard className="panel-pad"><EmptyState
          icon={hasFilters ? FileSearch : MessageSquareText}
          title={hasFilters ? "No reviews match your filters" : "No reviews collected yet"}
          body={hasFilters ? "Try a different search term, category, or source." : "Run a discovery to collect public reviews into the reviewed evidence corpus."}
          action={hasFilters ? undefined : { href: "/discovery", label: "Start a discovery" }}
        /></GlassCard>
        : <div className="evidence-grid">{reviews.map((r) => <GlassCard className="evidence-card" key={r.id}><div className="card-top"><h3>{r.paraphrase}</h3></div><div className="card-meta"><span className="chip">{titleCase(r.category)}</span>{r.mission && <span className="chip">{r.mission}</span>}{r.behavioralCodes.slice(0, 3).map((code) => <span className="chip" key={code}>{code}</span>)}{r.sentiment ? <span className={`badge ${r.sentiment === "confirming" ? "badge-success" : r.sentiment === "opposing" ? "badge-danger" : "badge-warning"}`}><span className="badge-dot" />{titleCase(r.sentiment)}</span> : null}{r.generated && <><span className="badge badge-warning"><span className="badge-dot" />Generated</span>{r.priorityBand ? <span className={`badge ${r.priorityBand === "A" ? "badge-success" : r.priorityBand === "D" ? "badge-danger" : "badge-warning"}`}><span className="badge-dot" />Band {r.priorityBand}</span> : null}</>}</div><div className="source-line"><span>{r.sourceType} · {r.source?.platform ?? (r.generated ? "Pipeline candidate" : "Public source")}</span>{r.generated && r.priorityScore ? <span>Score {r.priorityScore}</span> : <span>{r.date ?? "Date not visible"}</span>} {!r.generated && <a className="trace-link" href={r.sourceUrl} target="_blank" rel="noreferrer">Source <ExternalLink size={10} /></a>}</div></GlassCard>)}</div>}
  </div>;
}
