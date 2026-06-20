"use client";

// SGTX Quick Start (Blueprint Part 12F)
// - QuickStartDecisionTree  : interactive "What is your role?" picker → portal recommendation
// - TabIndexScreen          : alphabetical searchable index of all portal tabs
// - KeyboardShortcutsHelp   : modal showing all keyboard shortcuts

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PORTALS, PORTAL_MAP } from "@/lib/sgtx/portal-config";
import { useAppStore } from "@/store/app-store";
import {
  ShoppingBag, Store, Truck, Ship, Landmark,
  Banknote, Crown, Plug, Sparkles, Search, X, ArrowRight,
  Keyboard, Command, CornerDownLeft, HelpCircle, Lock, Users, Zap,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ============ Role decision tree definitions ============
interface RoleChoice {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  portalId: string;
  accent: string;
}

const ROLES: RoleChoice[] = [
  { id: "buyer", label: "I am a BUYER", description: "Importer — initiate trade requests, review quotes, manage inbound.", icon: ShoppingBag, portalId: "trader-buyer", accent: "#1a6fb0" },
  { id: "seller", label: "I am a SELLER", description: "Exporter — receive requests, lock EXW pricing, manage outbound.", icon: Store, portalId: "trader-seller", accent: "#d4321a" },
  { id: "logistics", label: "I am LOGISTICS", description: "LSP — trucking, forwarding, milestones, fleet.", icon: Truck, portalId: "lsp", accent: "#c2410c" },
  { id: "shipping", label: "I am a SHIPPING LINE", description: "Ocean carrier — vessels, containers, B/L issuance.", icon: Ship, portalId: "ship", accent: "#0d6efd" },
  { id: "financier", label: "I am a FINANCIER", description: "Bank / private capital — bid on RFQs, manage loans.", icon: Banknote, portalId: "bank", accent: "#1e40af" },
  { id: "government", label: "I am GOVERNMENT", description: "Customs · CBE · NFSA — oversight, revenue, compliance.", icon: Landmark, portalId: "gov", accent: "#b45309" },
  { id: "admin", label: "I am PLATFORM ADMIN", description: "Sovereign governance — Governor, multisig, audit.", icon: Crown, portalId: "admin", accent: "#ca8a04" },
  { id: "marketplace-partner", label: "I am a MARKETPLACE PARTNER", description: "External platform — lead attribution, webhooks, revenue share.", icon: Plug, portalId: "marketplace-partner", accent: "#0891b2" },
];

// ============================================================
// 1. QUICK START DECISION TREE
// ============================================================
export function QuickStartDecisionTree({ onClose }: { onClose?: () => void }) {
  const enterPortal = useAppStore((s) => s.enterPortal);
  const [selected, setSelected] = useState<RoleChoice | null>(null);

  const go = (role: RoleChoice) => {
    const portal = PORTAL_MAP[role.portalId];
    if (!portal) return;
    enterPortal(portal.id, portal.defaultTenantGtid);
    onClose?.();
  };

  // Esc closes modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card border border-border rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between bg-gold/5">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-gold" />
            <div>
              <h2 className="font-display text-lg font-bold text-foreground">Quick Start Decision Tree</h2>
              <p className="text-[0.65rem] text-muted-foreground">Part 12F.1 — Find your portal in one click</p>
            </div>
          </div>
          {onClose && (
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Body */}
        <ScrollArea className="flex-1">
          <div className="p-6 space-y-5">
            {/* Question */}
            <div className="text-center">
              <p className="text-[0.6rem] tracking-widest text-gold uppercase font-semibold mb-2">Step 1</p>
              <h3 className="font-display text-xl font-bold text-foreground">What is your role?</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Select the role you operate as today. Each portal shares one USTN-linked truth layer.
              </p>
            </div>

            {/* Role grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ROLES.map((role, i) => {
                const Icon = role.icon;
                const isSel = selected?.id === role.id;
                return (
                  <motion.button
                    key={role.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    whileHover={{ y: -2 }}
                    onClick={() => setSelected(role)}
                    className={`relative text-left p-4 rounded-xl border transition-all overflow-hidden group ${
                      isSel ? "border-gold bg-gold/10" : "border-border bg-muted/20 hover:border-gold/40 hover:bg-muted/40"
                    }`}
                  >
                    <div
                      className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-10 group-hover:opacity-25 transition-opacity blur-2xl"
                      style={{ background: role.accent }}
                    />
                    <div className="relative flex items-start gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: `${role.accent}1a`, border: `1px solid ${role.accent}44` }}
                      >
                        <Icon className="w-5 h-5" style={{ color: role.accent }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">{role.label}</p>
                        <p className="text-[0.7rem] text-muted-foreground mt-0.5 leading-relaxed">{role.description}</p>
                      </div>
                      {isSel && <Sparkles className="w-4 h-4 text-gold flex-shrink-0" />}
                    </div>
                  </motion.button>
                );
              })}
            </div>

            {/* Recommendation */}
            <AnimatePresence>
              {selected && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <Card className="p-4 border-gold/40 bg-gold/5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div
                          className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ background: `${selected.accent}1a`, border: `1px solid ${selected.accent}44` }}
                        >
                          <selected.icon className="w-6 h-6" style={{ color: selected.accent }} />
                        </div>
                        <div>
                          <p className="text-[0.6rem] tracking-widest text-gold uppercase font-semibold">Recommended Portal</p>
                          <h4 className="font-display text-base font-bold text-foreground">
                            {PORTAL_MAP[selected.portalId]?.name || selected.label}
                          </h4>
                          <p className="text-[0.7rem] text-muted-foreground mt-0.5">
                            {PORTAL_MAP[selected.portalId]?.description || selected.description}
                          </p>
                          <p className="text-[0.6rem] text-muted-foreground/70 font-mono mt-1">
                            {PORTAL_MAP[selected.portalId]?.defaultTenantGtid}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button
                        size="sm"
                        className="bg-gold-gradient text-sovereign h-8 text-xs"
                        onClick={() => go(selected)}
                      >
                        Enter Portal <ArrowRight className="w-3 h-3 ml-1" />
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setSelected(null)}>
                        Choose Different Role
                      </Button>
                    </div>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Hint */}
            <div className="p-3 rounded-lg bg-muted/30 text-center">
              <p className="text-[0.65rem] text-muted-foreground leading-relaxed">
                💡 Tip: Press <kbd className="px-1.5 py-0.5 rounded bg-background border border-border text-[0.6rem] font-mono">⌘K</kbd> anywhere to open the command palette · <kbd className="px-1.5 py-0.5 rounded bg-background border border-border text-[0.6rem] font-mono">⌘H</kbd> for Help · <kbd className="px-1.5 py-0.5 rounded bg-background border border-border text-[0.6rem] font-mono">⌘?</kbd> for shortcuts
              </p>
            </div>
          </div>
        </ScrollArea>
      </motion.div>
    </div>
  );
}

