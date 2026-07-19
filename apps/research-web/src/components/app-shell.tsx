"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Beaker, BookOpenCheck, Boxes, FlaskConical, LayoutDashboard, Search, Sparkles } from "lucide-react";

const navigation = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/collect", label: "Collection", icon: FlaskConical },
  { href: "/evidence", label: "Evidence", icon: Search },
  { href: "/themes", label: "Themes", icon: Boxes }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <div className="app-shell">
    <aside className="sidebar">
      <Link className="brand" href="/"><span className="brand-mark"><Beaker size={19} /></span><span><strong>Discovery Engine</strong><small>Zepto NextLeap</small></span></Link>
      <nav>{navigation.map(({ href, label, icon: Icon }) => { const active = href === "/" ? pathname === href : pathname.startsWith(href); return <Link key={href} href={href} className={active ? "active" : ""}><Icon size={18} />{label}</Link>; })}</nav>
      <div className="sidebar-note"><BookOpenCheck size={17} /><div><strong>Research contract</strong><p>Behavior before sentiment. Evidence before claims.</p></div></div>
    </aside>
    <main><header className="topbar"><div><span className="environment"><span />Research workspace</span></div><div className="topbar-rule"><Sparkles size={15} />AI output requires human review</div></header>{children}</main>
  </div>;
}
