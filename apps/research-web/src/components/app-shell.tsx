"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Compass, FileText, Lightbulb, Target, Zap, Sparkles } from "lucide-react";

const navigation = [
  { href: "/", label: "Dashboard", icon: BarChart3 },
  { href: "/discovery", label: "Discovery", icon: Compass },
  { href: "/reviews", label: "Reviews", icon: FileText },
  { href: "/insights", label: "Insights", icon: Lightbulb },
  { href: "/opportunities", label: "Opportunities", icon: Target },
  { href: "/recommendation", label: "Recommendation", icon: Zap },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <div className="app-shell">
    <aside className="sidebar">
      <Link className="brand" href="/"><span className="brand-mark"><Sparkles size={19} /></span><span><strong>Zepto</strong></span></Link>
      <nav>{navigation.map(({ href, label, icon: Icon }) => { const active = href === "/" ? pathname === href : pathname.startsWith(href); return <Link key={href} href={href} className={active ? "active" : ""}><Icon size={18} />{label}</Link>; })}</nav>
    </aside>
    <main><header className="topbar"><div className="topbar-search"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><input type="search" placeholder="Search reviews..." aria-label="Search reviews" /></div><Sparkles size={15} style={{ color: "var(--accent)" }} aria-hidden="true" /></header>{children}</main>
  </div>;
}
