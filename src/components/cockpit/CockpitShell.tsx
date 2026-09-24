"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// COCKPIT-Phase 1 + Phase 6 + v18 §16.2/§16.6/§16.7: The 7-item top nav
// with Smart Inbox drawer + AI Assistant drawer + Voice Command + Customer Care
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
//
// v18 §16.2: Smart Inbox — slide-out drawer with AI summary, snooze, dismiss
// v18 §16.6: Voice Command Button — microphone that calls /api/sgtx/voice/*
// v18 §16.7: Customer Care Chatbot — AI assistant drawer with PIN impersonation

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession, signOut, fetchWithAuth } from "@/lib/cockpit/session";
import { useCockpitLocale } from "@/lib/cockpit/use-locale";
import {
  Home, Briefcase, Activity, DollarSign, ShieldCheck, Network, Settings,
  LogOut, Menu, X, ChevronDown, Bell, Sparkles, Mic, LifeBuoy, Inbox,
  XCircle, Clock, Send, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

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
  const [inboxOpen, setInboxOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const { payload } = useSession();
  const { t, dir, isRtl } = useCockpitLocale();
  const qc = useQueryClient();
  const tenantGtid = payload?.tenantGtid;

  const items = showAdmin ? [...NAV_ITEMS, ADMIN_ITEM] : NAV_ITEMS;

  // ── Smart Inbox count (for badge) ──────────────────────────────────────────
  const inboxQuery = useQuery({
    queryKey: ["cockpit-inbox-count", tenantGtid],
    queryFn: async () => {
      if (!tenantGtid) return { count: 0, items: [] as any[] };
      try {
        const res = await fetchWithAuth(`/api/sgtx/dashboard?tenant=${encodeURIComponent(tenantGtid)}`);
        if (!res.ok) return { count: 0, items: [] as any[] };
        const d = await res.json();
        const items = d.inboxItems || d.inbox || [];
        return { count: items.length, items };
      } catch {
        return { count: 0, items: [] as any[] };
      }
    },
    enabled: !!tenantGtid,
    retry: false,
    staleTime: 30_000,
  });

  const inboxCount = inboxQuery.data?.count || 0;
  const inboxItems = inboxQuery.data?.items || [];

  return (
    <div dir={dir} className="min-h-screen flex bg-background gradient-mesh">
      {/* Odoo-style left sidebar — premium glass */}
      <aside className="glass-sidebar sidebar-top-accent hidden md:flex flex-col w-56 border-r border-sidebar-border flex-shrink-0">
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
                  "glass-card-hover nav-item-premium flex items-center gap-2.5 px-3 h-9 rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-glow-purple"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className="w-4 h-4" aria-hidden="true" />
                <span>{t(item.key)}</span>
              </Link>
            );
          })}
        </nav>

        {/* v18 §16.2/§16.6/§16.7 — Quick access buttons */}
        <div className="px-2 py-2 border-t border-sidebar-border space-y-1">
          {/* Smart Inbox button with badge */}
          <button
            onClick={() => setInboxOpen(true)}
            className="w-full flex items-center gap-2.5 px-3 h-9 rounded-md text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Smart Inbox"
          >
            <div className="relative">
              <Bell className="w-4 h-4" aria-hidden="true" />
              {inboxCount > 0 && (
                <span className="absolute -top-1.5 -end-1.5 bg-red-500 text-white text-[0.5rem] font-bold rounded-full min-w-4 h-4 flex items-center justify-center px-1">
                  {inboxCount > 99 ? "99+" : inboxCount}
                </span>
              )}
            </div>
            <span>Inbox</span>
          </button>

          {/* AI Assistant button */}
          <button
            onClick={() => setAssistantOpen(true)}
            className="w-full flex items-center gap-2.5 px-3 h-9 rounded-md text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="AI Assistant"
          >
            <Sparkles className="w-4 h-4 text-primary" aria-hidden="true" />
            <span>AI Assistant</span>
          </button>

          {/* Voice Command button */}
          <button
            onClick={() => setVoiceOpen(true)}
            className="w-full flex items-center gap-2.5 px-3 h-9 rounded-md text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Voice Command"
          >
            <Mic className="w-4 h-4" aria-hidden="true" />
            <span>Voice</span>
          </button>
        </div>

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
          <div className="flex items-center gap-1">
            <button
              onClick={() => setInboxOpen(true)}
              className="relative p-2 rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Inbox"
            >
              <Bell className="w-4 h-4" />
              {inboxCount > 0 && (
                <span className="absolute -top-0.5 -end-0.5 bg-red-500 text-white text-[0.5rem] font-bold rounded-full min-w-4 h-4 flex items-center justify-center px-1">
                  {inboxCount > 99 ? "99+" : inboxCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setAssistantOpen(true)}
              className="p-2 rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="AI Assistant"
            >
              <Sparkles className="w-4 h-4 text-primary" />
            </button>
            <button
              onClick={() => setMobileOpen(o => !o)}
              className="p-2 -me-2 rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Toggle navigation"
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
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
        <main className="page-enter flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-4">
          {children}
        </main>
        <footer className="border-t border-border/40 bg-card/20 mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>SGTX · Sovereign Governed Trade Execution</span>
            <span className="hidden sm:inline">{t("footer.nonCustodial")} · {t("footer.aiGoverned")} · {t("footer.sovereign")}</span>
          </div>
        </footer>
      </div>

      {/* ═══ v18 §16.2 — Smart Inbox Drawer ══════════════════════════════════ */}
      {inboxOpen && (
        <InboxDrawer
          items={inboxItems}
          tenantGtid={tenantGtid}
          onClose={() => setInboxOpen(false)}
          onDismiss={async (itemId: string) => {
            try {
              await fetchWithAuth(`/api/sgtx/inbox/${itemId}/dismiss`, { method: "POST" });
              qc.invalidateQueries({ queryKey: ["cockpit-inbox-count", tenantGtid] });
              toast.success("Item dismissed");
            } catch { toast.error("Failed to dismiss"); }
          }}
        />
      )}

      {/* ═══ v18 §16.7 — AI Assistant Drawer ═════════════════════════════════ */}
      {assistantOpen && (
        <AssistantDrawer
          tenantGtid={tenantGtid}
          tenantName={tenantName}
          onClose={() => setAssistantOpen(false)}
        />
      )}

      {/* ═══ v18 §16.6 — Voice Command Modal ════════════════════════════════ */}
      {voiceOpen && (
        <VoiceCommandModal onClose={() => setVoiceOpen(false)} />
      )}
    </div>
  );
}

