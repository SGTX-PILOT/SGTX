"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// COCKPIT-Phase 1: The 7-item top nav.
// ═══════════════════════════════════════════════════════════════════════════════
//
// Replaces the 6-workspace sidebar (WorkspaceShell) and the 190-tab
// sidebar (PortalShell). Identical shell across all 12 roles — the role
// determines the content + permissions, NOT the navigation structure.
//
// Law #1: THE TRADE IS THE PRIMARY OBJECT → /trades/[ustn] is the canonical
// workspace.
// Law #4: NO DUPLICATED CONCEPTS → 7 top-level items, each is a distinct
// concept.
// Law: Admin hidden entirely for non-admin tenants — internal machinery
// (Loom, OPA, Governor, QES, chaos testing, competitor benchmark, journey
// maps) is invisible to external roles, not just disabled.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useSession, signOut } from "@/lib/cockpit/session";
import {
  Home, Briefcase, Activity, DollarSign, ShieldCheck, Network, Settings,
  LogOut, Menu, X, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/trades", label: "Trades", icon: Briefcase },
  { href: "/operations", label: "Operations", icon: Activity },
  { href: "/money", label: "Money", icon: DollarSign },
  { href: "/trust", label: "Trust", icon: ShieldCheck },
  { href: "/network", label: "Network", icon: Network },
] as const;

const ADMIN_ITEM = { href: "/admin", label: "Admin", icon: Settings } as const;

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

  const items = showAdmin ? [...NAV_ITEMS, ADMIN_ITEM] : NAV_ITEMS;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/80 border-b border-border/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <Link href="/home" className="flex items-center gap-2 flex-shrink-0">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 font-bold text-xs">
              SG
            </span>
            <span className="text-sm font-semibold tracking-tight hidden sm:inline">SGTX</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 flex-1 justify-center">
            {items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-sm font-medium transition",
                    active
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                >
                  <item.icon className="w-3.5 h-3.5" aria-hidden />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="relative flex-shrink-0">
            <button
              onClick={() => setUserMenu(o => !o)}
              className="flex items-center gap-2 px-2 h-9 rounded-md hover:bg-muted text-sm"
              aria-label="User menu"
            >
              <span className="w-6 h-6 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[0.6rem] font-semibold inline-flex items-center justify-center">
                {(tenantName || "U").charAt(0).toUpperCase()}
              </span>
              <span className="hidden sm:inline text-muted-foreground text-xs max-w-[140px] truncate">
                {tenantName || "Demo User"}
              </span>
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </button>
            {userMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setUserMenu(false)} aria-hidden />
                <div className="absolute right-0 top-full mt-1 w-56 rounded-md border border-border bg-background shadow-lg py-1 z-50">
                  <div className="px-3 py-2 border-b border-border">
                    <div className="text-sm font-medium truncate">{tenantName || "Demo User"}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {roleLabel || (payload?.role || "User")}
                    </div>
                  </div>
                  <Link href="/trust" className="block px-3 py-1.5 text-sm hover:bg-muted" onClick={() => setUserMenu(false)}>
                    Trust passport
                  </Link>
                  <button
                    onClick={() => {
                      setUserMenu(false);
                      signOut();
                      window.location.href = "/login";
                    }}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center gap-2 text-red-600 dark:text-red-400"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Sign out
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => setMobileOpen(o => !o)}
            className="md:hidden p-2 -mr-2 rounded-md hover:bg-muted"
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>

        {mobileOpen && (
          <nav className="md:hidden border-t border-border bg-background px-4 py-2 space-y-1">
            {items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-2 px-3 h-10 rounded-md text-sm font-medium",
                    active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                >
                  <item.icon className="w-4 h-4" aria-hidden />
                  <span>{item.label}</span>
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
          <span className="hidden sm:inline">Non-Custodial · AI-Governed · Sovereign</span>
        </div>
      </footer>
    </div>
  );
}

export function shouldShowAdmin(tenantType?: string): boolean {
  return tenantType === "ADM";
}
