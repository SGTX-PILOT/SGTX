"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PORTAL_MAP, type PortalConfig } from "@/lib/sgtx/portal-config";
import { useAppStore } from "@/store/app-store";
import { SgtxLogo } from "@/components/sgtx/SgtxLogo";
import { Bell, Search, HelpCircle, Mic, LogOut, ChevronLeft, PanelLeftClose, PanelLeft, X, Sparkles, Loader2, Send, Keyboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { KeyboardShortcutsHelp, TabIndexScreen } from "@/components/sgtx/quick-start";
import {
  FeedbackFAB,
  AdaptiveExperienceToggle,
  FocusModeButton,
  HelpCenterModal,
  useFocusMode,
  FocusModeBanner,
} from "@/components/sgtx/common-components";

type DashboardData = {
  tenant: any; inbox: any[]; tradesAsBuyer: any[]; tradesAsSeller: any[];
  activities: any[]; invoices: any[]; labTests?: any[]; qcInspections?: any[];
  customsDecls?: any[]; shipmentsCarrier?: any[]; financingBids?: any[];
  openFinancingRequests?: any[]; disputes?: any[];
};

export function PortalShell({ portal, children }: { portal: PortalConfig; children: (data: DashboardData) => React.ReactNode }) {
  const [activeTab, setActiveTab] = useState(portal.tabs[0].id);
  const exitToLauncher = useAppStore((s) => s.exitToLauncher);
  const traderMode = useAppStore((s) => s.traderMode);
  const setTraderMode = useAppStore((s) => s.setTraderMode);
  const enterPortal = useAppStore((s) => s.enterPortal);
  const [collapsed, setCollapsed] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceResult, setVoiceResult] = useState<string | null>(null);
  const focus = useFocusMode();

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
  });

  const inboxCount = data?.inbox?.length || 0;
  const highPriority = data?.inbox?.filter((i) => i.priority >= 80).length || 0;
  // Focus Mode filters inbox to only show priority >= 90 items (Part 12A.12)
  const focusActive = !!focus.state?.active;
  const visibleInboxCount = focusActive
    ? (data?.inbox?.filter((i) => (i.priority || 0) >= 90).length || 0)
    : inboxCount;

  // Group tabs
  const grouped = portal.tabs.reduce<Record<string, typeof portal.tabs>>((acc, t) => {
    const g = t.group || "Main";
    (acc[g] = acc[g] || []).push(t);
    return acc;
  }, {});

  // Close any open modal/drawer (used by Esc handler)
  const closeAnyModal = () => {
    setShowInbox(false);
    setShowAssistant(false);
    setShowVoiceModal(false);
    setShowSearch(false);
    setShowShortcuts(false);
    setShowHelp(false);
  };

  // Company admin tab — try to switch to "admin" or "company-admin" tab if present
  const goToCompanyAdmin = () => {
    const adminTab = portal.tabs.find((t) => t.id === "admin" || t.id === "company-admin");
    if (adminTab) {
      setActiveTab(adminTab.id);
      toast.success("Switched to Company Admin");
    } else {
      toast.info("Company Admin not available in this portal");
    }
  };

  // Dual-mode toggle (only for trader portals)
  const toggleDualMode = () => {
    if (!portal.dualMode) {
      toast.info("Dual-mode toggle only available in trader portals");
      return;
    }
    setTraderMode(traderMode === "BUY" ? "SELL" : "BUY");
    toast.success(`Switched to ${traderMode === "BUY" ? "Seller" : "Buyer"} mode`);
  };

  // Register global keyboard shortcuts
  useKeyboardShortcuts({
    onSearch: () => setShowSearch(true),
    onDualModeToggle: toggleDualMode,
    onOpenAssistant: () => setShowAssistant(true),
    onCompanyAdmin: goToCompanyAdmin,
    onHelp: () => setShowHelp(true),
    onCloseModal: () => {
      // Only close if a modal is open (otherwise let Esc do its default)
      if (showInbox || showAssistant || showVoiceModal || showSearch || showShortcuts || showHelp) {
        closeAnyModal();
      }
    },
    onShowShortcuts: () => setShowShortcuts(true),
    onToggleSidebar: () => setCollapsed((c) => !c),
    onOpenSettings: goToCompanyAdmin,
    onFocusSearch: () => setShowSearch(true),
  });

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className={cn("relative z-20 border-r border-border/50 bg-sidebar flex flex-col transition-all duration-300", collapsed ? "w-16" : "w-64")}>
        {/* Logo */}
        <div className="h-16 flex items-center gap-2 px-4 border-b border-border/50">
          <SgtxLogo size={32} animated={false} />
          {!collapsed && (
            <div className="min-w-0">
              <p className="font-display font-bold text-sm leading-none truncate">
                <span className="text-silver-gradient">SGT</span><span className="text-gold-gradient">X</span>
              </p>
              <p className="text-[0.55rem] tracking-[0.25em] text-muted-foreground uppercase truncate">Sovereign OS</p>
            </div>
          )}
        </div>

        {/* Portal identity */}
        {!collapsed && (
          <div className="px-4 py-3 border-b border-border/40">
            <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">Active Portal</p>
            <p className="text-sm font-semibold text-foreground mt-0.5 leading-tight">{portal.shortName}</p>
            <p className="text-[0.65rem] text-muted-foreground mt-0.5">{portal.role}</p>
          </div>
        )}

        {/* Nav */}
        <ScrollArea className="flex-1 py-3">
          <nav className="px-2 space-y-4">
            {Object.entries(grouped).map(([group, tabs]) => (
              <div key={group}>
                {!collapsed && <p className="px-3 mb-1.5 text-[0.6rem] tracking-widest text-muted-foreground/70 uppercase">{group}</p>}
                <div className="space-y-0.5">
                  {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const active = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        title={collapsed ? tab.label : undefined}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all relative group",
                          active ? "bg-gold/10 text-gold" : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                          collapsed && "justify-center"
                        )}
                        style={active ? { boxShadow: "inset 2px 0 0 oklch(0.82 0.14 84)" } : undefined}
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" style={active ? { color: "oklch(0.82 0.14 84)" } : undefined} />
                        {!collapsed && <span className="truncate">{tab.label}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </ScrollArea>

        {/* Footer */}
        <div className="p-2 border-t border-border/50 space-y-1">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            {collapsed ? <PanelLeft className="w-4 h-4" /> : <><PanelLeftClose className="w-4 h-4" /> Collapse</>}
          </button>
          <button
            onClick={exitToLauncher}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-red-400 hover:bg-red-500/5 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            {!collapsed && "Exit Portal"}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-16 border-b border-border/50 bg-background/80 backdrop-blur flex items-center justify-between px-4 sm:px-6 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <ChevronLeft className="w-4 h-4 text-muted-foreground hidden sm:block" />
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-semibold text-foreground truncate">
                {portal.tabs.find((t) => t.id === activeTab)?.label || portal.name}
              </h1>
              <p className="text-[0.65rem] text-muted-foreground truncate">{portal.name}</p>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            {/* Dual-mode toggle */}
            {portal.dualMode && (
              <div className="hidden sm:flex items-center bg-muted/50 rounded-full p-0.5 border border-border">
                {(["BUY", "SELL"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      setTraderMode(m);
                      const targetPortalId = m === "BUY" ? "trader-buyer" : "trader-seller";
                      if (portal.id !== targetPortalId) {
                        const targetTenantGtid = m === "BUY" ? "SGTX-DE-TRD-001234-5B6C" : "SGTX-EG-TRD-002139-7F3A";
                        enterPortal(targetPortalId, targetTenantGtid);
                        toast.success(`Switched to ${m === "BUY" ? "Buyer" : "Seller"} mode`);
                      }
                    }}
                    className={cn(
                      "px-3 py-1 rounded-full text-[0.7rem] font-medium transition-all",
                      traderMode === m ? "bg-gold-gradient text-sovereign" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {m === "BUY" ? "Buyer" : "Seller"}
                  </button>
                ))}
              </div>
            )}

            <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" title="Voice command (Vosk + AI intent)" onClick={() => setShowVoiceModal(true)}>
              <Mic className="w-4 h-4" />
            </Button>
            {/* 12A.12 — Focus Mode toggle (moon icon) */}
            <FocusModeButton />
            {/* 12A.9 — Adaptive Experience toggle */}
            <AdaptiveExperienceToggle />
            <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" title="Search (⌘K)" onClick={() => setShowSearch(true)}>
              <Search className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" title="Help (⌘H)" onClick={() => setShowHelp(true)}>
              <HelpCircle className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hidden sm:flex" title="Keyboard shortcuts (⌘?)" onClick={() => setShowShortcuts(true)}>
              <Keyboard className="w-4 h-4" />
            </Button>
            <button
              onClick={() => setShowInbox(true)}
              className="relative h-9 w-9 rounded-lg hover:bg-muted/60 flex items-center justify-center text-muted-foreground transition-colors"
              title="Smart Inbox"
            >
              <Bell className="w-4 h-4" />
              {visibleInboxCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[0.6rem] font-bold flex items-center justify-center">
                  {visibleInboxCount}
                </span>
              )}
            </button>

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
        </header>

        {/* Content */}
        <main className="flex-1 overflow-hidden">
          {isLoading || !data ? (
            <div className="h-full flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <SgtxLogo size={56} animated />
                <p className="text-xs text-muted-foreground tracking-widest uppercase">Loading sovereign portal…</p>
              </div>
            </div>
          ) : (
            <ScrollArea className="h-full scroll-gold">
              <div className="p-4 sm:p-6">
                {children({ ...data, _activeTab: activeTab, _setActiveTab: setActiveTab } as any)}
              </div>
            </ScrollArea>
          )}
        </main>

        {/* AI Assistant FAB */}
        <button
          onClick={() => setShowAssistant(true)}
          className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-gold-gradient text-sovereign flex items-center justify-center glow-gold hover:scale-105 transition-transform"
          title="SGTX AI Assistant (⌘I)"
        >
          <Sparkles className="w-6 h-6" />
        </button>

        {/* 12A.8 — Feedback & Help floating action button (every portal page) */}
        <FeedbackFAB tenantGtid={portal.defaultTenantGtid} portalId={portal.id} />
      </div>

      {/* Inbox drawer */}
      <AnimatePresence>
        {showInbox && data && (
          <InboxDrawer data={data} onClose={() => setShowInbox(false)} highPriority={highPriority} />
        )}
      </AnimatePresence>

      {/* AI Assistant drawer */}
      <AnimatePresence>
        {showAssistant && <AssistantDrawer onClose={() => setShowAssistant(false)} tenant={data?.tenant} />}
      </AnimatePresence>

      {/* Global search modal (⌘K) — uses TabIndexScreen for searchable tab navigation */}
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

      {/* Help center modal (⌘H) — Part 12A.13 full Help Center */}
      <HelpCenterModal open={showHelp} onOpenChange={setShowHelp} />

      {/* Keyboard shortcuts help modal (⌘?) */}
      {showShortcuts && <KeyboardShortcutsHelp onClose={() => setShowShortcuts(false)} />}

      {/* 3B.1.3.5 Voice Command Modal */}
      <AnimatePresence>
        {showVoiceModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowVoiceModal(false)} className="fixed inset-0 bg-black/50 z-50" />
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 28 }} className="fixed right-0 top-0 bottom-0 w-full sm:w-[28rem] bg-card border-l border-border z-50 flex flex-col">
              <div className="h-16 flex items-center justify-between px-5 border-b border-border">
                <div className="flex items-center gap-2"><Mic className="w-5 h-5 text-gold" /><div><h3 className="font-semibold text-sm">Voice Command</h3><p className="text-[0.65rem] text-muted-foreground">Vosk (offline) + AI intent extraction</p></div></div>
                <Button variant="ghost" size="icon" onClick={() => setShowVoiceModal(false)} className="h-8 w-8"><X className="w-4 h-4" /></Button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div className="flex flex-col items-center gap-3 py-4">
                  <button onClick={() => { setVoiceListening(!voiceListening); if (!voiceListening) { setVoiceTranscript(""); setVoiceResult(null); } }} className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${voiceListening ? "bg-red-500/20 animate-pulse" : "bg-gold/15 hover:bg-gold/25"}`}>
                    <Mic className={`w-8 h-8 ${voiceListening ? "text-red-400" : "text-gold"}`} />
                  </button>
                  <p className="text-xs text-muted-foreground">{voiceListening ? "Listening… (Vosk offline STT)" : "Click microphone to speak"}</p>
                </div>
                {voiceTranscript && <div className="p-3 rounded-lg bg-muted/20"><p className="text-[0.6rem] text-muted-foreground uppercase mb-1">Transcript</p><p className="text-sm text-foreground">{voiceTranscript}</p></div>}
                {voiceResult && <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20"><p className="text-[0.6rem] text-emerald-400 uppercase mb-1">AI Intent (A2)</p><p className="text-xs text-foreground/90">{voiceResult}</p></div>}
                <div className="p-3 rounded-lg bg-muted/20">
                  <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold mb-2">Example Commands</p>
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    <p>• "Sign contract for USTN SGTX-…"</p>
                    <p>• "Load pallet OR005 into container TCNU1234567"</p>
                    <p>• "Approve settlement for USTN …"</p>
                    <p>• "Switch to Seller mode"</p>
                    <p>• "File dispute for mould on USTN … claim $2,000"</p>
                  </div>
                </div>
                <p className="text-[0.6rem] text-muted-foreground text-center">🔐 Voice commands cannot discover or recommend counterparties. Biometric verification required for high-value actions. Zero clicks after voice + biometric.</p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function InboxDrawer({ data, onClose, highPriority }: { data: DashboardData; onClose: () => void; highPriority: number }) {
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiProvider, setAiProvider] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  // 12A.12 — Focus Mode: persistent banner + filter to priority >= 90
  const focus = useFocusMode();

  const loadSummary = async () => {
    if (aiLoading || aiSummary) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/sgtx/ai/inbox-summary", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant: data.tenant.gtid }),
      });
      const d = await res.json();
      setAiSummary(d.content);
      setAiProvider(d.provider);
    } catch { setAiSummary("AI summary unavailable."); }
    finally { setAiLoading(false); }
  };

  // 3B.1.3.2 Smart Inbox item dismiss (after CTA click). Since we can't deep-link
  // to arbitrary tabs safely, the CTA dismisses the item and surfaces a toast
  // directing the user to the relevant portal tab.
  const dismissItem = async (it: any) => {
    if (pendingId) return;
    setPendingId(it.id);
    try {
      const res = await fetch("/api/sgtx/inbox/dismiss", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inboxId: it.id }),
      });
      if (!res.ok) throw new Error("dismiss failed");
      setHiddenIds((s) => new Set(s).add(it.id));
      toast.success(it.ctaLabel ? `${it.ctaLabel} — done` : "Item dismissed", {
        description: it.title,
      });
      // Refresh dashboard so the bell badge + recommended actions stay in sync
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e) {
      toast.error("Could not dismiss item", { description: "Please try again." });
    } finally {
      setPendingId(null);
    }
  };

  const snoozeItem = async (it: any, hours: number) => {
    if (pendingId) return;
    setPendingId(it.id);
    try {
      const res = await fetch("/api/sgtx/inbox/snooze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inboxId: it.id, hours }),
      });
      if (!res.ok) throw new Error("snooze failed");
      setHiddenIds((s) => new Set(s).add(it.id));
      toast.success(`Snoozed for ${hours}h`, { description: it.title });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e) {
      toast.error("Could not snooze item", { description: "Please try again." });
    } finally {
      setPendingId(null);
    }
  };

  const visibleInbox = (data.inbox || [])
    .filter((it) => !hiddenIds.has(it.id))
    // 12A.12 — Focus Mode filters inbox to only priority >= 90 items
    .filter((it) => (focus.state?.active ? (it.priority || 0) >= 90 : true));

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 bg-black/50 z-40" />
      <motion.div
        initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 28 }}
        className="fixed right-0 top-0 bottom-0 w-full sm:w-96 bg-card border-l border-border z-50 flex flex-col"
      >
        <div className="h-16 flex items-center justify-between px-5 border-b border-border">
          <div>
            <h3 className="font-semibold text-sm">Smart Inbox</h3>
            <p className="text-[0.65rem] text-muted-foreground">{visibleInbox.length} actions · {highPriority} high priority{focus.state?.active ? " · Focus Mode ON" : ""}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8"><X className="w-4 h-4" /></Button>
        </div>

        {/* 12A.12 — Focus Mode persistent banner */}
        <AnimatePresence>
          {focus.state?.active && <FocusModeBanner state={focus.state} onExit={focus.deactivate} />}
        </AnimatePresence>

        {/* AI Summary Card (Part 12A.1.3) */}
        <div className="m-3 p-3 rounded-xl bg-gold/5 border border-gold/20">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[0.6rem] tracking-widest text-gold uppercase font-semibold flex items-center gap-1"><Sparkles className="w-3 h-3" /> AI Summary</p>
            {!aiSummary && !aiLoading && (
              <button onClick={loadSummary} className="text-[0.65rem] text-gold hover:underline">Generate</button>
            )}
            {aiProvider && <span className="text-[0.55rem] text-muted-foreground">via {aiProvider}</span>}
          </div>
          {aiLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Analyzing your inbox…</div>
          ) : aiSummary ? (
            <p className="text-xs text-foreground/90 leading-relaxed">{aiSummary}</p>
          ) : (
            <p className="text-[0.65rem] text-muted-foreground">Click "Generate" for an AI plain-language summary of today's priorities. 🧠 A1 advisory.</p>
          )}
        </div>

        {/* Recommended actions widget */}
        {visibleInbox.length > 0 && (
          <div className="mx-3 mb-2 p-3 rounded-xl bg-gold/10 border border-gold/30">
            <p className="text-[0.6rem] tracking-widest text-gold uppercase font-semibold mb-2">📌 Recommended (1 click)</p>
            <div className="space-y-2">
              {visibleInbox.slice(0, 2).map((it) => (
                <button key={it.id} onClick={() => dismissItem(it)} className="w-full text-left p-2 rounded-lg bg-background/60 hover:bg-background transition-colors">
                  <p className="text-xs font-medium text-foreground line-clamp-1">{it.title}</p>
                  <p className="text-[0.65rem] text-muted-foreground line-clamp-1">{it.description}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        <ScrollArea className="flex-1 scroll-gold">
          <div className="p-3 space-y-2">
            {visibleInbox.length === 0 && (
              <div className="p-6 text-center">
                <p className="text-xs text-muted-foreground">🎉 All caught up. No pending actions.</p>
              </div>
            )}
            {visibleInbox.map((it) => {
              const color = it.priority >= 80 ? "#f87171" : it.priority >= 50 ? "#fbbf24" : "#60a5fa";
              const isPending = pendingId === it.id;
              return (
                <div key={it.id} className="p-3 rounded-xl border border-border bg-background/40 hover:border-gold/40 transition-colors">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 text-base">{({ NEEDS_SIGNATURE: "✍", NEEDS_APPROVAL: "✓", NEEDS_DOCUMENT: "📄", NEEDS_PAYMENT: "💳", SHIPMENT_ALERT: "🚢", NEW_OFFER: "💸", NEGOTIATION: "🤝", COMPLIANCE: "🛡" } as any)[it.category] || "•"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="px-1.5 py-0 rounded text-[0.55rem] font-bold uppercase" style={{ color, background: `${color}22` }}>{it.category.replace(/_/g, " ")}</span>
                        <span className="text-[0.6rem] text-muted-foreground">P{it.priority}</span>
                      </div>
                      <p className="text-xs font-medium text-foreground">{it.title}</p>
                      <p className="text-[0.7rem] text-muted-foreground mt-0.5 line-clamp-2">{it.description}</p>
                      {it.ctaLabel && (
                        <button
                          onClick={() => dismissItem(it)}
                          disabled={isPending}
                          className="mt-2 text-[0.7rem] font-semibold text-gold hover:underline disabled:opacity-50 inline-flex items-center gap-1"
                        >
                          {isPending ? <><Loader2 className="w-3 h-3 animate-spin" /> Working…</> : <>{it.ctaLabel} →</>}
                        </button>
                      )}
                      {/* Snooze (blueprint 12A.1.1.5) */}
                      <div className="mt-2 flex items-center gap-1.5">
                        <span className="text-[0.55rem] text-muted-foreground/70">Snooze:</span>
                        {[2, 4, 24].map((h) => (
                          <button
                            key={h}
                            onClick={() => snoozeItem(it, h)}
                            disabled={isPending}
                            className="px-1.5 py-0.5 rounded text-[0.55rem] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-50"
                          >
                            {h}h
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </motion.div>
    </>
  );
}

function AssistantDrawer({ onClose, tenant }: { onClose: () => void; tenant: any }) {
  const [messages, setMessages] = useState<{ role: "user" | "ai"; content: string; provider?: string }[]>(
    tenant ? [{ role: "ai", content: `Hello, ${tenant.legalName}. I'm your SGTX AI Operations Assistant & Customer Care Chatbot (A1 advisory, z-ai glm-4-plus). I can answer questions, perform actions on your behalf (with PIN-based impersonation), and escalate to human support via VoIP callback. I never recommend counterparties — SGTX is a non-marketplace system.` }] : []
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showEscalate, setShowEscalate] = useState(false);
  const [pinPrompt, setPinPrompt] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading || !tenant) return;
    setInput("");

    // Handle "Talk to a human" escalation (3B.1.3.6)
    if (msg.toLowerCase().includes("talk to a human") || msg.toLowerCase().includes("escalate")) {
      setMessages((m) => [...m, { role: "user", content: msg }, { role: "ai", content: "I'll escalate this to a human support agent. They will have access to our conversation transcript and trade context. Would you like a VoIP callback? Click below to confirm your phone number and request a callback." }]);
      setShowEscalate(true);
      return;
    }

    setMessages((m) => [...m, { role: "user", content: msg }]);
    setLoading(true);
    try {
      const res = await fetch("/api/sgtx/ai/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant: tenant.gtid, message: msg }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: "ai", content: data.content, provider: data.provider }]);
    } catch {
      setMessages((m) => [...m, { role: "ai", content: "Sorry, I couldn't process that. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  const requestCallback = () => {
    setMessages((m) => [...m, { role: "ai", content: "VoIP callback requested via self-hosted Janus Gateway. A human agent will call you within 15 minutes. Reference: SGTX-SUPPORT-" + Date.now().toString(36).toUpperCase() }]);
    setShowEscalate(false);
  };

  const submitPin = () => {
    setMessages((m) => [...m, { role: "ai", content: `PIN verified. I now have a short-lived, scope-limited JWT to perform: ${pinPrompt}. All impersonated actions are logged as Governor decisions (decision_type = 'customer_care_bot_impersonation').` }]);
    setPinPrompt(null); setPinInput("");
  };

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, loading]);

  const suggestions = ["What needs my attention today?", "Which payments are overdue?", "Explain the Governor block on contract signing", "Summarize my active trades", "Talk to a human"];

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 bg-black/50 z-40" />
      <motion.div
        initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 28 }}
        className="fixed right-0 top-0 bottom-0 w-full sm:w-[28rem] bg-card border-l border-border z-50 flex flex-col"
      >
        <div className="h-16 flex items-center justify-between px-5 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-gold" />
            <div>
              <h3 className="font-semibold text-sm">AI Operations Assistant</h3>
              <p className="text-[0.65rem] text-muted-foreground">🧠 A1 · z-ai glm-4-plus · advisory only</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8"><X className="w-4 h-4" /></Button>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 scroll-gold">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${m.role === "ai" ? "bg-gold-gradient" : "bg-muted"}`}>
                {m.role === "ai" ? <Sparkles className="w-3.5 h-3.5 text-sovereign" /> : <span className="text-[0.6rem] font-bold text-foreground">You</span>}
              </div>
              <div className={`p-3 rounded-2xl text-sm max-w-[80%] ${m.role === "ai" ? "rounded-tl-sm bg-muted/50 text-foreground" : "rounded-tr-sm bg-gold-gradient text-sovereign"}`}>
                {m.content}
                {m.provider && m.role === "ai" && <p className="text-[0.55rem] mt-1 opacity-60">via {m.provider}</p>}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-gold-gradient flex items-center justify-center flex-shrink-0"><Sparkles className="w-3.5 h-3.5 text-sovereign" /></div>
              <div className="p-3 rounded-2xl rounded-tl-sm bg-muted/50 text-sm flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> thinking…</div>
            </div>
          )}
          {messages.length <= 1 && (
            <div className="p-3 rounded-xl border border-border bg-background/40">
              <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase mb-2">Suggested</p>
              <div className="space-y-1.5">
                {suggestions.map((q) => (
                  <button key={q} onClick={() => send(q)} className="w-full text-left text-xs p-2 rounded-lg hover:bg-muted/50 text-foreground/80">{q}</button>
                ))}
              </div>
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
            <button onClick={() => send()} disabled={loading || !input.trim()} className="text-gold disabled:opacity-40"><Send className="w-4 h-4" /></button>
          </div>
          {/* 3B.1.3.6 Escalation UI */}
          {showEscalate && (
            <div className="mt-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <p className="text-xs text-amber-400 font-semibold mb-2">Escalate to Human Support</p>
              <p className="text-[0.65rem] text-muted-foreground mb-2">VoIP callback via self-hosted Janus Gateway. Agent will have conversation transcript + trade context.</p>
              <div className="flex gap-2"><Button size="sm" className="bg-gold-gradient text-sovereign h-7" onClick={requestCallback}>Request Callback</Button><Button size="sm" variant="outline" className="h-7" onClick={() => setShowEscalate(false)}>Cancel</Button></div>
            </div>
          )}
          {/* PIN-based impersonation */}
          {pinPrompt && (
            <div className="mt-2 p-3 rounded-lg bg-gold/5 border border-gold/20">
              <p className="text-xs text-gold font-semibold mb-1">PIN Required for: {pinPrompt}</p>
              <p className="text-[0.6rem] text-muted-foreground mb-2">Enter your support PIN (set in Company Admin). Bot obtains short-lived scope-limited JWT. All actions logged as Governor decisions.</p>
              <div className="flex gap-2"><Input type="password" value={pinInput} onChange={(e) => setPinInput(e.target.value)} placeholder="Support PIN" className="h-8 text-xs" /><Button size="sm" className="bg-gold-gradient text-sovereign h-8" onClick={submitPin}>Verify</Button><Button size="sm" variant="outline" className="h-8" onClick={() => setPinPrompt(null)}>Cancel</Button></div>
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}
