"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PORTAL_MAP, type PortalConfig } from "@/lib/sgtx/portal-config";
import { useAppStore } from "@/store/app-store";
import { SgtxLogo } from "@/components/sgtx/SgtxLogo";
import { Bell, Search, HelpCircle, Mic, LogOut, ChevronLeft, PanelLeftClose, PanelLeft, X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

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
  const [collapsed, setCollapsed] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["dashboard", portal.id],
    queryFn: async () => (await fetch(`/api/sgtx/dashboard?tenant=${portal.defaultTenantGtid}`)).json(),
  });

  const inboxCount = data?.inbox?.length || 0;
  const highPriority = data?.inbox?.filter((i) => i.priority >= 80).length || 0;

  // Group tabs
  const grouped = portal.tabs.reduce<Record<string, typeof portal.tabs>>((acc, t) => {
    const g = t.group || "Main";
    (acc[g] = acc[g] || []).push(t);
    return acc;
  }, {});

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
                <span className="text-silver-gradient">SG</span><span className="text-gold-gradient">TX</span>
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
                    onClick={() => setTraderMode(m)}
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

            <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" title="Voice command">
              <Mic className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" title="Search (⌘K)">
              <Search className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" title="Help">
              <HelpCircle className="w-4 h-4" />
            </Button>
            <button
              onClick={() => setShowInbox(true)}
              className="relative h-9 w-9 rounded-lg hover:bg-muted/60 flex items-center justify-center text-muted-foreground transition-colors"
              title="Smart Inbox"
            >
              <Bell className="w-4 h-4" />
              {inboxCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[0.6rem] font-bold flex items-center justify-center">
                  {inboxCount}
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
                {children({ ...data, _activeTab: activeTab } as any)}
              </div>
            </ScrollArea>
          )}
        </main>

        {/* AI Assistant FAB */}
        <button
          onClick={() => setShowAssistant(true)}
          className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-gold-gradient text-sovereign flex items-center justify-center glow-gold hover:scale-105 transition-transform"
          title="SGTX AI Assistant"
        >
          <Sparkles className="w-6 h-6" />
        </button>
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
    </div>
  );
}

function InboxDrawer({ data, onClose, highPriority }: { data: DashboardData; onClose: () => void; highPriority: number }) {
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
            <p className="text-[0.65rem] text-muted-foreground">{data.inbox.length} actions · {highPriority} high priority</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8"><X className="w-4 h-4" /></Button>
        </div>

        {/* Recommended actions widget */}
        {data.inbox.length > 0 && (
          <div className="m-3 p-3 rounded-xl bg-gold/10 border border-gold/30">
            <p className="text-[0.6rem] tracking-widest text-gold uppercase font-semibold mb-2">📌 Recommended (1 click)</p>
            <div className="space-y-2">
              {data.inbox.slice(0, 2).map((it) => (
                <button key={it.id} className="w-full text-left p-2 rounded-lg bg-background/60 hover:bg-background transition-colors">
                  <p className="text-xs font-medium text-foreground line-clamp-1">{it.title}</p>
                  <p className="text-[0.65rem] text-muted-foreground line-clamp-1">{it.description}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        <ScrollArea className="flex-1 scroll-gold">
          <div className="p-3 space-y-2">
            {data.inbox.map((it) => {
              const color = it.priority >= 80 ? "#f87171" : it.priority >= 50 ? "#fbbf24" : "#60a5fa";
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
                        <button className="mt-2 text-[0.7rem] font-semibold text-gold hover:underline">{it.ctaLabel} →</button>
                      )}
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
              <p className="text-[0.65rem] text-muted-foreground">🧠 A1 · Groq → Ollama fallback</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8"><X className="w-4 h-4" /></Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 scroll-gold">
          <div className="flex gap-2">
            <div className="w-7 h-7 rounded-full bg-gold-gradient flex items-center justify-center flex-shrink-0"><Sparkles className="w-3.5 h-3.5 text-sovereign" /></div>
            <div className="p-3 rounded-2xl rounded-tl-sm bg-muted/50 text-sm">
              Hello{tenant ? `, ${tenant.legalName}` : ""}. I'm your sovereign trade assistant. I can answer questions about your trades, execute one-click actions, and explain Governor decisions.
              <br /><br />
              <span className="text-xs text-muted-foreground">Try: "What needs my attention today?" or "Show the status of USTN SGTX-1397F3A…"</span>
            </div>
          </div>
          <div className="p-3 rounded-xl border border-border bg-background/40">
            <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase mb-2">Suggested</p>
            <div className="space-y-1.5">
              {["What's my trade health summary?", "Which payments are overdue?", "Explain the Governor block on contract signing", "Generate a settlement preview"].map((q) => (
                <button key={q} className="w-full text-left text-xs p-2 rounded-lg hover:bg-muted/50 text-foreground/80">{q}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-2 bg-muted/50 rounded-full px-4 py-2.5">
            <input placeholder="Ask the assistant…" className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
            <button className="text-gold"><Mic className="w-4 h-4" /></button>
          </div>
        </div>
      </motion.div>
    </>
  );
}