// ============================================================
// 2. ALPHABETICAL TAB INDEX
// ============================================================
interface IndexedTab {
  portalId: string;
  portalName: string;
  portalAccent: string;
  tabId: string;
  tabLabel: string;
  tabGroup: string;
  icon: LucideIcon;
}

export function TabIndexScreen({ onClose }: { onClose?: () => void }) {
  const enterPortal = useAppStore((s) => s.enterPortal);
  const [search, setSearch] = useState("");

  // Flatten all tabs across all portals
  const allTabs: IndexedTab[] = useMemo(() => {
    const list: IndexedTab[] = [];
    for (const p of PORTALS) {
      for (const t of p.tabs) {
        list.push({
          portalId: p.id,
          portalName: p.shortName,
          portalAccent: p.accent,
          tabId: t.id,
          tabLabel: t.label,
          tabGroup: t.group || "Main",
          icon: t.icon,
        });
      }
    }
    return list.sort((a, b) => a.tabLabel.localeCompare(b.tabLabel));
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return allTabs;
    const q = search.toLowerCase();
    return allTabs.filter((t) =>
      t.tabLabel.toLowerCase().includes(q) ||
      t.portalName.toLowerCase().includes(q) ||
      t.tabGroup.toLowerCase().includes(q) ||
      t.tabId.toLowerCase().includes(q)
    );
  }, [allTabs, search]);

  const navigate = (t: IndexedTab) => {
    const portal = PORTAL_MAP[t.portalId];
    if (!portal) return;
    enterPortal(portal.id, portal.defaultTenantGtid);
    onClose?.();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-foreground">Alphabetical Tab Index</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Part 12F.2 — {allTabs.length} tabs across {PORTALS.length} portals · searchable · click to navigate
          </p>
        </div>
        <Badge variant="outline" className="text-[0.65rem]">{filtered.length} shown</Badge>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tabs, portals, or groups…"
          className="pl-9"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <Card className="p-0 overflow-hidden">
        <ScrollArea className="max-h-[60vh] scroll-gold">
          <div className="divide-y divide-border/30">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">No tabs match your search.</div>
            ) : (
              filtered.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={`${t.portalId}-${t.tabId}`}
                    onClick={() => navigate(t)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors text-left"
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `${t.portalAccent}1a` }}
                    >
                      <Icon className="w-4 h-4" style={{ color: t.portalAccent }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{t.tabLabel}</p>
                      <p className="text-[0.65rem] text-muted-foreground">
                        {t.portalName} · {t.tabGroup}
                      </p>
                    </div>
                    <code className="text-[0.6rem] text-muted-foreground/70 font-mono">{t.tabId}</code>
                    <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>
      </Card>
    </div>
  );
}

