"use client";

// SGTX Marketplace Partner Portal screens (Blueprint Part 12C.12)
// - MarketplaceCommandCenter   : dashboard (lead count, revenue share, active attributions, webhook stats)
// - MarketplaceLeadsScreen     : list PartnerLeadAttribution records (buyer/seller/revenue/dispute status)
// - MarketplaceWebhooksScreen  : list WebhookDeliveryLog (delivery status/retries, test webhook button)
// - MarketplaceRevenueScreen   : revenue share summary, monthly breakdown, payout history
// - MarketplaceApiKeysScreen   : show masked API key, regenerate, rate limit info
// - MarketplaceSandboxScreen   : sandbox leads management, synthetic data
// - MarketplaceAgreementScreen : show partner agreement, revenue share %, signed date
// - MarketplaceCompanyAdminScreen : partner company settings

import { useState } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SectionHeader } from "@/components/sgtx/widgets";
import { fmtUsd, fmtDate, fmtDateTime, timeAgo, statusColor } from "@/lib/sgtx/format";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import {
  Plug, Handshake, Webhook, Banknote, KeyRound, FlaskConical, FileText, Users,
  Loader2, Sparkles, CheckCircle2, Clock, RefreshCw, Send, ShieldCheck,
  Activity, TrendingUp, Globe2, AlertTriangle, Eye, Copy, AlertOctagon,
  PlayCircle, ExternalLink, Lock, Zap, Bell,
} from "lucide-react";

const DEFAULT_PARTNER_GTID = "SGTX-XX-MKT-000001-API1";

// ============ Shared helpers ============
async function jfetch<T = any>(url: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(url, opts);
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { const j = await r.json(); msg = j.error || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return r.json() as Promise<T>;
}

function StatTile({
  label, value, sub, icon: Icon, accent = "#0891b2",
}: { label: string; value: string | number; sub?: string; icon: LucideIcon; accent?: string }) {
  return (
    <Card className="relative p-4 overflow-hidden hover:border-gold/40 transition-colors group">
      <div className="absolute top-0 right-0 w-16 h-16 rounded-full blur-2xl opacity-10 group-hover:opacity-25 transition-opacity" style={{ background: accent }} />
      <div className="flex items-start justify-between mb-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${accent}1a` }}>
          <Icon className="w-4 h-4" style={{ color: accent }} />
        </div>
      </div>
      <p className="text-2xl font-bold text-foreground font-display">{value}</p>
      <p className="text-[0.7rem] text-muted-foreground mt-0.5">{label}</p>
      {sub && <p className="text-[0.6rem] text-muted-foreground/70 mt-1">{sub}</p>}
    </Card>
  );
}

function SectionCard({
  title, icon: Icon, accent = "#0891b2", children, action,
}: { title: string; icon: LucideIcon; accent?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <span className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: `${accent}1a` }}>
            <Icon className="w-3.5 h-3.5" style={{ color: accent }} />
          </span>
          {title}
        </h3>
        {action}
      </div>
      {children}
    </Card>
  );
}

function StatusPill({ status }: { status: string }) {
  const color = statusColor(status);
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[0.65rem] font-semibold"
      style={{ color, background: `${color}1a`, border: `1px solid ${color}40` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {status}
    </span>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-center py-8 text-xs text-muted-foreground">
      <CheckCircle2 className="w-6 h-6 mx-auto mb-2 text-emerald-400/60" />
      {children}
    </div>
  );
}

function QueryLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-10">
      <Loader2 className="w-5 h-5 animate-spin text-gold mr-2" />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function QueryError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="text-center py-8">
      <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-red-400" />
      <p className="text-xs text-red-400 mb-2">{message}</p>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry} className="h-7 text-xs">
          <RefreshCw className="w-3 h-3 mr-1" /> Retry
        </Button>
      )}
    </div>
  );
}

