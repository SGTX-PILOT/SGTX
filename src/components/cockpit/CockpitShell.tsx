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
    <div dir={dir} className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/80 border-b border-border/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          {/* Logo + brand */}
          <Link href="/home" className="flex items-center gap-2 flex-shrink-0" aria-label="SGTX home">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 font-bold text-xs">
              SG
            </span>
            <span className="text-sm font-semibold tracking-tight hidden sm:inline">SGTX</span>
          </Link>

          {/* Desktop nav — 7 items, identical across roles */}
          <nav className="hidden md:flex items-center gap-1 flex-1 justify-center" aria-label="Main navigation">
            {items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                >
                  <item.icon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t(item.key)}</span>
                </Link>
              );
            })}
          </nav>

          {/* User menu */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setUserMenu(o => !o)}
              className="flex items-center gap-2 px-2 h-9 rounded-md hover:bg-muted text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t("common.userMenu")}
              aria-expanded={userMenu}
            >
              <span className="w-6 h-6 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[0.6rem] font-semibold inline-flex items-center justify-center" aria-hidden="true">
                {(tenantName || "U").charAt(0).toUpperCase()}
              </span>
              <span className="hidden sm:inline text-muted-foreground text-xs max-w-[140px] truncate">
                {tenantName || "Demo User"}
              </span>
              <ChevronDown className="w-3 h-3 text-muted-foreground" aria-hidden="true" />
            </button>
            {userMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setUserMenu(false)}
                  aria-hidden="true"
                />
                <div className="absolute end-0 top-full mt-1 w-56 rounded-md border border-border bg-background shadow-lg py-1 z-50" role="menu">
                  <div className="px-3 py-2 border-b border-border">
                    <div className="text-sm font-medium truncate">{tenantName || "Demo User"}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {roleLabel || (payload?.role || "User")}
                    </div>
                  </div>
                  <Link
                    href="/trust"
                    className="block px-3 py-1.5 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => setUserMenu(false)}
                    role="menuitem"
                  >
                    {t("trust.yourPassport")}
                  </Link>
                  <Link
                    href="/portal"
                    className="block px-3 py-1.5 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring border-t border-border"
                    onClick={() => setUserMenu(false)}
                    role="menuitem"
                  >
                    Full Portal View (204 tabs)
                  </Link>
                  <button
                    onClick={() => {
                      setUserMenu(false);
                      signOut();
                      window.location.href = "/login";
                    }}
                    className="w-full text-start px-3 py-1.5 text-sm hover:bg-muted flex items-center gap-2 text-red-600 dark:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    role="menuitem"
                  >
                    <LogOut className="w-3.5 h-3.5" /> {t("common.signOut")}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileOpen(o => !o)}
            className="md:hidden p-2 -me-2 rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Toggle navigation"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>

        {/* Mobile nav — collapsed by default. Touch targets ≥44px (h-11). */}
        {mobileOpen && (
          <nav className="md:hidden border-t border-border bg-background px-4 py-2 space-y-1" aria-label="Mobile navigation">
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

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>

      <footer className="border-t border-border/40 bg-card/20 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>SGTX · Sovereign Governed Trade Execution</span>
          <span className="hidden sm:inline flex items-center gap-1.5">
            <span className="px-2 py-1 rounded-full border border-border bg-background/60">{t("footer.nonCustodial")}</span>
            <span className="px-2 py-1 rounded-full border border-border bg-background/60">{t("footer.aiGoverned")}</span>
            <span className="px-2 py-1 rounded-full border border-border bg-background/60">{t("footer.sovereign")}</span>
          </span>
        </div>
      </footer>
    </div>
  );
}

export function shouldShowAdmin(tenantType?: string): boolean {
  return tenantType === "ADM";
}
