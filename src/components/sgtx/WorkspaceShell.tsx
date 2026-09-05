"use client";

// SGTX WorkspaceShell — State-of-the-Art UX Consolidation Layer
// ============================================================================
// Replaces the legacy 190-flat-tab sidebar with a contextual workspace model.
//
// Architecture:
//   ┌──────────────────────────────────────────────────────────────────┐
//   │ Topbar: portal identity · trust badges · search · worklist · ... │
//   ├──────────────────────────────────────────────────────────────────┤
//   │ Active Trade Context Bar (USTN chip · phase · CTA · TCC)         │
//   ├──────────┬───────────────────────────────────────────────────────┤
//   │          │ Workspace sub-tab strip (tabs in the active workspace) │
//   │  6-WS    ├───────────────────────────────────────────────────────┤
//   │  nav     │                                                       │
//   │  (left)  │  PortalContent (existing dispatcher, unchanged)       │
//   │          │                                                       │
//   ├──────────┴───────────────────────────────────────────────────────┤
//   │ Sticky footer                                                    │
//   └──────────────────────────────────────────────────────────────────┘
//
// Key innovations:
//   1. 6 workspaces replace 32+ tabs (per portal) — 5x cognitive reduction
//   2. Active Trade Context Bar threads USTN through every workspace
//   3. Smart Worklist merges 4 overlapping CTA surfaces into one queue
//   4. Expert Mode toggle restores the legacy 190-tab flat sidebar
//   5. All existing screens reused via the PortalContent dispatcher — zero
//      capabilities lost
// ============================================================================

import { useState, useEffect, useMemo, Component, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { PortalShell } from "./PortalShell";
import { PortalContent } from "@/components/portals/PortalContent";
import { ActiveTradeContextBar } from "./ActiveTradeContextBar";
import { SmartWorklist, WorklistBellButton } from "./SmartWorklist";
import {
  WORKSPACES, WORKSPACE_MAP, visibleWorkspaces, tabsInWorkspace,
  defaultTabForWorkspace, workspaceForTab, WORKSPACE_ACTION_HINTS,
  WORKSPACE_EMOJIS, workspaceLabelForPortal, workspaceDescriptionForPortal,
  type WorkspaceId,
} from "@/lib/sgtx/workspace-config";
import { PORTAL_MAP, type PortalConfig, type PortalTab } from "@/lib/sgtx/portal-config";
import { useAppStore } from "@/store/app-store";
import { useRouter } from "next/navigation";
import { SgtxLogo } from "./SgtxLogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Bell, Search, HelpCircle, Mic, LogOut, ChevronLeft, PanelLeftClose, PanelLeft,
  X, Sparkles, Menu, Settings, Sun, Moon, Layers, Zap, ChevronRight, ChevronDown,
  Crown, Lock, Scale,
} from "lucide-react";
import { useTheme } from "./ThemeProvider";
import {
  FeedbackFAB, AdaptiveExperienceToggle, FocusModeButton, HelpCenterModal, useFocusMode,
} from "./common-components";
import { AIAssistantFab } from "./AIAssistantFab";
import { KeyboardShortcutsDialog } from "./KeyboardShortcutsDialog";
import { TabIndexScreen } from "./quick-start";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";

type DashboardData = {
  tenant?: any;
  inbox?: any[];
  tradesAsBuyer?: any[];
  tradesAsSeller?: any[];
  invoices?: any[];
  _activeTab?: string;
  _setActiveTab?: (tab: string) => void;
};

class WorkspaceErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: string; retryCount: number }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: "", retryCount: 0 };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message || "Unknown error" };
  }
  componentDidCatch(error: Error) {
    console.error("[WorkspaceErrorBoundary] caught:", error);
    // Auto-retry once for transient ChunkLoadError (Turbopack dev mode)
    if (
      error.name === "ChunkLoadError" &&
      this.state.retryCount === 0 &&
      typeof window !== "undefined"
    ) {
      this.setState({ retryCount: 1, hasError: false });
      // Force a remount by toggling state
      setTimeout(() => this.forceUpdate(), 100);
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 max-w-2xl mx-auto text-center">
          <h2 className="text-lg font-semibold text-foreground mb-2">Workspace content unavailable</h2>
          <p className="text-sm text-muted-foreground mb-4">
            A component failed to render. The workspace shell is still operational —
            try navigating to a different tab or reload the page.
          </p>
          <details className="text-left text-xs text-muted-foreground bg-muted/20 p-3 rounded-md">
            <summary className="cursor-pointer mb-1">Error details</summary>
            <pre className="whitespace-pre-wrap break-all">{this.state.error}</pre>
          </details>
          <button
            onClick={() => this.setState({ hasError: false, error: "", retryCount: 0 })}
            className="mt-4 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function WorkspaceShell({ portal }: { portal: PortalConfig }) {
  const activeWorkspace = useAppStore((s) => s.activeWorkspace);
  const setWorkspace = useAppStore((s) => s.setWorkspace);
  const activeSubTab = useAppStore((s) => s.activeSubTab);
  const setSubTab = useAppStore((s) => s.setSubTab);
  const expertMode = useAppStore((s) => s.expertMode);
  const setExpertMode = useAppStore((s) => s.setExpertMode);
  const worklistOpen = useAppStore((s) => s.worklistOpen);
  const setWorklistOpen = useAppStore((s) => s.setWorklistOpen);
  const router = useRouter();
  const traderMode = useAppStore((s) => s.traderMode);
  const setTraderMode = useAppStore((s) => s.setTraderMode);
  const enterPortal = useAppStore((s) => s.enterPortal);
  const openTcc = useAppStore((s) => s.openTcc);
  const activeUstnContext = useAppStore((s) => s.activeUstnContext);
  const setUstnContext = useAppStore((s) => s.setUstnContext);

  const [collapsed, setCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const focus = useFocusMode();
  const { theme, toggleTheme } = useTheme();

  // ── Load dashboard data (called unconditionally so hooks are stable) ──
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["dashboard", portal.id],
    queryFn: async () => {
      try {
        const r = await fetch(`/api/sgtx/dashboard?tenant=${portal.defaultTenantGtid}`);
        if (!r.ok) return {} as DashboardData;
        return await r.json();
      } catch {
        return {} as DashboardData;
      }
    },
    // Skip fetching when in Expert Mode (PortalShell fetches its own copy)
    enabled: !expertMode,
  });

  // ── Resolve the active tab ─────────────────────────────────────────────
  // Priority: explicit sub-tab → first tab in active workspace → first tab overall
  const visible = visibleWorkspaces(portal.id);
  const wsTabs = tabsInWorkspace(portal.id, activeWorkspace);
  const effectiveTab: string =
    activeSubTab && wsTabs.includes(activeSubTab)
      ? activeSubTab
      : wsTabs[0] || portal.tabs[0]?.id || "command";

  // ── Smart tab navigation ─────────────────────────────────────────────────
  // When a 1-Click Action or dashboard card wants to navigate to a specific tab,
  // we need to: (1) find which workspace that tab belongs to, (2) switch to that
  // workspace if needed, (3) set the sub-tab. This ensures 1-Click Trade, 1-Click
  // Payment, and all dashboard card deep-links work correctly.
  const navigateToTab = (tabId: string) => {
    const targetWs = workspaceForTab(portal.id, tabId);
    if (targetWs && targetWs !== activeWorkspace) {
      setWorkspace(targetWs);
    }
    setSubTab(tabId);
  };

  // Auto-switch workspace if the current one has no tabs for this portal
  useEffect(() => {
    if (expertMode) return;
    if (wsTabs.length === 0 && visible.length > 0) {
      setWorkspace(visible[0].id);
    }
  }, [wsTabs.length, visible.length, setWorkspace, expertMode]);

  // ── Build the sub-tab strip (tabs in the active workspace) ─────────────
  const subTabs: PortalTab[] = useMemo(() => {
    const map = new Map(portal.tabs.map((t) => [t.id, t]));
    return wsTabs
      .map((id) => map.get(id))
      .filter((t): t is PortalTab => !!t);
  }, [portal.tabs, wsTabs]);

  // ── Keyboard shortcuts (re-use the existing hook) ──────────────────────
  useKeyboardShortcuts({
    onSearch: () => setShowSearch(true),
    onDualModeToggle: () => {
      if (!portal.dualMode) {
        toast.info("Dual-mode toggle only available in trader portals");
        return;
      }
      const newMode = traderMode === "BUY" ? "SELL" : "BUY";
      setTraderMode(newMode);
      const targetPortalId = newMode === "BUY" ? "trader-buyer" : "trader-seller";
      if (portal.id !== targetPortalId) {
        const targetTenantGtid = newMode === "BUY" ? "SGTX-DE-TRD-001234-5B6C" : "SGTX-EG-TRD-002139-7F3A";
        enterPortal(targetPortalId, targetTenantGtid);
      }
      toast.success(`Switched to ${newMode === "BUY" ? "Buyer" : "Seller"} mode`);
    },
    onOpenAssistant: () => setShowAssistant(true),
    onCompanyAdmin: () => setWorkspace("admin"),
    onHelp: () => setShowHelp(true),
    onCloseModal: () => {
      setShowSearch(false);
      setShowShortcuts(false);
      setShowHelp(false);
      setShowAssistant(false);
      setShowVoiceModal(false);
      setWorklistOpen(false);
    },
    onShowShortcuts: () => setShowShortcuts(true),
    onToggleSidebar: () => setCollapsed((c) => !c),
    onOpenSettings: () => setWorkspace("admin"),
    onFocusSearch: () => setShowSearch(true),
    onOpenInbox: () => setWorklistOpen(true),
    onToggleTheme: toggleTheme,
    onToggleFocusMode: () => {
      if (focus.state?.active) focus.deactivate();
      else focus.activate("1h");
    },
    onGoCommand: () => setWorkspace("home"),
    onGoNewTrade: () => {
      setWorkspace("trades");
      const candidates = ["new-trade", "requests", "quote-builder"];
      const tab = wsTabs.find((t) => candidates.includes(t));
      if (tab) setSubTab(tab);
    },
    onGoInbox: () => setWorklistOpen(true),
    onGoDocuments: () => {
      setWorkspace("ops");
      const tab = wsTabs.find((t) => t === "documents");
      if (tab) setSubTab(tab);
    },
    onGoShipments: () => {
      setWorkspace("ops");
      const tab = wsTabs.find((t) => t === "shipments" || t === "assignments");
      if (tab) setSubTab(tab);
    },
    onGoAudit: () => {
      setWorkspace("trust");
      const tab = wsTabs.find((t) => t === "audit");
      if (tab) setSubTab(tab);
    },
    onNewTrade: () => {
      setWorkspace("trades");
      const tab = wsTabs.find((t) => t === "new-trade" || t === "requests");
      if (tab) setSubTab(tab);
      toast.success("Trade creation opened");
    },
    onQuickQuote: () => {
      setWorkspace("trades");
      const tab = wsTabs.find((t) => t === "quote-builder" || t === "quotes");
      if (tab) setSubTab(tab);
    },
    onSignContract: () => {
      setWorkspace("trades");
      const tab = wsTabs.find((t) => t === "contract");
      if (tab) setSubTab(tab);
    },
    onFileDispute: () => {
      setWorkspace("trust");
      const tab = wsTabs.find((t) => t === "disputes" || t === "fee-disputes");
      if (tab) setSubTab(tab);
    },
  });

  const inboxCount = data?.inbox?.length || 0;
  const regulatorMode = portal.id === "gov";

  // ── Expert Mode: defer to the legacy PortalShell (after all hooks) ────
  // Renders the original 190-tab sidebar with all existing features.
  // All hooks above run unconditionally so React's rules-of-hooks hold.
  if (expertMode) {
    return (
      <div className="relative">
        <ExpertModeBanner onExit={() => setExpertMode(false)} />
        <PortalShell portal={portal}>
          {(d) => <PortalContent portal={portal} data={d} />}
        </PortalShell>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className={cn("min-h-screen bg-background flex flex-col", regulatorMode && "regulator-mode")}>
      {/* Skip to content */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-primary focus:text-primary-foreground focus:text-sm focus:font-medium"
      >
        Skip to content
      </a>

      {/* Mobile sidebar backdrop */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileSidebarOpen(false)}
            className="fixed inset-0 bg-black/50 z-30 md:hidden"
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* ── Sidebar (6-workspace nav) ──────────────────────────────────── */}
      <aside
        aria-label="Workspace navigation"
        className={cn(
          "bg-sidebar flex flex-col transition-all duration-300 z-40",
          "fixed inset-y-0 left-0 w-64 border-r border-border/50 md:relative md:translate-x-0",
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          collapsed && "md:w-16",
          !collapsed && "md:w-64",
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center gap-2 px-4 border-b border-border/50">
          <SgtxLogo size={32} animated={false} />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="font-display font-bold text-sm leading-none truncate">
                <span className="text-silver-gradient">SGT</span><span className="text-gold-gradient">X</span>
              </p>
              <p className="text-[0.55rem] tracking-[0.25em] text-muted-foreground uppercase truncate">Workspace OS</p>
            </div>
          )}
          <button
            onClick={() => setMobileSidebarOpen(false)}
            className="ml-auto md:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50"
            aria-label="Close navigation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Portal identity */}
        {!collapsed && (
          <div className="px-4 py-3 border-b border-border/40">
            <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">Active Portal</p>
            <p className="text-sm font-semibold text-foreground mt-0.5 leading-tight">{portal.shortName}</p>
            <p className="text-[0.65rem] text-muted-foreground mt-0.5">{portal.role}</p>
            {portal.dualMode && (
              <div className="mt-2 flex items-center bg-muted/50 rounded-full p-0.5 border border-border">
                {(["BUY", "SELL"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      setTraderMode(m);
                      const targetPortalId = m === "BUY" ? "trader-buyer" : "trader-seller";
                      if (portal.id !== targetPortalId) {
                        const targetTenantGtid = m === "BUY" ? "SGTX-DE-TRD-001234-5B6C" : "SGTX-EG-TRD-002139-7F3A";
                        enterPortal(targetPortalId, targetTenantGtid);
                      }
                    }}
                    className={cn(
                      "flex-1 px-2 py-1 rounded-full text-[0.65rem] font-medium transition-all",
                      traderMode === m ? "bg-gold-gradient text-sovereign" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {m === "BUY" ? "Buyer" : "Seller"}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Workspace nav */}
        <ScrollArea className="flex-1 py-3">
          <nav className="px-2 space-y-1" aria-label="Workspaces">
            {visible.map((ws) => {
              const isActive = activeWorkspace === ws.id;
              const tabs = tabsInWorkspace(portal.id, ws.id);
              const count = tabs.length;
              const Icon = ws.icon;
              const label = workspaceLabelForPortal(portal.id, ws.id);
              if (collapsed) {
                return (
                  <Tooltip key={ws.id}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => {
                          setWorkspace(ws.id);
                          setMobileSidebarOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center justify-center px-2 py-2.5 rounded-lg transition-all relative",
                          isActive ? "bg-gold/10 text-gold" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        )}
                        style={isActive ? { boxShadow: "inset 2px 0 0 oklch(0.82 0.14 84)" } : undefined}
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" style={isActive ? { color: "oklch(0.82 0.14 84)" } : undefined} />
                        {count > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 min-w-3.5 h-3.5 px-1 rounded-full bg-muted text-[0.55rem] font-bold flex items-center justify-center text-muted-foreground">
                            {count}
                          </span>
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">{label} ({count})</TooltipContent>
                  </Tooltip>
                );
              }
              return (
                <button
                  key={ws.id}
                  onClick={() => {
                    setWorkspace(ws.id);
                    setMobileSidebarOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-all relative group",
                    isActive ? "bg-gold/10 text-gold" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                  style={isActive ? { boxShadow: "inset 2px 0 0 oklch(0.82 0.14 84)" } : undefined}
                >
                  <Icon
                    className="w-4 h-4 flex-shrink-0"
                    style={isActive ? { color: "oklch(0.82 0.14 84)" } : undefined}
                  />
                  <span className="truncate flex-1 text-left">{label}</span>
                  {count > 0 && (
                    <span
                      className={cn(
                        "text-[0.6rem] font-semibold px-1.5 py-0 rounded-full",
                        isActive ? "bg-gold/20 text-gold" : "bg-muted text-muted-foreground"
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Divider */}
          <div className="my-3 mx-2 border-t border-border/40" />

          {/* UI-REDESIGN (pilot feedback): "Expert Mode (190 tabs)" button was
              prominently displayed and scared pilot users ("rocket-launching
              page"). Now it's a discreet, collapsed affordance tucked under
              the workspaces — labelled simply "Advanced" without the tab
              count, and only expands its full description on hover. */}
          <div className="px-2 mt-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => {
                    setExpertMode(true);
                    toast.info("Advanced view on", { description: "All tabs visible" });
                  }}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground/70 hover:text-muted-foreground hover:bg-muted/40 transition-colors",
                    collapsed && "justify-center"
                  )}
                  aria-label="Switch to the advanced flat-sidebar view (all tabs visible)"
                >
                  <Layers className="w-3.5 h-3.5 flex-shrink-0" />
                  {!collapsed && <span>Advanced</span>}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                Advanced view: show all tabs in a flat sidebar (for power users)
              </TooltipContent>
            </Tooltip>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="p-2 border-t border-border/50 space-y-1">
          <button
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="w-full hidden md:flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            {collapsed ? <PanelLeft className="w-4 h-4" /> : <><PanelLeftClose className="w-4 h-4" /> Collapse</>}
          </button>
          <button
            onClick={exitToLauncher}
            aria-label="Exit portal back to launcher"
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-red-400 hover:bg-red-500/5 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            {!collapsed && "Exit Portal"}
          </button>
        </div>
      </aside>

      {/* ── Main column ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Topbar */}
        <header className="border-b border-border/50 bg-background/80 backdrop-blur sticky top-0 z-30 px-4 sm:px-6">
          <div className="h-16 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <button
                onClick={() => setMobileSidebarOpen(true)}
                className="md:hidden p-2 -ml-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                aria-label="Open navigation menu"
              >
                <Menu className="w-5 h-5" />
              </button>

              {/* Workspace indicator */}
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    background: `${WORKSPACE_MAP[activeWorkspace].accent}1a`,
                    border: `1px solid ${WORKSPACE_MAP[activeWorkspace].accent}44`,
                  }}
                >
                  {(() => {
                    const Icon = WORKSPACE_MAP[activeWorkspace].icon;
                    return <Icon className="w-4 h-4" style={{ color: WORKSPACE_MAP[activeWorkspace].accent }} />;
                  })()}
                </div>
                <div className="min-w-0">
                  <h1 className="font-semibold text-foreground truncate text-sm sm:text-base">
                    {workspaceLabelForPortal(portal.id, activeWorkspace)}
                  </h1>
                  <p className="text-[0.65rem] text-muted-foreground truncate hidden sm:block">
                    {workspaceDescriptionForPortal(portal.id, activeWorkspace)}
                  </p>
                </div>
              </div>

              {/* Trust badges */}
              <div className="hidden md:flex items-center gap-1.5 ml-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[0.6rem] px-1.5 py-0 h-5 cursor-help font-medium"
                    >
                      <Lock className="w-2.5 h-2.5" aria-hidden />
                      Non-Custodial
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>FeeLock is an instruction, not an escrow. SGTX never holds funds.</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className="gap-1 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[0.6rem] px-1.5 py-0 h-5 cursor-help font-medium"
                    >
                      <Scale className="w-2.5 h-2.5" aria-hidden />
                      Sovereign
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>Multi-jurisdictional compliance — strictest applicable law always applies.</TooltipContent>
                </Tooltip>
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" title="Voice command" aria-label="Voice command" onClick={() => setShowVoiceModal(true)}>
                <Mic className="w-4 h-4" />
              </Button>
              <FocusModeButton />
              <AdaptiveExperienceToggle />
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground"
                title={`Switch to ${theme === "dark" ? "light" : "dark"} theme (Alt+T)`}
                aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
                onClick={toggleTheme}
              >
                {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" title="Search (⌘K)" aria-label="Search (Command K)" onClick={() => setShowSearch(true)}>
                <Search className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" title="Help (⌘H)" aria-label="Help" onClick={() => setShowHelp(true)}>
                <HelpCircle className="w-4 h-4" />
              </Button>
              <WorklistBellButton tenantGtid={portal.defaultTenantGtid} />

              {/* Tenant identity */}
              {data?.tenant && (
                <div className="flex items-center gap-2 pl-2 ml-1 border-l border-border/50">
                  <div className="hidden md:block text-right">
                    <p className="text-xs font-medium text-foreground truncate max-w-[160px]">{data.tenant.legalName}</p>
                    <p className="text-[0.6rem] text-muted-foreground font-mono">{data.tenant.gtid}</p>
                  </div>
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                    style={{ background: data.tenant.logoColor || portal.accent }}
                  >
                    {data.tenant.legalName?.charAt(0)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Active Trade Context Bar (the killer UX feature) */}
        <ActiveTradeContextBar tenantGtid={portal.defaultTenantGtid} dashboard={data} />

        {/* Sub-tab strip (tabs within the active workspace) */}
        {subTabs.length > 1 && (
          <div className="border-b border-border/40 bg-background/60 backdrop-blur sticky top-16 z-20">
            <div className="max-w-7xl mx-auto px-4 sm:px-6">
              <div className="flex items-center gap-1 overflow-x-auto py-2 scrollbar-thin">
                {subTabs.map((t) => {
                  const isActive = effectiveTab === t.id;
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setSubTab(t.id)}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all",
                        isActive
                          ? "bg-gold/15 text-gold border border-gold/30"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent"
                      )}
                    >
                      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Main content */}
        <main id="main-content" role="main" className="flex-1 overflow-hidden">
          {isLoading || !data ? (
            <div className="p-6 max-w-7xl mx-auto">
              <div className="animate-pulse space-y-4">
                <div className="h-8 bg-muted/40 rounded w-1/3" />
                <div className="h-32 bg-muted/30 rounded" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="h-40 bg-muted/30 rounded" />
                  <div className="h-40 bg-muted/30 rounded" />
                  <div className="h-40 bg-muted/30 rounded" />
                </div>
              </div>
            </div>
          ) : (
            <ScrollArea className="h-full scroll-gold">
              <div className="p-4 sm:p-6">
                <WorkspaceErrorBoundary>
                  <div className="animate-fade-in max-w-7xl mx-auto">
                    <PortalContent
                      portal={portal}
                      data={{ ...data, _activeTab: effectiveTab, _setActiveTab: navigateToTab } as any}
                    />
                  </div>
                </WorkspaceErrorBoundary>
              </div>
            </ScrollArea>
          )}
        </main>

        {/* Sticky footer */}
        <footer className="border-t border-border/50 bg-background/80 backdrop-blur px-4 sm:px-6 py-3 mt-auto">
          <div className="max-w-7xl mx-auto flex items-center justify-between text-[0.65rem] text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-gold/70" />
                <span className="hidden sm:inline">Workspace Mode ·</span>
                <span>{workspaceLabelForPortal(portal.id, activeWorkspace)}</span>
              </span>
              <span className="hidden md:inline">·</span>
              <span className="hidden md:inline">{WORKSPACE_ACTION_HINTS[activeWorkspace]}</span>
            </div>
            <div className="flex items-center gap-3">
              {activeUstnContext && (
                <span className="font-mono text-[0.6rem] truncate max-w-[200px]">
                  {activeUstnContext}
                </span>
              )}
              {/* UI-REDESIGN (pilot feedback): the footer "Expert Mode"
                  button was another prominent alarm for non-technical
                  users. Removed entirely — the discreet "Advanced"
                  affordance in the sidebar (above) is the only way to
                  enter the flat-sidebar view now. Hiding this entry point
                  behind a small, tooltip-equipped button is enough for
                  power users to find it without scaring everyone else. */}
              {/* WEDJAT AI — Technology Operating Company */}
              <a
                href="https://wedjat.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                title="Technology operated by WEDJAT AI — Digital Identity Solutions"
              >
                <img
                  src="/wedjat-ai-logo.png"
                  alt="WEDJAT AI"
                  className="h-8 w-auto object-contain"
                />
              </a>
            </div>
          </div>
        </footer>

        {/* AI Assistant FAB */}
        <AIAssistantFab onAskAI={() => setShowAssistant(true)} />
        <FeedbackFAB tenantGtid={portal.defaultTenantGtid} portalId={portal.id} />
      </div>

      {/* Smart Worklist drawer */}
      <AnimatePresence>
        {worklistOpen && (
          <SmartWorklist tenantGtid={portal.defaultTenantGtid} onClose={() => setWorklistOpen(false)} />
        )}
      </AnimatePresence>

      {/* Global search modal (⌘K) */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-[70] flex items-start justify-center p-4 pt-20"
            onClick={() => setShowSearch(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              role="dialog"
              aria-modal="true"
              aria-label="Global search and command palette"
              className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[70vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-5 overflow-y-auto scroll-gold">
                <TabIndexScreen onClose={() => setShowSearch(false)} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Help center modal */}
      <HelpCenterModal open={showHelp} onOpenChange={setShowHelp} />

      {/* Keyboard shortcuts modal */}
      <KeyboardShortcutsDialog open={showShortcuts} onOpenChange={setShowShortcuts} />

      {/* AI Assistant drawer (re-uses the PortalShell's AssistantDrawer pattern) */}
      <AnimatePresence>
        {showAssistant && (
          <AssistantDrawerSimple onClose={() => setShowAssistant(false)} tenant={data?.tenant} />
        )}
      </AnimatePresence>

      {/* Voice modal */}
      <AnimatePresence>
        {showVoiceModal && (
          <VoiceModalSimple onClose={() => setShowVoiceModal(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Expert Mode banner (shown above the legacy PortalShell) ──────────────
function ExpertModeBanner({ onExit }: { onExit: () => void }) {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-gold/10 border-b border-gold/30 backdrop-blur px-4 py-1.5 flex items-center justify-between text-xs">
      <div className="flex items-center gap-2 text-gold">
        <Layers className="w-3.5 h-3.5" />
        <span className="font-semibold">Expert Mode</span>
        <span className="text-muted-foreground hidden sm:inline">— legacy 190-tab sidebar</span>
      </div>
      <button
        onClick={onExit}
        className="text-gold hover:underline font-medium inline-flex items-center gap-1"
      >
        Back to Workspace <ChevronRight className="w-3 h-3" />
      </button>
    </div>
  );
}

// ── Compact assistant drawer (re-uses /api/sgtx/ai/chat) ─────────────────
function AssistantDrawerSimple({ onClose, tenant }: { onClose: () => void; tenant: any }) {
  const [messages, setMessages] = useState<{ role: "user" | "ai"; content: string }[]>(
    tenant
      ? [{ role: "ai", content: `Hello, ${tenant.legalName}. I'm your SGTX AI Operations Assistant (A1 advisory). I never recommend counterparties — SGTX is a non-marketplace system.` }]
      : [{ role: "ai", content: "Hello! I'm your SGTX AI Operations Assistant (A1 advisory). How can I help?" }]
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setLoading(true);
    try {
      const res = await fetch("/api/sgtx/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant: tenant?.gtid, message: msg }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: "ai", content: data.content }]);
    } catch {
      setMessages((m) => [...m, { role: "ai", content: "Sorry, I couldn't process that. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 bg-black/50 z-40" />
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 28 }}
        role="dialog"
        aria-modal="true"
        aria-label="AI Operations Assistant"
        className="fixed right-0 top-0 bottom-0 w-full sm:w-[28rem] bg-card border-l border-border z-50 flex flex-col"
      >
        <div className="h-16 flex items-center justify-between px-5 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-gold" />
            <div>
              <h3 className="font-semibold text-sm">AI Operations Assistant</h3>
              <p className="text-[0.65rem] text-muted-foreground">A1 advisory · z-ai glm-4-plus</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose} className="h-8 w-8">
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 scroll-gold">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${m.role === "ai" ? "bg-gold-gradient" : "bg-muted"}`}>
                {m.role === "ai" ? <Sparkles className="w-3.5 h-3.5 text-sovereign" /> : <span className="text-[0.6rem] font-bold text-foreground">You</span>}
              </div>
              <div className={`p-3 rounded-2xl text-sm max-w-[80%] ${m.role === "ai" ? "rounded-tl-sm bg-muted/50 text-foreground" : "rounded-tr-sm bg-gold-gradient text-sovereign"}`}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-gold-gradient flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-sovereign" />
              </div>
              <div className="p-3 rounded-2xl rounded-tl-sm bg-muted/50 text-sm">thinking…</div>
            </div>
          )}
        </div>
        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-2 bg-muted/50 rounded-full px-4 py-2.5">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") send(); }}
              placeholder="Ask the assistant…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              disabled={loading}
            />
            <button onClick={() => send()} disabled={loading || !input.trim()} aria-label="Send" className="text-gold disabled:opacity-40">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}

// ── Compact voice modal (placeholder; reuses PortalShell pattern) ────────
function VoiceModalSimple({ onClose }: { onClose: () => void }) {
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 bg-black/50 z-50" />
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 28 }}
        role="dialog"
        aria-modal="true"
        aria-label="Voice command"
        className="fixed right-0 top-0 bottom-0 w-full sm:w-[28rem] bg-card border-l border-border z-50 flex flex-col"
      >
        <div className="h-16 flex items-center justify-between px-5 border-b border-border">
          <div className="flex items-center gap-2">
            <Mic className="w-5 h-5 text-gold" />
            <h3 className="font-semibold text-sm">Voice Command</h3>
          </div>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose} className="h-8 w-8">
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="flex flex-col items-center gap-3 py-4">
            <button className="w-20 h-20 rounded-full flex items-center justify-center bg-gold/15 hover:bg-gold/25 transition-all">
              <Mic className="w-8 h-8 text-gold" />
            </button>
            <p className="text-xs text-muted-foreground">Click microphone to speak</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/20">
            <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold mb-2">Example Commands</p>
            <div className="space-y-1.5 text-xs text-muted-foreground">
              <p>• "Sign contract for USTN SGTX-…"</p>
              <p>• "Switch to Seller mode"</p>
              <p>• "File dispute for mould on USTN …"</p>
            </div>
          </div>
          <p className="text-[0.6rem] text-muted-foreground text-center">
            Voice commands cannot discover or recommend counterparties.
          </p>
        </div>
      </motion.div>
    </>
  );
}