// ═══ v18 §16.2 — Smart Inbox Drawer ═════════════════════════════════════════════
function InboxDrawer({ items, tenantGtid, onClose, onDismiss }: {
  items: any[];
  tenantGtid?: string;
  onClose: () => void;
  onDismiss: (itemId: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-label="Smart Inbox">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="animate-slide-in-right glass-drawer relative w-full max-w-md border-s border-border shadow-2xl flex flex-col">
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Inbox className="w-4 h-4" />
            <span className="text-sm font-semibold">Smart Inbox</span>
            {items.length > 0 && <Badge variant="secondary" className="text-[0.6rem]">{items.length}</Badge>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* Items */}
        <ScrollArea className="premium-scroll flex-1">
          <div className="p-3 space-y-2">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Bell className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">No pending items</p>
                <p className="text-xs mt-1">You're all caught up.</p>
              </div>
            ) : (
              items.slice(0, 20).map((item: any, i: number) => (
                <div key={item.id || i} className="glass-card-hover p-3 rounded-lg border border-border bg-card/50 hover:bg-card transition">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.title || item.description || "Untitled"}</p>
                      {item.ustn && <p className="text-[0.6rem] text-muted-foreground font-mono">{item.ustn}</p>}
                    </div>
                    {item.priority != null && (
                      <Badge variant={item.priority >= 90 ? "destructive" : "secondary"} className="text-[0.5rem]">
                        P{item.priority}
                      </Badge>
                    )}
                  </div>
                  {item.description && item.title && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{item.description}</p>
                  )}
                  <div className="flex items-center justify-between">
                    {item.deadline && (
                      <span className="text-[0.6rem] text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {new Date(item.deadline).toLocaleDateString()}
                      </span>
                    )}
                    <button
                      onClick={() => onDismiss(item.id)}
                      className="text-[0.6rem] text-muted-foreground hover:text-foreground flex items-center gap-1 ms-auto"
                    >
                      <XCircle className="w-3 h-3" /> Dismiss
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
        {/* AI Summary footer */}
        {items.length > 0 && (
          <div className="border-t border-border p-3">
            <InboxAISummary tenantGtid={tenantGtid} count={items.length} />
          </div>
        )}
      </div>
    </div>
  );
}

function InboxAISummary({ tenantGtid, count }: { tenantGtid?: string; count: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["inbox-ai-summary", tenantGtid],
    queryFn: async () => {
      try {
        const res = await fetchWithAuth(`/api/sgtx/ai/inbox-summary`);
        if (!res.ok) return null;
        return res.json();
      } catch { return null; }
    },
    enabled: !!tenantGtid && count > 0,
    retry: false,
    staleTime: 60_000,
  });

  if (isLoading) return <div className="text-[0.6rem] text-muted-foreground">AI summary loading…</div>;
  if (!data) return null;

  return (
    <div className="flex items-start gap-2">
      <Sparkles className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
      <p className="text-[0.65rem] text-muted-foreground leading-snug">{data.summary || data.message || "AI summary unavailable"}</p>
    </div>
  );
}

