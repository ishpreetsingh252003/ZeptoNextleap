import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, DatabaseZap, type LucideIcon } from "lucide-react";
import { titleCase } from "@/lib/api";

export function StatusBadge({ status }: { status: string }) {
  const tone = ["completed", "approved"].includes(status) ? "success" : ["failed", "rejected"].includes(status) ? "danger" : ["partially_completed", "held", "boundary case", "mixed"].includes(status) ? "warning" : "neutral";
  return <span className={`badge badge-${tone}`}><span className="badge-dot" />{titleCase(status)}</span>;
}

export function Metric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong><p>{detail}</p></div>;
}

export function EmptyState({ title, body, action, icon: Icon = DatabaseZap }: { title: string; body: string; action?: { href: string; label: string }; icon?: LucideIcon }) {
  return <div className="empty"><div className="empty-icon"><Icon size={22} /></div><h3>{title}</h3><p>{body}</p>{action && <Link className="button button-primary" href={action.href}>{action.label}<ArrowUpRight size={16} /></Link>}</div>;
}

export function SectionHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="section-header"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>;
}

export function SkeletonRows({ count = 3 }: { count?: number }) {
  return <div className="skeleton-list">{Array.from({ length: count }, (_, index) => (
    <div className="skeleton-row" key={index}>
      <div className="skeleton-circle" />
      <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
        <div className="skeleton-bar" style={{ width: `${82 - (index % 3) * 11}%` }} />
        <div className="skeleton-bar skeleton-bar-short" />
      </div>
    </div>
  ))}</div>;
}

export function MetricsSkeleton() {
  return <div className="metrics">{Array.from({ length: 4 }, (_, index) => (
    <div className="metric" key={index}>
      <div className="skeleton-bar" style={{ width: "45%" }} />
      <div className="skeleton-bar" style={{ width: "60%", height: 24, margin: "12px 0 8px" }} />
      <div className="skeleton-bar skeleton-bar-short" />
    </div>
  ))}</div>;
}

export function GlassCard({ className = "", children, style }: { className?: string; children: ReactNode; style?: React.CSSProperties }) {
  return <div className={`glass-card glass-hover ${className}`} style={style}>{children}</div>;
}