// ============================================================
// 3. KEYBOARD SHORTCUTS HELP
// ============================================================
export interface ShortcutDef {
  keys: string[]; // e.g. ["Cmd", "K"] — joined with "+"
  description: string;
  category: string;
  icon: LucideIcon;
}

export const KEYBOARD_SHORTCUTS: ShortcutDef[] = [
  { keys: ["Ctrl/Cmd", "K"], description: "Open global search / command palette", category: "Navigation", icon: Search },
  { keys: ["Ctrl/Cmd", "Shift", "M"], description: "Toggle Buyer/Seller dual-mode (trader portals)", category: "Navigation", icon: Zap },
  { keys: ["Ctrl/Cmd", "I"], description: "Open AI Assistant", category: "AI", icon: Sparkles },
  { keys: ["Ctrl/Cmd", "D"], description: "Open Company Admin", category: "Navigation", icon: Users },
  { keys: ["Ctrl/Cmd", "H"], description: "Open Help Center", category: "Help", icon: HelpCircle },
  { keys: ["Ctrl/Cmd", "Enter"], description: "Submit the current form", category: "Forms", icon: CornerDownLeft },
  { keys: ["Esc"], description: "Close any open modal / drawer", category: "UI", icon: X },
  { keys: ["Ctrl/Cmd", "?"], description: "Show this keyboard shortcuts help", category: "Help", icon: Keyboard },
  { keys: ["Ctrl/Cmd", "B"], description: "Toggle sidebar collapse", category: "Navigation", icon: Lock },
  { keys: ["Ctrl/Cmd", ","], description: "Open portal settings", category: "Navigation", icon: Settings },
  { keys: ["/"], description: "Focus the global search bar", category: "Navigation", icon: Search },
  { keys: ["g", "l"], description: "Go to Portal Launcher", category: "Navigation", icon: Command },
];

export function KeyboardShortcutsHelp({ onClose }: { onClose?: () => void }) {
  // Esc closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const grouped = KEYBOARD_SHORTCUTS.reduce<Record<string, ShortcutDef[]>>((acc, s) => {
    (acc[s.category] = acc[s.category] || []).push(s);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between bg-gold/5">
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-gold" />
            <div>
              <h2 className="font-display text-lg font-bold text-foreground">Keyboard Shortcuts</h2>
              <p className="text-[0.65rem] text-muted-foreground">Part 12F — Speed up your SGTX workflow</p>
            </div>
          </div>
          {onClose && (
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        <ScrollArea className="flex-1">
          <div className="p-6 space-y-5">
            {Object.entries(grouped).map(([cat, items]) => (
              <div key={cat}>
                <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold mb-2">{cat}</p>
                <div className="space-y-1.5">
                  {items.map((s) => {
                    const Icon = s.icon;
                    return (
                      <div
                        key={s.description}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon className="w-4 h-4 text-gold flex-shrink-0" />
                          <span className="text-xs text-foreground">{s.description}</span>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {s.keys.map((k, i) => (
                            <span key={i} className="flex items-center gap-1">
                              {i > 0 && <span className="text-[0.6rem] text-muted-foreground">+</span>}
                              <kbd className="px-2 py-1 rounded bg-background border border-border text-[0.65rem] font-mono font-semibold text-foreground min-w-[24px] text-center">
                                {k}
                              </kbd>
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="p-3 rounded-lg bg-muted/30 text-center">
              <p className="text-[0.65rem] text-muted-foreground leading-relaxed">
                💡 macOS users: replace <kbd className="px-1.5 py-0.5 rounded bg-background border border-border text-[0.6rem] font-mono">Ctrl</kbd> with <kbd className="px-1.5 py-0.5 rounded bg-background border border-border text-[0.6rem] font-mono">⌘ Cmd</kbd>. Voice commands also available via the microphone icon.
              </p>
            </div>
          </div>
        </ScrollArea>
      </motion.div>
    </div>
  );
}