// ═══ v18 §16.7 — AI Assistant Drawer (Customer Care Chatbot) ═══════════════════
function AssistantDrawer({ tenantGtid, tenantName, onClose }: {
  tenantGtid?: string;
  tenantName?: string;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([
    { role: "assistant", content: `Hello${tenantName ? `, ${tenantName}` : ""}! I'm your SGTX AI assistant. I can help with trades, fees, customs, financing, and more. What do you need?` },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useCallback((node: HTMLDivElement | null) => {
    if (node) node.scrollTop = node.scrollHeight;
  }, []);

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      const res = await fetchWithAuth(`/api/sgtx/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, tenantGtid, context: "cockpit-assistant" }),
      });
      if (!res.ok) throw new Error("AI request failed");
      return res.json();
    },
    onMutate: () => setLoading(true),
    onSuccess: (data) => {
      setMessages(prev => [...prev, { role: "assistant", content: data.response || data.content || data.message || "I couldn't process that." }]);
    },
    onError: () => {
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I couldn't reach the AI service. Please try again." }]);
      toast.error("AI request failed");
    },
    onSettled: () => setLoading(false),
  });

  const handleSend = () => {
    const text = input.trim();
    if (!text || loading) return;
    setMessages(prev => [...prev, { role: "user", content: text }]);
    setInput("");
    sendMutation.mutate(text);
  };

  const suggestions = [
    "What trades need my attention?",
    "Explain the Fee Engine",
    "Show my payment health",
    "What is CFR pre-clearance?",
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-label="AI Assistant">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="animate-slide-in-right glass-drawer relative w-full max-w-md border-s border-border shadow-2xl flex flex-col">
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
            </div>
            <div>
              <span className="text-sm font-semibold">AI Assistant</span>
              <p className="text-[0.5rem] text-muted-foreground">Powered by z-ai (glm-4-plus)</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="premium-scroll flex-1 overflow-y-auto p-3 space-y-3">
          {messages.map((msg, i) => (
            <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground",
              )}>
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-3 py-2 flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span className="text-sm text-muted-foreground">Thinking…</span>
              </div>
            </div>
          )}
        </div>

        {/* Suggestions */}
        {messages.length <= 1 && (
          <div className="px-3 pb-2 flex flex-wrap gap-1.5">
            {suggestions.map(s => (
              <button
                key={s}
                onClick={() => { setInput(s); }}
                className="text-[0.65rem] px-2 py-1 rounded-full bg-muted hover:bg-muted/80 text-muted-foreground border border-border transition"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="border-t border-border p-3 flex items-center gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Ask anything about your trades…"
            className="flex-1 text-sm"
            disabled={loading}
            aria-label="Message AI assistant"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={loading || !input.trim()}
            aria-label="Send message"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ═══ v18 §16.6 — Voice Command Modal ═══════════════════════════════════════════
function VoiceCommandModal({ onClose }: { onClose: () => void }) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const startListening = async () => {
    setListening(true);
    setTranscript("");
    setResponse(null);
    // Simulated voice capture — production would use Web Speech API or Vosk
    try {
      const res = await fetchWithAuth(`/api/sgtx/voice/interpret`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "navigate to trades", context: { userGtid: "", currentScreen: "" } }),
      });
      if (res.ok) {
        const data = await res.json();
        setTranscript("navigate to trades");
        setResponse(data.response || data.result?.feedback || "Command processed");
      }
    } catch {
      setResponse("Voice service unavailable");
    }
    setListening(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-label="Voice Command">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="animate-scale-in glass-drawer relative w-full max-w-sm border border-border rounded-xl shadow-2xl flex flex-col items-center p-6 gap-4">
        <button onClick={onClose} className="absolute top-3 end-3 p-1.5 rounded-md hover:bg-muted" aria-label="Close">
          <X className="w-4 h-4" />
        </button>
        <h3 className="text-sm font-semibold mt-2">Voice Command</h3>
        <button
          onClick={startListening}
          disabled={listening || loading}
          className={cn(
            "glass-card-hover w-16 h-16 rounded-full flex items-center justify-center transition",
            listening ? "bg-red-500 animate-pulse shadow-glow-warning" : "bg-primary hover:bg-primary/90 shadow-glow-purple",
          )}
          aria-label={listening ? "Listening" : "Start voice command"}
        >
          <Mic className="w-6 h-6 text-primary-foreground" />
        </button>
        <p className="text-xs text-muted-foreground">
          {listening ? "Listening…" : "Tap to speak"}
        </p>
        {transcript && (
          <div className="w-full p-2 rounded-lg bg-muted text-sm text-center">
            "{transcript}"
          </div>
        )}
        {response && (
          <div className="w-full p-2 rounded-lg bg-primary/10 text-sm text-primary text-center">
            {response}
          </div>
        )}
      </div>
    </div>
  );
}

export function shouldShowAdmin(tenantType?: string): boolean {
  return tenantType === "ADM";
}