// ============================================================
// 1. COMMAND CENTER
// ============================================================
export function MarketplaceCommandCenter() {
  const qc = useQueryClient();
  const { data: leadData, isLoading: ll, error: le, refetch: rl } = useQuery({
    queryKey: ["mp-leads"],
    queryFn: () => jfetch<any>(`/api/sgtx/marketplace/leads?partnerGtid=${DEFAULT_PARTNER_GTID}`),
  });
  const { data: rev, isLoading: lr, error: re, refetch: rr } = useQuery({
    queryKey: ["mp-revenue"],
    queryFn: () => jfetch<any>(`/api/sgtx/marketplace/revenue?partnerGtid=${DEFAULT_PARTNER_GTID}`),
  });
  const { data: wh, isLoading: lw, error: we, refetch: rw } = useQuery({
    queryKey: ["mp-webhooks"],
    queryFn: () => jfetch<any>(`/api/sgtx/marketplace/webhooks?partnerGtid=${DEFAULT_PARTNER_GTID}`),
  });

  const isLoading = ll || lr || lw;
  const refetchAll = () => { rl(); rr(); rw(); toast.success("Refreshed"); };

  if (isLoading) return <QueryLoading label="Loading partner metrics…" />;
  const err = (le as Error)?.message || (re as Error)?.message || (we as Error)?.message;
  if (err) return <QueryError message={err} onRetry={refetchAll} />;

  const summary = leadData?.summary || { total: 0, active: 0, disputed: 0, expired: 0 };
  const revSummary = rev?.summary || { totalRevenue: 0, conversionRate: 0, avgTradeValue: 0 };
  const whSummary = wh?.summary || { total: 0, delivered: 0, failed: 0, deliveryRate: 0 };
  const partner = rev?.partner || {};

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Marketplace Partner · Command Center"
        subtitle="Part 12C.12 — Lead attribution dashboard · webhook delivery · revenue share"
        action={
          <Button size="sm" variant="outline" onClick={refetchAll} className="h-7 text-xs">
            <RefreshCw className="w-3 h-3 mr-1" /> Refresh
          </Button>
        }
      />

      {/* Hero banner */}
      <Card className="p-5 border-[#0891b2]/30 bg-[#0891b2]/5 relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-[#0891b2]/20 blur-3xl" />
        <div className="relative flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center border border-[#0891b2]/40 bg-[#0891b2]/10 flex-shrink-0">
            <Plug className="w-6 h-6 text-[#0891b2]" />
          </div>
          <div className="flex-1">
            <p className="text-[0.6rem] tracking-widest text-[#0891b2] uppercase font-semibold">Marketplace Integration</p>
            <h2 className="font-display text-xl font-bold text-foreground">{partner.partnerName || "Marketplace Partner"}</h2>
            <p className="text-xs text-muted-foreground mt-1 max-w-3xl leading-relaxed">
              You are operating as an external marketplace platform integrating via SGTX signed API.
              All lead attributions are revenue-share governed, webhook-signed (Ed25519), and Loom-anchored.
            </p>
            <div className="flex flex-wrap gap-3 mt-3 text-[0.65rem] text-muted-foreground">
              <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-[#0891b2]" /> Revenue share {partner.revenueSharePct ?? 10}%</span>
              <span className="flex items-center gap-1"><Lock className="w-3 h-3 text-[#0891b2]" /> Ed25519-signed webhooks</span>
              <span className="flex items-center gap-1"><KeyRound className="w-3 h-3 text-[#0891b2]" /> API key: live</span>
              <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-[#0891b2]" /> Agreement signed {fmtDate(partner.agreementSignedAt)}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatTile label="Total Leads" value={summary.total} sub={`${summary.active} active`} icon={Handshake} accent="#0891b2" />
        <StatTile label="Revenue Share" value={fmtUsd(revSummary.totalRevenue)} sub={`avg ${fmtUsd(revSummary.avgTradeValue)}/trade`} icon={Banknote} accent="#16a34a" />
        <StatTile label="Conversion Rate" value={`${revSummary.conversionRate}%`} sub="intents → trades" icon={TrendingUp} accent="#7c3aed" />
        <StatTile label="Webhook Delivery" value={`${whSummary.deliveryRate}%`} sub={`${whSummary.delivered}/${whSummary.total} delivered`} icon={Webhook} accent="#ea580c" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent leads */}
        <SectionCard title="Recent Lead Attributions" icon={Handshake} accent="#0891b2" action={<Button size="sm" variant="ghost" className="h-7 text-xs">View all</Button>}>
          {(leadData?.leads || []).length === 0 ? <EmptyHint>No leads attributed yet</EmptyHint> : (
            <div className="space-y-2 max-h-72 overflow-y-auto scroll-gold pr-1">
              {(leadData?.leads || []).slice(0, 6).map((l: any) => (
                <div key={l.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground truncate font-mono">{l.buyerGtid.slice(0, 18)}… → {l.sellerGtid.slice(0, 18)}…</p>
                    <p className="text-[0.6rem] text-muted-foreground">{timeAgo(l.createdAt)} · {l.revenueSharePct}% share</p>
                  </div>
                  <StatusPill status={l.status} />
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Top corridors */}
        <SectionCard title="Top Corridors" icon={Globe2} accent="#7c3aed">
          {(rev?.topCorridors || []).length === 0 ? <EmptyHint>No corridor data yet</EmptyHint> : (
            <div className="space-y-2">
              {(rev?.topCorridors || []).map((c: any, i: number) => (
                <div key={c.pair} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded flex items-center justify-center text-[0.6rem] font-bold bg-gold/15 text-gold">{i + 1}</span>
                    <span className="text-xs font-mono text-foreground">{c.pair}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-foreground">{fmtUsd(c.revenue)}</p>
                    <p className="text-[0.6rem] text-muted-foreground">{c.count} trades</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Webhook recent */}
        <SectionCard title="Recent Webhook Deliveries" icon={Webhook} accent="#ea580c">
          {(wh?.logs || []).length === 0 ? <EmptyHint>No webhook deliveries yet</EmptyHint> : (
            <div className="space-y-2 max-h-72 overflow-y-auto scroll-gold pr-1">
              {(wh?.logs || []).slice(0, 6).map((w: any) => (
                <div key={w.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-foreground truncate">{w.eventType}</p>
                    <p className="text-[0.6rem] text-muted-foreground">{timeAgo(w.createdAt)}{w.retryCount > 0 ? ` · ${w.retryCount} retries` : ""}</p>
                  </div>
                  {w.deliveredAt
                    ? <span className="text-[0.65rem] font-semibold text-emerald-500">{w.responseStatus || "OK"}</span>
                    : <span className="text-[0.65rem] font-semibold text-red-400">{w.responseStatus ? `HTTP ${w.responseStatus}` : "FAILED"}</span>}
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* AI summary */}
        <SectionCard title="AI Performance Summary" icon={Sparkles} accent="#16a34a">
          <div className="p-3 rounded-lg bg-gold/5 border border-gold/20">
            <p className="text-[0.6rem] tracking-widest text-gold uppercase font-semibold mb-1">A1 Advisory · Groq/ZAI</p>
            <p className="text-xs text-foreground/90 leading-relaxed">
              Your conversion rate is <span className="font-semibold">{revSummary.conversionRate}%</span> across {summary.total} attributed leads.
              Total revenue share earned: <span className="font-semibold">{fmtUsd(revSummary.totalRevenue)}</span>.
              {summary.disputed > 0 && ` ${summary.disputed} attribution${summary.disputed === 1 ? "" : "s"} currently under dispute — review and submit evidence.`}
              {" "}Webhook delivery is at {whSummary.deliveryRate}%. {whSummary.deliveryRate < 95 && "Consider investigating failed deliveries."}
            </p>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

// ============================================================
// 2. LEADS MANAGEMENT
// ============================================================
export function MarketplaceLeadsScreen() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ buyerGtid: "SGTX-DE-TRD-001234-5B6C", sellerGtid: "SGTX-EG-TRD-002139-7F3A", revenueSharePct: "10" });
  const [submitting, setSubmitting] = useState(false);
  const [viewLead, setViewLead] = useState<any | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["mp-leads"],
    queryFn: () => jfetch<any>(`/api/sgtx/marketplace/leads?partnerGtid=${DEFAULT_PARTNER_GTID}`),
  });

  if (isLoading) return <QueryLoading label="Loading leads…" />;
  if (error) return <QueryError message={(error as Error)?.message} onRetry={() => refetch()} />;

  const allLeads: any[] = data?.leads || [];
  const filtered = statusFilter === "ALL" ? allLeads : allLeads.filter((l) => l.status === statusFilter);

  const submit = async () => {
    if (!form.buyerGtid.trim() || !form.sellerGtid.trim()) {
      toast.error("Buyer & seller GTID required");
      return;
    }
    setSubmitting(true);
    try {
      await jfetch("/api/sgtx/marketplace/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerGtid: DEFAULT_PARTNER_GTID,
          buyerGtid: form.buyerGtid,
          sellerGtid: form.sellerGtid,
          revenueSharePct: Number(form.revenueSharePct) || 10,
        }),
      });
      toast.success("Lead attribution created", { description: "Webhook fired · buyer/seller notified" });
      setForm({ buyerGtid: "SGTX-DE-TRD-001234-5B6C", sellerGtid: "SGTX-EG-TRD-002139-7F3A", revenueSharePct: "10" });
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ["mp-leads"] });
    } catch (e: any) {
      toast.error("Failed to create lead", { description: e.message });
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Leads Management"
        subtitle="Part 12C.12.3 — Intent inbox · lead attribution records · dispute workflow"
        action={
          <Button size="sm" className="bg-gold-gradient text-sovereign h-7 text-xs" onClick={() => setShowForm((v) => !v)}>
            <Handshake className="w-3 h-3 mr-1" /> New Attribution
          </Button>
        }
      />

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Filter:</span>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="DISPUTED">Disputed</SelectItem>
            <SelectItem value="EXPIRED">Expired</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={() => refetch()} className="h-8 text-xs">
          <RefreshCw className="w-3 h-3 mr-1" /> Refresh
        </Button>
      </div>

      {showForm && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
          <Card className="p-4 border-gold/30 bg-gold/5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Handshake className="w-4 h-4 text-gold" /> Create Lead Attribution</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Buyer GTID</Label>
                <Input value={form.buyerGtid} onChange={(e) => setForm({ ...form, buyerGtid: e.target.value })} className="font-mono text-xs" />
              </div>
              <div>
                <Label className="text-xs">Seller GTID</Label>
                <Input value={form.sellerGtid} onChange={(e) => setForm({ ...form, sellerGtid: e.target.value })} className="font-mono text-xs" />
              </div>
              <div>
                <Label className="text-xs">Revenue share %</Label>
                <Input type="number" min="0" max="100" value={form.revenueSharePct} onChange={(e) => setForm({ ...form, revenueSharePct: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" className="bg-gold-gradient text-sovereign h-8 text-xs" onClick={submit} disabled={submitting}>
                {submitting ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Creating…</> : <><Send className="w-3 h-3 mr-1" /> Create Attribution</>}
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </Card>
        </motion.div>
      )}

      {filtered.length === 0 ? (
        <Card className="p-6">
          <EmptyHint>No lead attributions match the filter. Create a new attribution to begin.</EmptyHint>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left p-3 font-medium">Buyer → Seller</th>
                  <th className="text-left p-3 font-medium">Revenue Share</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Created</th>
                  <th className="text-left p-3 font-medium">Expires</th>
                  <th className="text-right p-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filtered.map((l) => (
                  <tr key={l.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      <p className="font-mono text-foreground">{l.buyerGtid}</p>
                      <p className="font-mono text-muted-foreground text-[0.65rem]">{l.sellerGtid}</p>
                    </td>
                    <td className="p-3"><span className="font-semibold text-gold">{l.revenueSharePct}%</span></td>
                    <td className="p-3"><StatusPill status={l.status} /></td>
                    <td className="p-3 text-muted-foreground">{fmtDate(l.createdAt)}</td>
                    <td className="p-3 text-muted-foreground">{l.expiresAt ? fmtDate(l.expiresAt) : "—"}</td>
                    <td className="p-3 text-right">
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setViewLead(l)}>
                        <Eye className="w-3 h-3 mr-1" /> View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Lead detail modal */}
      {viewLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setViewLead(null)}>
          <Card className="p-5 max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2"><Handshake className="w-4 h-4 text-gold" /> Lead Attribution Detail</h3>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setViewLead(null)}>✕</Button>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Lead ID</span><span className="font-mono">{viewLead.id}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Partner GTID</span><span className="font-mono">{viewLead.partnerGtid}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Buyer</span><span className="font-mono">{viewLead.buyerGtid}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Seller</span><span className="font-mono">{viewLead.sellerGtid}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Revenue Share</span><span className="text-gold font-semibold">{viewLead.revenueSharePct}%</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span><StatusPill status={viewLead.status} /></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span>{fmtDateTime(viewLead.createdAt)}</span></div>
              {viewLead.disputedAt && <div className="flex justify-between"><span className="text-muted-foreground">Disputed At</span><span>{fmtDateTime(viewLead.disputedAt)}</span></div>}
              {viewLead.expiresAt && <div className="flex justify-between"><span className="text-muted-foreground">Expires</span><span>{fmtDate(viewLead.expiresAt)}</span></div>}
            </div>
            {viewLead.status === "ACTIVE" && (
              <div className="flex gap-2 mt-4">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { toast.info("Dispute form would open — submits to multisig."); }}>
                  <AlertOctagon className="w-3 h-3 mr-1" /> Dispute Attribution
                </Button>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 3. WEBHOOKS MANAGEMENT
// ============================================================
export function MarketplaceWebhooksScreen() {
  const qc = useQueryClient();
  const [testing, setTesting] = useState(false);
  const [testUrl, setTestUrl] = useState("");
  const [testResult, setTestResult] = useState<any | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["mp-webhooks"],
    queryFn: () => jfetch<any>(`/api/sgtx/marketplace/webhooks?partnerGtid=${DEFAULT_PARTNER_GTID}`),
  });

  if (isLoading) return <QueryLoading label="Loading webhook logs…" />;
  if (error) return <QueryError message={(error as Error)?.message} onRetry={() => refetch()} />;

  const partner = data?.partner;
  const logs: any[] = data?.logs || [];
  const summary = data?.summary || { total: 0, delivered: 0, failed: 0, retried: 0, deliveryRate: 0 };

  const sendTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await jfetch<any>("/api/sgtx/marketplace/webhooks/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerGtid: DEFAULT_PARTNER_GTID,
          webhookUrl: testUrl.trim() || undefined,
        }),
      });
      setTestResult(r);
      if (r.delivered) {
        toast.success("Test webhook delivered", { description: `HTTP ${r.responseStatus} · ${r.latencyMs}ms` });
      } else {
        toast.error("Test webhook failed", { description: r.error || `HTTP ${r.responseStatus}` });
      }
      qc.invalidateQueries({ queryKey: ["mp-webhooks"] });
    } catch (e: any) {
      toast.error("Failed to send test", { description: e.message });
    } finally { setTesting(false); }
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Webhook Management"
        subtitle="Part 12C.12.4 — Endpoints · delivery logs · retry · Ed25519 signature"
        action={<Button size="sm" variant="outline" onClick={() => refetch()} className="h-7 text-xs"><RefreshCw className="w-3 h-3 mr-1" /> Refresh</Button>}
      />

      {/* Endpoint card */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Webhook className="w-4 h-4 text-[#0891b2]" /> Webhook Endpoint</h3>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Endpoint URL</span>
            <span className="font-mono text-foreground">{partner?.webhookUrl || "Not configured"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status</span>
            <StatusPill status={partner?.status || "ACTIVE"} />
          </div>
          <div className="flex items-center gap-1.5 pt-2 text-[0.65rem] text-muted-foreground">
            <Lock className="w-3 h-3 text-gold" /> Signed with Ed25519 · partner's public key used for verification
          </div>
        </div>
      </Card>

      {/* Test webhook */}
      <Card className="p-4 border-gold/30 bg-gold/5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><PlayCircle className="w-4 h-4 text-gold" /> Send Test Webhook</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div className="sm:col-span-2">
            <Label className="text-xs">Override URL (optional — defaults to configured endpoint)</Label>
            <Input value={testUrl} onChange={(e) => setTestUrl(e.target.value)} placeholder="https://myapp.com/sgtx-test" className="font-mono text-xs" />
          </div>
          <Button size="sm" className="bg-gold-gradient text-sovereign h-9" onClick={sendTest} disabled={testing}>
            {testing ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Sending…</> : <><Send className="w-3 h-3 mr-1" /> Send test.ping</>}
          </Button>
        </div>
        {testResult && (
          <div className="mt-3 p-3 rounded-lg bg-background/60 border border-border">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[0.65rem] tracking-widest text-muted-foreground uppercase font-semibold">Test Result</p>
              {testResult.delivered
                ? <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-[0.6rem]">DELIVERED</Badge>
                : <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-[0.6rem]">FAILED</Badge>}
            </div>
            <p className="text-xs font-mono text-foreground">HTTP {testResult.responseStatus || "—"} · {testResult.latencyMs}ms</p>
            {testResult.error && <p className="text-[0.65rem] text-red-400 mt-1">Error: {testResult.error}</p>}
            <p className="text-[0.65rem] text-muted-foreground mt-1 font-mono truncate">{testResult.webhookUrl}</p>
          </div>
        )}
      </Card>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Total deliveries" value={summary.total} icon={Activity} accent="#0891b2" />
        <StatTile label="Delivered" value={summary.delivered} icon={CheckCircle2} accent="#16a34a" />
        <StatTile label="Failed" value={summary.failed} icon={AlertTriangle} accent="#dc2626" />
        <StatTile label="Delivery rate" value={`${summary.deliveryRate}%`} icon={Zap} accent="#7c3aed" />
      </div>

      {/* Delivery log table */}
      <Card className="p-0 overflow-hidden">
        <div className="p-3 border-b border-border/40">
          <h3 className="text-sm font-semibold">Delivery Logs (last 100)</h3>
        </div>
        {logs.length === 0 ? (
          <EmptyHint>No webhook deliveries logged yet</EmptyHint>
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto scroll-gold">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground sticky top-0">
                <tr>
                  <th className="text-left p-3 font-medium">Event</th>
                  <th className="text-left p-3 font-medium">HTTP</th>
                  <th className="text-left p-3 font-medium">Retries</th>
                  <th className="text-left p-3 font-medium">Delivered At</th>
                  <th className="text-left p-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {logs.map((w) => (
                  <tr key={w.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-mono">{w.eventType}</td>
                    <td className="p-3">
                      {w.deliveredAt
                        ? <span className="font-semibold text-emerald-500">{w.responseStatus || "OK"}</span>
                        : <span className="font-semibold text-red-400">{w.responseStatus ? `HTTP ${w.responseStatus}` : "FAILED"}</span>}
                    </td>
                    <td className="p-3 text-muted-foreground">{w.retryCount}</td>
                    <td className="p-3 text-muted-foreground">{w.deliveredAt ? fmtDateTime(w.deliveredAt) : "—"}</td>
                    <td className="p-3 text-muted-foreground">{timeAgo(w.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ============================================================
// 4. REVENUE ATTRIBUTION
// ============================================================
export function MarketplaceRevenueScreen() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["mp-revenue"],
    queryFn: () => jfetch<any>(`/api/sgtx/marketplace/revenue?partnerGtid=${DEFAULT_PARTNER_GTID}`),
  });

  if (isLoading) return <QueryLoading label="Loading revenue data…" />;
  if (error) return <QueryError message={(error as Error)?.message} onRetry={() => refetch()} />;

  const summary = data?.summary || {};
  const monthly: any[] = data?.monthly || [];
  const topCorridors: any[] = data?.topCorridors || [];
  const payouts: any[] = data?.payouts || [];
  const partner = data?.partner || {};

  const maxRevenue = Math.max(...monthly.map((m) => m.revenue), 1);

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Revenue Attribution"
        subtitle="Part 12C.12.5 — Revenue share summary · monthly breakdown · payout history"
        action={<Button size="sm" variant="outline" onClick={() => refetch()} className="h-7 text-xs"><RefreshCw className="w-3 h-3 mr-1" /> Refresh</Button>}
      />

      {/* Summary tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatTile label="Total Revenue" value={fmtUsd(summary.totalRevenue)} sub={`${partner.revenueSharePct ?? 10}% share`} icon={Banknote} accent="#16a34a" />
        <StatTile label="Active Leads" value={summary.activeLeads ?? 0} sub={`${summary.totalLeads ?? 0} total`} icon={Handshake} accent="#0891b2" />
        <StatTile label="Conversion Rate" value={`${summary.conversionRate ?? 0}%`} sub="intents → trades" icon={TrendingUp} accent="#7c3aed" />
        <StatTile label="Disputed" value={summary.disputedLeads ?? 0} sub="awaiting resolution" icon={AlertOctagon} accent="#dc2626" />
      </div>

      {/* Monthly breakdown */}
      <SectionCard title="Monthly Breakdown (last 6 months)" icon={Activity} accent="#16a34a">
        <div className="space-y-2">
          {monthly.map((m) => (
            <div key={m.month} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-14">{m.month}</span>
              <div className="flex-1 h-6 bg-muted/30 rounded-lg overflow-hidden relative">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500/70 to-emerald-400/90 flex items-center justify-end pr-2"
                  style={{ width: `${(m.revenue / maxRevenue) * 100}%`, minWidth: m.revenue > 0 ? "60px" : "0" }}
                >
                  {m.revenue > 0 && <span className="text-[0.65rem] font-semibold text-white">{fmtUsd(m.revenue)}</span>}
                </div>
              </div>
              <span className="text-[0.65rem] text-muted-foreground w-16 text-right">{m.leads} leads</span>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top corridors */}
        <SectionCard title="Top Performing Corridors" icon={Globe2} accent="#7c3aed">
          {topCorridors.length === 0 ? <EmptyHint>No corridor data yet</EmptyHint> : (
            <div className="space-y-2">
              {topCorridors.map((c, i) => (
                <div key={c.pair} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded flex items-center justify-center text-[0.6rem] font-bold bg-gold/15 text-gold">{i + 1}</span>
                    <span className="text-xs font-mono text-foreground">{c.pair}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-foreground">{fmtUsd(c.revenue)}</p>
                    <p className="text-[0.6rem] text-muted-foreground">{c.count} trades</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Payout history */}
        <SectionCard title="Payout History" icon={Banknote} accent="#16a34a">
          {payouts.length === 0 ? <EmptyHint>No payouts yet</EmptyHint> : (
            <div className="space-y-2">
              {payouts.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                  <div>
                    <p className="text-xs font-mono text-foreground">{p.id}</p>
                    <p className="text-[0.6rem] text-muted-foreground">{p.month}{p.paidAt ? ` · paid ${fmtDate(p.paidAt)}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">{fmtUsd(p.amount)}</span>
                    <StatusPill status={p.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

// ============================================================
// 5. API KEY MANAGEMENT
// ============================================================
export function MarketplaceApiKeysScreen() {
  const qc = useQueryClient();
  const [regenerating, setRegenerating] = useState(false);
  const [revealKey, setRevealKey] = useState(false);
  const [regenResult, setRegenResult] = useState<any | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["mp-api-keys"],
    queryFn: () => jfetch<any>(`/api/sgtx/marketplace/api-keys?partnerGtid=${DEFAULT_PARTNER_GTID}`),
  });

  if (isLoading) return <QueryLoading label="Loading API keys…" />;
  if (error) return <QueryError message={(error as Error)?.message} onRetry={() => refetch()} />;

  const partner = data?.partner || {};
  const apiKey = data?.apiKey || {};
  const rateLimits: any[] = data?.rateLimits || [];
  const ipWhitelist: string[] = data?.ipWhitelist || [];

  const regenerate = async () => {
    if (!confirm("Regenerate API key? The old key will be invalidated immediately. Update your integration to use the new key.")) return;
    setRegenerating(true);
    setRegenResult(null);
    try {
      const r = await jfetch<any>("/api/sgtx/marketplace/api-keys/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerGtid: DEFAULT_PARTNER_GTID }),
      });
      setRegenResult(r);
      toast.success("API key regenerated", { description: "Old key invalidated immediately" });
      qc.invalidateQueries({ queryKey: ["mp-api-keys"] });
    } catch (e: any) {
      toast.error("Failed to regenerate", { description: e.message });
    } finally { setRegenerating(false); }
  };

  const copyKey = () => {
    if (apiKey.masked) {
      navigator.clipboard?.writeText(apiKey.masked).then(() => toast.success("Copied masked key to clipboard"));
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        title="API Key Management"
        subtitle="Part 12C.12.6 — Keys · usage analytics · rate limits · IP whitelisting"
        action={<Button size="sm" variant="outline" onClick={() => refetch()} className="h-7 text-xs"><RefreshCw className="w-3 h-3 mr-1" /> Refresh</Button>}
      />

      {/* API key card */}
      <Card className="p-4 border-gold/30 bg-gold/5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2"><KeyRound className="w-4 h-4 text-gold" /> Live API Key</h3>
            <p className="text-[0.65rem] text-muted-foreground mt-0.5">{partner.partnerName} · {partner.partnerGtid}</p>
          </div>
          <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-[0.6rem]">ACTIVE</Badge>
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 px-3 py-2 rounded-lg bg-background/80 border border-border font-mono text-xs text-foreground truncate">
            {revealKey ? `${apiKey.prefix}••••••••` : apiKey.masked}
          </code>
          <Button size="sm" variant="outline" className="h-9" onClick={() => setRevealKey((v) => !v)} title={revealKey ? "Hide" : "Reveal"}>
            <Eye className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="outline" className="h-9" onClick={copyKey} title="Copy">
            <Copy className="w-3.5 h-3.5" />
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
          <div><span className="text-muted-foreground">Created: </span><span className="text-foreground">{fmtDate(apiKey.createdAt)}</span></div>
          <div><span className="text-muted-foreground">Last used: </span><span className="text-foreground">{timeAgo(apiKey.lastUsedAt)}</span></div>
        </div>
        <div className="flex gap-2 mt-3">
          <Button size="sm" className="bg-gold-gradient text-sovereign h-8 text-xs" onClick={regenerate} disabled={regenerating}>
            {regenerating ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Regenerating…</> : <><RefreshCw className="w-3 h-3 mr-1" /> Regenerate Key</>}
          </Button>
        </div>
        {regenResult && (
          <div className="mt-3 p-3 rounded-lg bg-background/60 border border-border">
            <p className="text-[0.65rem] tracking-widest text-gold uppercase font-semibold mb-1">New Key Generated</p>
            <code className="text-xs font-mono text-foreground">{regenResult.masked}</code>
            <p className="text-[0.65rem] text-muted-foreground mt-1">Previous key ending …{regenResult.previousKeyLast4} invalidated.</p>
          </div>
        )}
        <p className="text-[0.6rem] text-muted-foreground/80 mt-3 leading-relaxed">
          🔐 In production, the old key would have a 24-hour grace period before invalidation.
          Ed25519-signed requests only. Contact Platform Governance Authority to request rate limit increases.
        </p>
      </Card>

      {/* Rate limits */}
      <SectionCard title="Rate Limits (read-only)" icon={Zap} accent="#7c3aed">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="text-left p-2 font-medium">Endpoint</th>
                <th className="text-left p-2 font-medium">Limit</th>
                <th className="text-left p-2 font-medium">Window</th>
                <th className="text-left p-2 font-medium">Current Usage</th>
                <th className="text-left p-2 font-medium w-32">Utilisation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {rateLimits.map((r) => {
                const pct = Math.round((r.currentUsage / r.limit) * 100);
                const color = pct >= 90 ? "#dc2626" : pct >= 70 ? "#f59e0b" : "#16a34a";
                return (
                  <tr key={r.endpoint}>
                    <td className="p-2 font-mono">{r.endpoint}</td>
                    <td className="p-2">{r.limit}</td>
                    <td className="p-2 text-muted-foreground">{r.windowSec}s</td>
                    <td className="p-2">{r.currentUsage}/{r.limit}</td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-muted/40 rounded-full overflow-hidden">
                          <div className="h-full" style={{ width: `${pct}%`, background: color }} />
                        </div>
                        <span className="text-[0.65rem] font-medium" style={{ color }}>{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* IP Whitelist */}
      <SectionCard title="IP Whitelist" icon={ShieldCheck} accent="#0891b2">
        {ipWhitelist.length === 0 ? <EmptyHint>No IPs whitelisted</EmptyHint> : (
          <div className="space-y-2">
            {ipWhitelist.map((ip) => (
              <div key={ip} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                <code className="text-xs font-mono">{ip}</code>
                <Badge variant="outline" className="text-[0.6rem]">ALLOWED</Badge>
              </div>
            ))}
          </div>
        )}
        <p className="text-[0.6rem] text-muted-foreground/80 mt-3">
          Requests from non-whitelisted IPs are rejected with HTTP 403. Contact Platform Governance Authority to modify.
        </p>
      </SectionCard>
    </div>
  );
}

// ============================================================
// 6. SANDBOX
// ============================================================
export function MarketplaceSandboxScreen() {
  const [intentText, setIntentText] = useState("20,000 kg oranges, CFR Alexandria, Egypt");
  const [scenario, setScenario] = useState("default");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [sandboxLeads, setSandboxLeads] = useState<any[]>([]);

  const scenarios: Record<string, string> = {
    default: "20,000 kg oranges, CFR Alexandria, Egypt",
    sanctions: "5,000 kg apples to Iran",
    low_viability: "lemons, Vietnam, need QC",
    conditional: "bananas, quantity unknown, DDP",
  };

  const analyze = async () => {
    setAnalyzing(true);
    setResult(null);
    try {
      // Simulate API latency for intent analysis (Part 12C.12.7 — synthetic data)
      await new Promise((r) => setTimeout(r, 600));
      const viability = Math.floor(Math.random() * 40) + 60;
      const status = viability >= 80 ? "ACCEPTED" : viability >= 50 ? "CONDITIONAL" : "REJECTED";
      setResult({
        intentId: `int_${Math.random().toString(36).slice(2, 10)}`,
        parsed: {
          commodity: intentText.match(/(\d[\d,]*)?\s*kg\s+(\w+)/i)?.[2] || "unknown",
          quantity: intentText.match(/(\d[\d,]*)\s*kg/i)?.[1]?.replace(/,/g, "") || null,
          destination: intentText.match(/(CFR|CIF|FOB|DAP|DDP)\s+(\w+)/i)?.[2] || null,
          incoterm: intentText.match(/(CFR|CIF|FOB|DAP|DDP)/i)?.[1] || null,
        },
        viabilityScore: viability,
        status,
        recommendation: status === "ACCEPTED"
          ? "Lead is viable. Proceed to redirect buyer to SGTX for full trade creation."
          : status === "CONDITIONAL"
          ? "Lead has low confidence. Collect more information (e.g. quantity) before retrying."
          : "Lead is not viable (sanctions or jurisdiction block). Notify partner.",
      });
      toast.success("Intent analysed (synthetic)");
    } catch (e: any) {
      toast.error("Analysis failed", { description: e.message });
    } finally { setAnalyzing(false); }
  };

  const simulateTrade = () => {
    if (!result) return;
    const newLead = {
      id: `sand_${Math.random().toString(36).slice(2, 10)}`,
      intentId: result.intentId,
      commodity: result.parsed.commodity,
      status: "ATTRIBUTED",
      revenueShare: 10,
      createdAt: new Date().toISOString(),
    };
    setSandboxLeads((s) => [newLead, ...s]);
    toast.success("Simulated trade attributed", { description: "Test webhook would fire to sandbox endpoint" });
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Sandbox Environment"
        subtitle="Part 12C.12.7 — Test integration with synthetic data · no real trades affected"
      />

      <Card className="p-4 border-[#0891b2]/30 bg-[#0891b2]/5">
        <div className="flex items-start gap-3 mb-3">
          <FlaskConical className="w-5 h-5 text-[#0891b2] flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold">Sandbox Mode</h3>
            <p className="text-[0.65rem] text-muted-foreground mt-0.5">
              Synthetic data only · auto-purged every 24h · separate from production · Groq-simulated market conditions
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
          <a href="#" className="text-xs flex items-center gap-1.5 p-2 rounded-lg bg-background/60 hover:bg-background transition-colors">
            <ExternalLink className="w-3 h-3 text-[#0891b2]" /> /v1/partner/intent/analyze
          </a>
          <a href="#" className="text-xs flex items-center gap-1.5 p-2 rounded-lg bg-background/60 hover:bg-background transition-colors">
            <ExternalLink className="w-3 h-3 text-[#0891b2]" /> /v1/partner/trade/initiate
          </a>
          <a href="#" className="text-xs flex items-center gap-1.5 p-2 rounded-lg bg-background/60 hover:bg-background transition-colors">
            <ExternalLink className="w-3 h-3 text-[#0891b2]" /> /v1/partner/webhook/register
          </a>
        </div>
      </Card>

      {/* Test Intent form */}
      <SectionCard title="Test Intent Analysis" icon={Sparkles} accent="#7c3aed">
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Predefined scenario</Label>
            <Select value={scenario} onValueChange={(v) => { setScenario(v); setIntentText(scenarios[v]); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default (oranges to Egypt)</SelectItem>
                <SelectItem value="sanctions">Sanctions block (Iran)</SelectItem>
                <SelectItem value="low_viability">Low viability score</SelectItem>
                <SelectItem value="conditional">Conditional (missing fields)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Raw intent text</Label>
            <Textarea value={intentText} onChange={(e) => setIntentText(e.target.value)} rows={2} className="text-xs" />
          </div>
          <Button size="sm" className="bg-gold-gradient text-sovereign h-8 text-xs" onClick={analyze} disabled={analyzing}>
            {analyzing ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Analysing…</> : <><Sparkles className="w-3 h-3 mr-1" /> Analyse Intent</>}
          </Button>
        </div>

        {result && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 p-3 rounded-lg bg-background/60 border border-border">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[0.65rem] tracking-widest text-muted-foreground uppercase font-semibold">Intent Response</p>
              <StatusPill status={result.status} />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-muted-foreground">Intent ID: </span><span className="font-mono">{result.intentId}</span></div>
              <div><span className="text-muted-foreground">Viability: </span><span className="font-semibold text-gold">{result.viabilityScore}/100</span></div>
              <div><span className="text-muted-foreground">Commodity: </span><span>{result.parsed.commodity}</span></div>
              <div><span className="text-muted-foreground">Quantity: </span><span>{result.parsed.quantity || "missing"}</span></div>
              <div><span className="text-muted-foreground">Incoterm: </span><span>{result.parsed.incoterm || "—"}</span></div>
              <div><span className="text-muted-foreground">Destination: </span><span>{result.parsed.destination || "—"}</span></div>
            </div>
            <p className="text-[0.65rem] text-foreground/80 mt-2 p-2 rounded bg-gold/5 border border-gold/20">{result.recommendation}</p>
            <Button size="sm" variant="outline" className="h-7 text-xs mt-2" onClick={simulateTrade}>
              <PlayCircle className="w-3 h-3 mr-1" /> Simulate Trade
            </Button>
          </motion.div>
        )}
      </SectionCard>

      {/* Sandbox leads */}
      <SectionCard title="Sandbox Leads (session-only)" icon={FlaskConical} accent="#0891b2">
        {sandboxLeads.length === 0 ? <EmptyHint>No simulated leads yet</EmptyHint> : (
          <div className="space-y-2">
            {sandboxLeads.map((l) => (
              <div key={l.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                <div>
                  <p className="text-xs font-mono text-foreground">{l.id}</p>
                  <p className="text-[0.6rem] text-muted-foreground">{l.commodity} · {l.revenueShare}% share</p>
                </div>
                <StatusPill status={l.status} />
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ============================================================
// 7. AGREEMENT (REVENUE SHARE)
// ============================================================
export function MarketplaceAgreementScreen() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["mp-revenue"],
    queryFn: () => jfetch<any>(`/api/sgtx/marketplace/revenue?partnerGtid=${DEFAULT_PARTNER_GTID}`),
  });
  const [showAmend, setShowAmend] = useState(false);
  const [amendForm, setAmendForm] = useState({ newSplit: "12", justification: "" });
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) return <QueryLoading label="Loading agreement…" />;
  if (error) return <QueryError message={(error as Error)?.message} onRetry={() => refetch()} />;

  const partner = data?.partner || {};

  const submitAmend = async () => {
    if (!amendForm.justification.trim() || amendForm.justification.length < 10) {
      toast.error("Justification must be at least 10 characters");
      return;
    }
    setSubmitting(true);
    try {
      // Submit amendment request — would go to multisig (Part 12C.12.8)
      await new Promise((r) => setTimeout(r, 600));
      toast.success("Amendment request submitted", {
        description: `Proposed split: ${amendForm.newSplit}% — pending multisig approval`,
      });
      setShowAmend(false);
      setAmendForm({ newSplit: "12", justification: "" });
    } catch (e: any) {
      toast.error("Failed to submit", { description: e.message });
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Revenue Share Agreement"
        subtitle="Part 12C.12.8 — View current agreement · propose amendments · multisig approval"
        action={<Button size="sm" variant="outline" onClick={() => refetch()} className="h-7 text-xs"><RefreshCw className="w-3 h-3 mr-1" /> Refresh</Button>}
      />

      {/* Agreement card */}
      <Card className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-[0.6rem] tracking-widest text-gold uppercase font-semibold">SGTX Marketplace Partner Agreement</p>
            <h3 className="font-display text-lg font-bold text-foreground mt-1">{partner.partnerName}</h3>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">{partner.partnerGtid}</p>
          </div>
          <FileText className="w-8 h-8 text-gold/40" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-3 rounded-lg bg-muted/30">
            <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">Partner Revenue Share</p>
            <p className="text-2xl font-bold text-gold font-display mt-1">{partner.revenueSharePct ?? 10}%</p>
            <p className="text-[0.6rem] text-muted-foreground mt-1">of SGTX fees on attributed trades</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/30">
            <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">SGTX Revenue Share</p>
            <p className="text-2xl font-bold text-foreground font-display mt-1">{100 - (partner.revenueSharePct ?? 10)}%</p>
            <p className="text-[0.6rem] text-muted-foreground mt-1">platform fee retained</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/30">
            <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">Effective Date</p>
            <p className="text-sm font-semibold text-foreground mt-1">{fmtDate(partner.agreementSignedAt)}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/30">
            <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">Term</p>
            <p className="text-sm font-semibold text-foreground mt-1">2026-01-01 → 2027-01-01</p>
            <p className="text-[0.6rem] text-muted-foreground mt-1">365 days · auto-renew 30d notice</p>
          </div>
        </div>

        <div className="mt-4 p-3 rounded-lg bg-gold/5 border border-gold/20">
          <p className="text-[0.65rem] tracking-widest text-gold uppercase font-semibold mb-1">Agreement Terms</p>
          <ul className="text-xs text-foreground/90 space-y-1 list-disc list-inside">
            <li>Partner receives {partner.revenueSharePct ?? 10}% of all SGTX fees on trades first attributed via partner's lead.</li>
            <li>Attribution window: 90 days from initial lead submission.</li>
            <li>Partner may dispute attributions via the Revenue Attribution tab; multisig resolves.</li>
            <li>Amendment requests require multisig approval and Clause Forge + ZITADEL re-signing.</li>
            <li>Partner receives expiry notifications 90, 60, 30 days before term end.</li>
          </ul>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <Button size="sm" className="bg-gold-gradient text-sovereign h-8 text-xs" onClick={() => setShowAmend((v) => !v)}>
            <FileText className="w-3 h-3 mr-1" /> Propose Amendment
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => toast.info("PDF download would start (Clause Forge)")}>
            <ExternalLink className="w-3 h-3 mr-1" /> Download Signed PDF
          </Button>
        </div>
      </Card>

      {/* Amendment form */}
      {showAmend && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
          <Card className="p-4 border-gold/30 bg-gold/5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><FileText className="w-4 h-4 text-gold" /> Propose Amendment</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Proposed partner split (%)</Label>
                <Input type="number" min="0" max="100" value={amendForm.newSplit} onChange={(e) => setAmendForm({ ...amendForm, newSplit: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Justification (min 10 chars)</Label>
                <Textarea value={amendForm.justification} onChange={(e) => setAmendForm({ ...amendForm, justification: e.target.value })} rows={2} placeholder="e.g. Lead volume increased 30% in Q2, supporting a higher split." />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" className="bg-gold-gradient text-sovereign h-8 text-xs" onClick={submitAmend} disabled={submitting}>
                {submitting ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Submitting…</> : <><Send className="w-3 h-3 mr-1" /> Submit to Multisig</>}
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowAmend(false)}>Cancel</Button>
            </div>
            <p className="text-[0.6rem] text-muted-foreground/80 mt-2">
              AI (Groq) will generate a performance-based analysis for the Platform Governance Authority.
              If approved, a new agreement is generated via Clause Forge + ZITADEL.
            </p>
          </Card>
        </motion.div>
      )}
    </div>
  );
}

// ============================================================
// 8. COMPANY ADMIN
// ============================================================
export function MarketplaceCompanyAdminScreen() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["mp-api-keys"],
    queryFn: () => jfetch<any>(`/api/sgtx/marketplace/api-keys?partnerGtid=${DEFAULT_PARTNER_GTID}`),
  });
  const [settings, setSettings] = useState({
    rateLimitIncreaseReason: "",
    notifyOnDelivery: true,
    notifyOnDispute: true,
    notifyOnExpiry: true,
    webhookUrl: "https://example.com/webhooks/sgtx",
  });
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) return <QueryLoading label="Loading admin settings…" />;
  if (error) return <QueryError message={(error as Error)?.message} onRetry={() => refetch()} />;

  const partner = data?.partner || {};

  const submitRateLimit = async () => {
    if (settings.rateLimitIncreaseReason.trim().length < 10) {
      toast.error("Provide a reason (min 10 chars)");
      return;
    }
    setSubmitting(true);
    try {
      await new Promise((r) => setTimeout(r, 600));
      toast.success("Rate limit increase request submitted", { description: "Pending Platform Governance Authority review" });
      setSettings({ ...settings, rateLimitIncreaseReason: "" });
    } catch (e: any) {
      toast.error("Failed to submit", { description: e.message });
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Company Admin"
        subtitle="Part 12C.12 — Rate limit requests · notifications · IP whitelisting"
        action={<Button size="sm" variant="outline" onClick={() => refetch()} className="h-7 text-xs"><RefreshCw className="w-3 h-3 mr-1" /> Refresh</Button>}
      />

      {/* Company profile */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Users className="w-4 h-4 text-[#0891b2]" /> Partner Profile</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div><span className="text-muted-foreground">Legal name: </span><span className="text-foreground font-medium">{partner.partnerName}</span></div>
          <div><span className="text-muted-foreground">Partner GTID: </span><span className="font-mono text-foreground">{partner.partnerGtid}</span></div>
          <div><span className="text-muted-foreground">Status: </span><StatusPill status="ACTIVE" /></div>
          <div><span className="text-muted-foreground">Webhook URL: </span><span className="font-mono text-foreground">{settings.webhookUrl}</span></div>
        </div>
      </Card>

      {/* Rate limit request */}
      <Card className="p-4 border-gold/30 bg-gold/5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Zap className="w-4 h-4 text-gold" /> Request Rate Limit Increase</h3>
        <p className="text-[0.65rem] text-muted-foreground mb-3">
          Submit a request to the Platform Governance Authority. Requires multisig approval.
        </p>
        <div className="space-y-2">
          <Label className="text-xs">Reason for increase</Label>
          <Textarea
            value={settings.rateLimitIncreaseReason}
            onChange={(e) => setSettings({ ...settings, rateLimitIncreaseReason: e.target.value })}
            rows={3}
            placeholder="e.g. Marketing campaign expected to triple intent volume in Q3."
          />
        </div>
        <Button size="sm" className="bg-gold-gradient text-sovereign h-8 text-xs mt-3" onClick={submitRateLimit} disabled={submitting}>
          {submitting ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Submitting…</> : <><Send className="w-3 h-3 mr-1" /> Submit Request</>}
        </Button>
      </Card>

      {/* Notification settings */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Bell className="w-4 h-4 text-[#0891b2]" /> Notification Settings</h3>
        <div className="space-y-3">
          {[
            { key: "notifyOnDelivery", label: "Webhook delivery failures", desc: "Email when delivery rate drops below 95%" },
            { key: "notifyOnDispute", label: "Attribution disputes", desc: "Email when a partner attribution is disputed" },
            { key: "notifyOnExpiry", label: "Agreement expiry", desc: "90 / 60 / 30 day reminders before term end" },
          ].map((n) => (
            <div key={n.key} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
              <div>
                <p className="text-xs font-medium text-foreground">{n.label}</p>
                <p className="text-[0.65rem] text-muted-foreground">{n.desc}</p>
              </div>
              <Button
                size="sm"
                variant={settings[n.key as keyof typeof settings] ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={() => setSettings({ ...settings, [n.key]: !settings[n.key as keyof typeof settings] })}
              >
                {(settings[n.key as keyof typeof settings] as boolean) ? "ON" : "OFF"}
              </Button>
            </div>
          ))}
        </div>
      </Card>

      {/* Webhook URL config */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Webhook className="w-4 h-4 text-[#0891b2]" /> Webhook URL</h3>
        <div className="space-y-2">
          <Label className="text-xs">Production webhook endpoint</Label>
          <Input
            value={settings.webhookUrl}
            onChange={(e) => setSettings({ ...settings, webhookUrl: e.target.value })}
            className="font-mono text-xs"
          />
        </div>
        <Button size="sm" variant="outline" className="h-8 text-xs mt-3" onClick={() => toast.success("Webhook URL updated")}>
          <CheckCircle2 className="w-3 h-3 mr-1" /> Save
        </Button>
        <p className="text-[0.6rem] text-muted-foreground/80 mt-2">
          Changes require re-signing via Ed25519 key rotation (24h grace period for old key).
        </p>
      </Card>
    </div>
  );
}
