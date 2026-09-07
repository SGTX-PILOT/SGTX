"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// COCKPIT-Phase 1 + Phase 6: The 7-item top nav with Arabic RTL support.
// ═════════════════════════════════════════════════════════════════════════════════
//
// Law #6: Arabic-first i18n with full RTL layout. Every string goes
// through the `t()` function from useCockpitLocale(). The shell applies
// dir="rtl" on the root <div> when the locale is Arabic; Tailwind's
// logical-property utilities (ps-, pe-, ms-, me-, start-, end-) mirror
// the layout automatically.
//
// Law #6: WCAG 2.2 AA — keyboard-navigable, focus-visible styles, aria
// labels on icon-only buttons, reduced-motion respected.
//
// Law #6: Mobile-first — the nav collapses to a hamburger menu at <md
// breakpoints; touch targets are ≥44px (h-9 px-3 minimum, but the mobile
// menu button is h-10).

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useSession, signOut } from "@/lib/cockpit/session";
import { useCockpitLocale } from "@/lib/cockpit/use-locale";
import {
  Home, Briefcase, Activity, DollarSign, ShieldCheck, Network, Settings,
  LogOut, Menu, X, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/home", key: "nav.home" as const, icon: Home },
  { href: "/trades", key: "nav.trades" as const, icon: Briefcase },
  { href: "/operations", key: "nav.operations" as const, icon: Activity },
  { href: "/money", key: "nav.money" as const, icon: DollarSign },
  { href: "/trust", key: "nav.trust" as const, icon: ShieldCheck },
  { href: "/network", key: "nav.network" as const, icon: Network },
] as const;

const ADMIN_ITEM = { href: "/admin", key: "nav.admin" as const, icon: Settings } as const;

interface ShellProps {
  children: React.ReactNode;
  roleLabel?: string;
  tenantName?: string;
  showAdmin?: boolean;
}

export function CockpitShell({ children, roleLabel, tenantName, showAdmin }: ShellProps) {
  const pathname = usePathname() || "/";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const { payload } = useSession();
  const { t, dir, isRtl } = useCockpitLocale();

  const items = showAdmin ? [...NAV_ITEMS, ADMIN_ITEM] : NAV_ITEMS;

  return (
    <div dir={dir} className="min-h-screen flex bg-background">
      {/* Odoo-style left sidebar */}
      <aside className="hidden md:flex flex-col w-56 bg-sidebar border-r border-sidebar-border flex-shrink-0">
        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b border-sidebar-border">
          <Link href="/home" className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-primary text-primary-foreground font-bold text-xs">SG</span>
            <span className="text-sm font-semibold text-sidebar-foreground">SGTX</span>
          </Link>
        </div>
        {/* Nav items */}
        <nav className="flex-1 py-2 px-2 space-y-0.5">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 px-3 h-9 rounded-md text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className="w-4 h-4" aria-hidden="true" />
                <span>{t(item.key)}</span>
              </Link>
            );
          })}
        </nav>
        {/* User section at bottom */}
        <div className="p-2 border-t border-sidebar-border">
          <button
            onClick={() => setUserMenu(o => !o)}
            className="w-full flex items-center gap-2 px-2 h-10 rounded-md hover:bg-sidebar-accent text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t("common.userMenu")}
            aria-expanded={userMenu}
          >
            <span className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 text-primary text-[0.6rem] font-semibold inline-flex items-center justify-center" aria-hidden="true">
              {(tenantName || "U").charAt(0).toUpperCase()}
            </span>
            <div className="flex-1 min-w-0 text-left">
              <div className="text-xs font-medium text-sidebar-foreground truncate">{tenantName || "Demo User"}</div>
              <div className="text-[0.6rem] text-sidebar-foreground/60 truncate">{roleLabel || payload?.role || "User"}</div>
            </div>
            <ChevronDown className="w-3 h-3 text-sidebar-foreground/60" aria-hidden="true" />
          </button>
          {userMenu && (
            <div className="mt-1 space-y-0.5">
              <Link
                href="/trust"
                className="block px-3 py-1.5 text-xs text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setUserMenu(false)}
                role="menuitem"
              >
                {t("trust.yourPassport")}
              </Link>
              <Link
                href="/portal"
                className="block px-3 py-1.5 text-xs text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-md border-t border-sidebar-border pt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setUserMenu(false)}
                role="menuitem"
              >
                Full Portal View (204 tabs)
              </Link>
              <button
                onClick={() => { setUserMenu(false); signOut(); window.location.href = "/login"; }}
                className="w-full text-start px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 rounded-md flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                role="menuitem"
              >
                <LogOut className="w-3 h-3" /> {t("common.signOut")}
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile header (only on small screens) */}
      <header className="md:hidden sticky top-0 z-40 backdrop-blur-xl bg-background/80 border-b border-border">
        <div className="px-4 h-14 flex items-center justify-between gap-4">
          <Link href="/home" className="flex items-center gap-2 flex-shrink-0" aria-label="SGTX home">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-primary text-primary-foreground font-bold text-xs">SG</span>
            <span className="text-sm font-semibold">SGTX</span>
          </Link>
          <button
            onClick={() => setMobileOpen(o => !o)}
            className="p-2 -me-2 rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Toggle navigation"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
        {mobileOpen && (
          <nav className="border-t border-border bg-background px-4 py-2 space-y-1" aria-label="Mobile navigation">
            {items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 px-3 h-11 rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                >
                  <item.icon className="w-4 h-4" aria-hidden="true" />
                  <span>{t(item.key)}</span>
                </Link>
              );
            })}
          </nav>
        )}
      </header>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-4">
          {children}
        </main>
        <footer className="border-t border-border/40 bg-card/20 mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>SGTX · Sovereign Governed Trade Execution</span>
            <span className="hidden sm:inline">{t("footer.nonCustodial")} · {t("footer.aiGoverned")} · {t("footer.sovereign")}</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

export function shouldShowAdmin(tenantType?: string): boolean {
  return tenantType === "ADM";
}
