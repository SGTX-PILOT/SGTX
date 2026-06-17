"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fmtUsd, fmtDate, timeAgo, healthColor, healthBand, statusColor, PHASE_LABELS, healthComponents, priorityColor } from "@/lib/sgtx/format";
import { useAppStore } from "@/store/app-store";
import { ExternalLink, FileText, TrendingUp, AlertTriangle, CheckCircle2, Clock, Activity, ArrowUpRight, Ship, ChevronRight, Sparkles, Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ============ Executive Summary Cards ============
export function ExecutiveCards({ cards }: { cards: { label: string; value: string; sub?: string; icon: LucideIcon; accent?: string; trend?: string }[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {cards.map((c, i) => {
        const Icon = c.icon;
        return (
          <motion.div key={c.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="relative p-4 sm:p-5 overflow-hidden hover:border-gold/40 transition-colors group cursor-default" >
              <div className="absolute top-0 right-0 w-20 h-20 rounded-full blur-2xl opacity-10 group-hover:opacity-20 transition-opacity" style={{ background: c.accent || "oklch(0.82 0.14 84)" }} />
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${c.accent || "oklch(0.82 0.14 84)"}1a` }}>
                  <Icon className="w-4.5 h-4.5" style={{ color: c.accent || "oklch(0.82 0.14 84)" }} />
                </div>
                {c.trend && <span className="text-[0.65rem] text-emerald-400 flex items-center gap-0.5"><TrendingUp className="w-3 h-3" />{c.trend}</span>}
              </div>
              <p className="text-xl sm:text-2xl font-bold text-foreground font-display">{c.value}</p>
              <p className="text-[0.7rem] text-muted-foreground mt-0.5">{c.label}</p>
              {c.sub && <p className="text-[0.6rem] text-muted-foreground/70 mt-1">{c.sub}</p>}
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}

// ============ Trade Health Score ============
export function HealthBadge({ score, size = "sm" }: { score: number; size?: "sm" | "md" }) {
  const color = healthColor(score);
  const band = healthBand(score);
  const sz = size === "md" ? "px-3 py-1 text-xs" : "px-2 py-0.5 text-[0.65rem]";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${sz}`} style={{ color, background: `${color}1a`, border: `1px solid ${color}40` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {score} · {band}
    </span>
  );
}

export function HealthBreakdown({ trade }: { trade: any }) {
  const h = healthComponents(trade);
  const comps = [
    { label: "Compliance", val: h.compliance, w: 0.20 },
    { label: "Documentation", val: h.documentation, w: 0.20 },
    { label: "Logistics", val: h.logistics, w: 0.15 },
    { label: "Payment", val: h.payment, w: 0.15 },
    { label: "Risk", val: h.risk, w: 0.20 },
    { label: "Timeline", val: h.timeline, w: 0.10 },
  ];
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiProvider, setAiProvider] = useState<string | null>(null);

  const loadAi = async () => {
    if (aiLoading || aiSummary) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/sgtx/ai/health-summary", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ustn: trade.ustn }),
      });
      const d = await res.json();
      setAiSummary(d.content);
      setAiProvider(d.provider);
    } catch { setAiSummary("AI summary unavailable."); }
    finally { setAiLoading(false); }
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Trade Health Score</p>
          <p className="text-3xl font-bold font-display" style={{ color: healthColor(h.score) }}>{h.score}<span className="text-sm text-muted-foreground">/100</span></p>
        </div>
        <div className="text-right">
          <HealthBadge score={h.score} size="md" />
          <p className="text-[0.6rem] text-muted-foreground mt-1 max-w-[180px]">Composite: compliance·20 + docs·20 + logistics·15 + payment·15 + risk·20 + timeline·10</p>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {comps.map((c) => (
          <div key={c.label}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[0.65rem] text-muted-foreground">{c.label} · {Math.round(c.w * 100)}%</span>
              <span className="text-xs font-semibold" style={{ color: healthColor(c.val) }}>{c.val}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <motion.div initial={{ width: 0 }} animate={{ width: `${c.val}%` }} transition={{ duration: 0.8 }} className="h-full rounded-full" style={{ background: healthColor(c.val) }} />
            </div>
          </div>
        ))}
      </div>
      {/* AI Health Summary (Part 12G.7.6) */}
      <div className="mt-3 p-3 rounded-lg bg-gold/5 border border-gold/20">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[0.6rem] tracking-widest text-gold uppercase font-semibold flex items-center gap-1"><Sparkles className="w-3 h-3" /> AI Health Summary</p>
          {!aiSummary && !aiLoading && <button onClick={loadAi} className="text-[0.65rem] text-gold hover:underline">Generate</button>}
          {aiProvider && <span className="text-[0.55rem] text-muted-foreground">via {aiProvider}</span>}
        </div>
        {aiLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Analyzing trade health…</div>
        ) : aiSummary ? (
          <p className="text-xs text-foreground/90">{aiSummary}</p>
        ) : (
          <p className="text-[0.65rem] text-muted-foreground">Generate a plain-language health summary (🧠 A1 advisory).</p>
        )}
      </div>
    </Card>
  );
}

// ============ Shipments Vault (trades table) ============
export function ShipmentsVault({ trades, role, title = "Shipments Vault", emptyText = "No shipments yet" }: { trades: any[]; role: "buyer" | "seller" | "carrier" | "provider" | "gov"; title?: string; emptyText?: string }) {
  const openTcc = useAppStore((s) => s.openTcc);
  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">{title}</h3>
          <p className="text-[0.65rem] text-muted-foreground">{trades.length} records · USTN-linked</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[0.6rem]">{trades.filter(t => t.status === "IN_EXECUTION").length} active</Badge>
          <Button variant="outline" size="sm" className="h-7 text-xs">Export CSV</Button>
        </div>
      </div>
      <div className="overflow-x-auto scroll-gold">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[0.65rem] text-muted-foreground uppercase tracking-wider">
              <th className="text-left font-medium px-4 py-2.5">USTN</th>
              <th className="text-left font-medium px-3 py-2.5">Counterparty</th>
              <th className="text-left font-medium px-3 py-2.5 hidden md:table-cell">Commodity</th>
              <th className="text-left font-medium px-3 py-2.5 hidden lg:table-cell">Route</th>
              <th className="text-right font-medium px-3 py-2.5 hidden sm:table-cell">Value</th>
              <th className="text-left font-medium px-3 py-2.5">Status</th>
              <th className="text-left font-medium px-3 py-2.5 hidden md:table-cell">Health</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 && (
              <tr><td colSpan={8} className="text-center text-muted-foreground text-xs py-12">{emptyText}</td></tr>
            )}
            {trades.map((t) => {
              const counterparty = role === "buyer" ? t.seller : role === "seller" ? t.buyer : t.seller;
              const color = statusColor(t.status);
              return (
                <tr key={t.id} onClick={() => openTcc(t.ustn)} className="border-b border-border/40 hover:bg-muted/30 cursor-pointer transition-colors group">
                  <td className="px-4 py-3">
                    <p className="font-mono text-[0.7rem] text-foreground font-medium">{t.ustn.slice(0, 24)}…</p>
                    <p className="text-[0.6rem] text-muted-foreground">{fmtDate(t.createdAt)}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="text-xs font-medium text-foreground truncate max-w-[140px]">{counterparty?.legalName}</p>
                    <p className="text-[0.6rem] text-muted-foreground font-mono">{counterparty?.gtid?.slice(0, 18)}…</p>
                  </td>
                  <td className="px-3 py-3 hidden md:table-cell"><span className="text-xs text-foreground/80 truncate block max-w-[140px]">{t.commodity}</span></td>
                  <td className="px-3 py-3 hidden lg:table-cell"><span className="text-[0.7rem] text-muted-foreground">{t.originPort} → {t.destPort}</span></td>
                  <td className="px-3 py-3 text-right hidden sm:table-cell"><span className="text-xs font-semibold">{fmtUsd(t.tradeValueUsd)}</span></td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.6rem] font-semibold" style={{ color, background: `${color}1a` }}>
                      {t.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-3 py-3 hidden md:table-cell"><HealthBadge score={t.healthScore} /></td>
                  <td className="px-3 py-3"><ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-gold transition-colors" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ============ Activity Feed ============
export function ActivityFeed({ activities, max = 12 }: { activities: any[]; max?: number }) {
  const typeColor = (t: string) => t === "SUCCESS" ? "#10b981" : t === "WARNING" ? "#fbbf24" : t === "CRITICAL" ? "#f87171" : "#60a5fa";
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm flex items-center gap-2"><Activity className="w-4 h-4 text-gold" /> Recent Activity</h3>
        <span className="text-[0.6rem] text-muted-foreground">🔄 live via NATS</span>
      </div>
      <ScrollArea className="h-[320px] scroll-gold pr-2">
        <div className="space-y-1">
          {activities.slice(0, max).map((a, i) => {
            const color = typeColor(a.type);
            return (
              <motion.div key={a.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }} className="flex gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors">
                <div className="flex-shrink-0 mt-1">
                  <span className="block w-2 h-2 rounded-full" style={{ background: color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground leading-snug">{a.description}</p>
                  <p className="text-[0.6rem] text-muted-foreground mt-0.5">
                    {a.actor?.legalName || "System"} · {timeAgo(a.createdAt)}
                    {a.trade?.ustn && <span className="font-mono"> · {a.trade.ustn.slice(0, 18)}…</span>}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </ScrollArea>
    </Card>
  );
}

// ============ Pending Action Panel (TCC) ============
export function PendingActionPanel({ trade, perspective }: { trade: any; perspective: string }) {
  const [aiWhy, setAiWhy] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  // derive the single most important pending action for this trade
  const pendingActions: { label: string; cta: string; why: string; urgency: "high" | "med" | "low"; context: string }[] = [];
  if (trade.documents?.some((d: any) => d.status === "REQUIRED" || d.status === "MISSING")) {
    const doc = trade.documents.find((d: any) => d.status === "REQUIRED" || d.status === "MISSING");
    pendingActions.push({ label: `Upload ${doc.title}`, cta: "Upload Now", why: "This document is required to progress to the next phase.", urgency: "high", context: `Trade ${trade.ustn.slice(0, 24)} (${trade.commodity}), phase ${trade.phase}/8. Document "${doc.title}" is ${doc.status}.` });
  }
  if (trade.invoices?.some((i: any) => i.status === "PENDING" && i.dueDate)) {
    const inv = trade.invoices.find((i: any) => i.status === "PENDING");
    pendingActions.push({ label: `Approve ${inv.number} (${fmtUsd(inv.amountUsd)})`, cta: "Approve Payment", why: "Settlement cannot complete until this invoice is approved.", urgency: "med", context: `Invoice ${inv.number} for ${fmtUsd(inv.amountUsd)} is ${inv.status}, due ${fmtDate(inv.dueDate)}. Trade ${trade.ustn.slice(0, 24)}.` });
  }
  if (trade.status === "IN_EXECUTION") {
    pendingActions.push({ label: "Monitor shipment milestone", cta: "View Map", why: "Shipment is in transit — next milestone confirmation due on arrival.", urgency: "low", context: `Trade ${trade.ustn.slice(0, 24)} is IN_EXECUTION, phase ${trade.phase}/8. Shipment in transit from ${trade.originPort} to ${trade.destPort}.` });
  }
  const top = pendingActions[0] || { label: "No pending actions", cta: "", why: "This trade is on track. All required actions are complete.", urgency: "low" as const, context: `Trade ${trade.ustn.slice(0, 24)} is on track.` };
  const color = top.urgency === "high" ? "#f87171" : top.urgency === "med" ? "#fbbf24" : "#10b981";

  const loadAiWhy = async () => {
    if (aiLoading || aiWhy) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/sgtx/ai/why-matters", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: top.label, context: top.context }),
      });
      const d = await res.json();
      setAiWhy(d.content);
    } catch { setAiWhy(top.why); }
    finally { setAiLoading(false); }
  };

  return (
    <Card className="p-4 border-l-4" style={{ borderLeftColor: color }}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-3.5 h-3.5" style={{ color }} />
            <p className="text-[0.6rem] tracking-widest uppercase font-semibold" style={{ color }}>Next Action · {perspective}</p>
          </div>
          <p className="text-sm font-semibold text-foreground">{top.label}</p>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-gold" />
            {aiLoading ? <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> generating explanation…</span> : aiWhy || top.why}
          </p>
          {!aiWhy && !aiLoading && (
            <button onClick={loadAiWhy} className="text-[0.65rem] text-gold hover:underline mt-1">🧠 Explain why this matters</button>
          )}
        </div>
        {top.cta && <Button size="sm" className="bg-gold-gradient text-sovereign hover:opacity-90 h-8">{top.cta}</Button>}
      </div>
    </Card>
  );
}

// ============ Phase Timeline ============
export function PhaseTimeline({ trade }: { trade: any }) {
  const phases = trade.timeline || [];
  const currentPhase = trade.phase;
  return (
    <Card className="p-4">
      <h3 className="font-semibold text-sm mb-3">Trade Lifecycle · Phases 0–8</h3>
      <div className="flex items-center gap-1 overflow-x-auto scroll-gold pb-2">
        {phases.map((p: any, i: number) => {
          const color = p.completed ? "#10b981" : p.phase === currentPhase ? "#fbbf24" : "#475569";
          return (
            <div key={i} className="flex items-center flex-shrink-0">
              <div className="flex flex-col items-center gap-1 w-20">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[0.65rem] font-bold border-2" style={{ borderColor: color, color, background: p.completed ? `${color}22` : "transparent" }}>
                  {p.completed ? "✓" : p.phase}
                </div>
                <span className="text-[0.55rem] text-center text-muted-foreground leading-tight">{p.label}</span>
              </div>
              {i < phases.length - 1 && <div className="h-0.5 w-6 sm:w-10" style={{ background: p.completed ? "#10b981" : "#334155" }} />}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ============ Documents List ============
export function DocumentsList({ documents }: { documents: any[] }) {
  const docIcon = (t: string) => ({ COMMERCIAL_INVOICE: "🧾", PACKING_LIST: "📦", CERTIFICATE_ORIGIN: "🌍", PHYTO: "🌿", HEALTH_CERT: "🏥", BILL_LADING: "🚢", CUSTOMS_DECL: "🏛", LAB_REPORT: "🧪", QC_REPORT: "✓", CONTRACT: "📜", LOGISTICS_ADDENDUM: "🚚", COLD_CHAIN: "❄️" } as any)[t] || "📄";
  const verified = documents.filter(d => d.status === "VERIFIED").length;
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm flex items-center gap-2"><FileText className="w-4 h-4 text-gold" /> Documents</h3>
        <span className="text-[0.65rem] text-muted-foreground">{verified}/{documents.length} verified</span>
      </div>
      <div className="space-y-1.5">
        {documents.map((d) => {
          const color = statusColor(d.status);
          return (
            <div key={d.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors">
              <span className="text-lg">{docIcon(d.type)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{d.title}</p>
                <p className="text-[0.6rem] text-muted-foreground">{d.type.replace(/_/g, " ")} · {d.fileSizeKb ? `${d.fileSizeKb} KB` : "—"}</p>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[0.6rem] font-semibold" style={{ color, background: `${color}1a` }}>{d.status}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ============ Invoices List ============
export function InvoicesList({ invoices, perspective }: { invoices: any[]; perspective: "payer" | "payee" }) {
  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-sm">Invoices & Payments</h3>
        <span className="text-[0.65rem] text-muted-foreground">{invoices.length} invoices · {fmtUsd(invoices.reduce((s, i) => s + i.amountUsd, 0))} total</span>
      </div>
      <div className="divide-y divide-border/40">
        {invoices.map((inv) => {
          const color = statusColor(inv.status);
          const isPayer = perspective === "payer";
          return (
            <div key={inv.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${color}1a` }}>
                <span className="text-xs font-bold" style={{ color }}>{inv.type.slice(0, 3)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground">{inv.number}</p>
                <p className="text-[0.6rem] text-muted-foreground">{inv.type.replace(/_/g, " ")} · {isPayer ? "You pay" : "You receive"} · due {fmtDate(inv.dueDate)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-foreground">{fmtUsd(inv.amountUsd)}</p>
                <span className="text-[0.6rem] font-semibold" style={{ color }}>{inv.status}</span>
              </div>
              {inv.status === "PENDING" && isPayer && <Button size="sm" className="h-7 bg-gold-gradient text-sovereign">Pay</Button>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ============ Quick Actions Grid ============
export function QuickActions({ actions }: { actions: { label: string; icon: LucideIcon; accent?: string; onClick?: () => void }[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
      {actions.map((a) => {
        const Icon = a.icon;
        return (
          <button key={a.label} onClick={a.onClick} className="glass-panel rounded-xl p-3 text-left hover:ring-gold transition-all group">
            <Icon className="w-4.5 h-4.5 mb-2" style={{ color: a.accent || "oklch(0.82 0.14 84)" }} />
            <p className="text-xs font-medium text-foreground group-hover:text-gold transition-colors">{a.label}</p>
          </button>
        );
      })}
    </div>
  );
}

// ============ Section header ============
export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between mb-3">
      <div>
        <h2 className="font-display text-lg font-bold text-foreground">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
