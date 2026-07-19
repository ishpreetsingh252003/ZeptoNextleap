import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, DatabaseZap } from "lucide-react";
import { titleCase } from "@/lib/api";

export function StatusBadge({ status }: { status: string }) {
  const tone = ["completed", "approved"].includes(status) ? "success" : ["failed", "rejected"].includes(status) ? "danger" : ["partially_completed", "held", "boundary case", "mixed"].includes(status) ? "warning" : "neutral";
  return <span className={`badge badge-${tone}`}><span className="badge-dot" />{titleCase(status)}</span>;
}

export function Metric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong><p>{detail}</p></div>;
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: { href: string; label: string } }) {
  return <div className="empty"><div className="empty-icon"><DatabaseZap size={22} /></div><h3>{title}</h3><p>{body}</p>{action && <Link className="button button-primary" href={action.href}>{action.label}<ArrowUpRight size={16} /></Link>}</div>;
}

export function SectionHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="section-header"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>;
}

export function SkeletonRows({ count = 3 }: { count?: number }) {
  return <div className="skeleton-list">{Array.from({ length: count }, (_, index) => <div className="skeleton" key={index} />)}</div>;
}
