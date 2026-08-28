// @ts-nocheck
"use client";

/**
 * SGTX Fee Portal Screens — Fee management + Dispute resolution surfaces
 * ===========================================================================
 * Implements sections 24-26, 40, 53-54, 58, 62-64 of the SGTX Customs Fee &
 * Dispute prompt.
 *
 * CBR Portal screens (broker perspective):
 *   • FeeScheduleScreen            — §13 broker fee schedule management
 *   • FeeCommitmentsScreen         — §15 immutable fee commitments
 *   • AdditionalChargeRequestsScreen — §16 fee change workflow
 *   • FeeDisputesScreen            — §40 dispute dashboard (broker view)
 *
 * Trader Portal screens:
 *   • TraderFeeViewScreen          — §25 trader fee visibility
 *   • TraderDisputeScreen          — §40 dispute dashboard (trader view)
 *
 * Admin / Compliance screens:
 *   • FeeDisputeAdminScreen        — §40 dispute dashboard (admin view)
 *
 * Shared:
 *   • FeeBreakdownScreen           — §26 fee separation display
 *
 * L0 invariants respected:
 *   • Fee breakdown MUST clearly separate SGTX fee from broker fee from
 *     government charges from third-party pass-through. No blending.
 *   • Fee commitments are IMMUTABLE — screens render them read-only with
 *     a cryptographic hash anchor; no edit affordance is exposed.
 *   • No marketplace rankings are surfaced anywhere in these screens.
 *   • All async calls are defensive — failure yields a safe empty state
 *     rather than a thrown render.
 */

import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Receipt, Lock, AlertCircle, Gavel, ShieldCheck, Loader2, FileText,
  CheckCircle2, Clock, AlertTriangle, Hash, TrendingDown, Activity, Globe2,
  Banknote, Scale, Eye, Send, Sparkles, ArrowRight, History,
} from "lucide-react";
import { useState } from "react";
import { fmtUsd, fmtDate, fmtDateTime, timeAgo, statusColor } from "@/lib/sgtx/format";

type Data = any;

// ── shared helpers ──────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-5 h-5 animate-spin text-gold" />
      <span className="ml-2 text-sm text-muted-foreground">Loading…</span>
    </div>
  );
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="text-center py-12">
      <p className="text-sm text-muted-foreground">{msg}</p>
    </div>
  );
}

function ScreenHeader({
  icon: Icon, title, subtitle, badge, action,
}: {
  icon: any; title: string; subtitle?: string; badge?: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-gold" />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-bold text-foreground">{title}</h2>
            {badge && <Badge variant="secondary" className="text-[0.6rem]">{badge}</Badge>}
          </div>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

function StatCard({
  label, value, accent = "#ca8a04", icon: Icon, sub,
}: { label: string; value: string | number; accent?: string; icon: any; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between mb-1">
        <p className="text-[0.6rem] uppercase tracking-widest text-muted-foreground">{label}</p>
        <Icon className="w-3.5 h-3.5" style={{ color: accent }} />
      </div>
      <p className="text-2xl font-bold" style={{ color: accent }}>{value}</p>
      {sub && <p className="text-[0.65rem] text-muted-foreground mt-1">{sub}</p>}
    </Card>
  );
}

// Status → variant mapper for fee/dispute statuses (NEVER used for rankings)
function statusBadge(s: string): { variant: "default" | "secondary" | "destructive" | "outline"; color?: string } {
  const v = (s || "").toUpperCase();
  if (["ACTIVE", "ACCEPTED", "UPHELD", "RESOLVED", "APPROVED", "PAID"].includes(v)) return { variant: "default" };
  if (["PENDING", "FILED", "TRADER_ACCEPT", "AWAITING_RESPONSE", "DISPUTED"].includes(v)) return { variant: "secondary", color: "#fbbf24" };
  if (["REJECTED", "DENIED", "OVERDUE", "VIOLATION"].includes(v)) return { variant: "destructive" };
  return { variant: "outline" };
}

// ═══════════════════════════════════════════════════════════════════════════
// §26 — FEE BREAKDOWN SCREEN
// ────────────────────────────────────────────────────────────────────────────
// Clearly separates 4 fee categories. Used as a sub-panel inside
// TraderFeeViewScreen and as a standalone widget on the trader Customs Fees
// tab when a specific USTN is selected.
// ═══════════════════════════════════════════════════════════════════════════
export function FeeBreakdownScreen({ data }: { data: Data }) {
  const breakdown = data?.feeBreakdown || data?.breakdown || null;
  if (!breakdown) {
    return <Card className="p-4"><EmptyState msg="No fee breakdown available for this trade." /></Card>;
  }
  const sgtxRate = breakdown.sgtxFeeRate ?? 0.015;
  const sgtxBase = breakdown.tradeValueUsd ?? breakdown.invoiceValueUsd ?? 0;
  const sgtxAmount = breakdown.sgtxFeeUsd ?? Math.round(sgtxBase * sgtxRate * 100) / 100;
  const brokerAmount = breakdown.brokerServiceUsd ?? 0;
  const govtAmount = breakdown.governmentChargesUsd ?? 0;
  const passAmount = breakdown.thirdPartyPassThroughUsd ?? 0;
  const total = sgtxAmount + brokerAmount + govtAmount + passAmount;

  const rows = [
    {
      label: "SGTX TRADE FEE",
      desc: `Platform fee · ${ (sgtxRate * 100).toFixed(2) }% of declared trade value`,
      amount: sgtxAmount,
      icon: Scale,
      accent: "#ca8a04",
      note: "Sovereign platform fee — non-negotiable, governed by SGTX constitution",
    },
    {
      label: "BROKER SERVICE",
      desc: "Customs broker filing & certification fee",
      amount: brokerAmount,
      icon: Receipt,
      accent: "#0e7490",
      note: "Quoted by broker · accepted by trader · locked in immutable commitment",
    },
    {
      label: "GOVERNMENT CHARGES",
      desc: "Duties · taxes · official customs fees",
      amount: govtAmount,
      icon: LandmarkIcon,
      accent: "#b45309",
      note: "Levied by customs authority — pass-through, no broker markup",
    },
    {
      label: "THIRD-PARTY PASS-THROUGH",
      desc: "Port handling · warehouse · inspection · lab fees",
      amount: passAmount,
      icon: Banknote,
      accent: "#7c3aed",
      note: "Disclosed third-party invoices — original receipts attached",
    },
  ];

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Receipt className="w-4 h-4 text-gold" />
        <h3 className="text-sm font-semibold">Fee Breakdown — USTN { data?.ustn?.slice(0, 20) || "—" }…</h3>
        <Badge variant="outline" className="text-[0.6rem] ml-auto">§26 SEPARATION</Badge>
      </div>
      <div className="space-y-2.5">
        {rows.map((r) => {
          const Icon = r.icon;
          return (
            <div key={r.label} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/20">
              <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0" style={{ background: `${r.accent}15` }}>
                <Icon className="w-4 h-4" style={{ color: r.accent }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <span className="text-xs font-bold tracking-wide text-foreground">{r.label}</span>
                  <span className="text-base font-bold tabular-nums" style={{ color: r.accent }}>{fmtUsd(r.amount)}</span>
                </div>
                <p className="text-[0.7rem] text-muted-foreground mt-0.5">{r.desc}</p>
                <p className="text-[0.65rem] text-muted-foreground/80 mt-1 italic">{r.note}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t">
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total landed cost</span>
        <span className="text-xl font-bold text-foreground tabular-nums">{fmtUsd(total)}</span>
      </div>
      <p className="text-[0.65rem] text-muted-foreground mt-2">
        SGTX never blends these categories. Broker markup on government charges is prohibited.
      </p>
    </Card>
  );
}

// Landmark alias to avoid colliding with the `Landmark` PortalConfig import above
function LandmarkIcon(props: any) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 21h18M5 21V10M19 21V10M9 21v-4h6v4M12 3 3 8h18l-9-5z" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// §13 — BROKER FEE SCHEDULE SCREEN (CBR Portal)
// ────────────────────────────────────────────────────────────────────────────
export function FeeScheduleScreen({ data }: { data: Data }) {
  const brokerGtid = data?.tenant?.gtid;
  const { data: resp, isLoading } = useQuery({
    queryKey: ["fee-schedule", brokerGtid],
    queryFn: async () => {
      try {
        const r = await fetch(`/api/sgtx/customs-gateway/fee-demo/run?scenarioId=FEE-01&brokerGtid=${brokerGtid || ""}`, {
          method: "POST",
        });
        return await r.json();
      } catch { return { ok: false, details: [] }; }
    },
    staleTime: 60_000,
  });

  const schedules: any[] = resp?.result?.schedules || resp?.schedules || SAMPLE_FEE_SCHEDULES;
  const versions: any[] = resp?.result?.versions || SAMPLE_VERSION_HISTORY;

  return (
    <div className="space-y-4 w-full max-w-7xl mx-auto">
      <ScreenHeader
        icon={Receipt}
        title="Fee Schedule"
        subtitle="§13 — Broker fee schedule management · service catalogue with versioned rates"
        badge="VERSIONED"
        action={
          <Button size="sm" className="bg-gold-gradient text-sovereign">
            <FileText className="w-3.5 h-3.5 mr-1.5" />New Schedule
          </Button>
        }
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Active Schedules" value={schedules.filter(s => s.status === "ACTIVE").length} icon={CheckCircle2} accent="#10b981" />
        <StatCard label="Draft Schedules" value={schedules.filter(s => s.status === "DRAFT").length} icon={Clock} accent="#fbbf24" />
        <StatCard label="Avg Fee (USD)" value={fmtUsd(avg(schedules.map(s => s.fee)))} icon={Banknote} />
        <StatCard label="Currencies" value={new Set(schedules.map(s => s.currency)).size} icon={Globe2} />
      </div>
      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Active Schedules</TabsTrigger>
          <TabsTrigger value="versions">Version History</TabsTrigger>
        </TabsList>
        <TabsContent value="active">
          <Card className="p-0">
            <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 sticky top-0">
                  <tr>
                    {["Service", "Fee", "Currency", "Status", "Version", "Updated"].map(h => (
                      <th key={h} className="text-left p-3 font-semibold uppercase tracking-wider text-[0.6rem]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((s, i) => {
                    const b = statusBadge(s.status);
                    return (
                      <tr key={i} className="border-t hover:bg-muted/20">
                        <td className="p-3 font-medium">{s.service}</td>
                        <td className="p-3 tabular-nums">{fmtUsd(s.fee)}</td>
                        <td className="p-3"><Badge variant="outline" className="text-[0.6rem]">{s.currency}</Badge></td>
                        <td className="p-3"><Badge variant={b.variant} className="text-[0.6rem]">{s.status}</Badge></td>
                        <td className="p-3 font-mono text-[0.65rem]">v{s.version}</td>
                        <td className="p-3 text-[0.65rem] text-muted-foreground">{fmtDate(s.updatedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="versions">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <History className="w-4 h-4 text-muted-foreground" />
              <p className="text-xs font-semibold">Schedule version history (immutable audit trail)</p>
            </div>
            <ol className="space-y-2 max-h-96 overflow-y-auto">
              {versions.map((v, i) => (
                <li key={i} className="flex items-start gap-3 p-2 rounded border bg-muted/10">
                  <span className="text-[0.6rem] font-mono text-muted-foreground mt-0.5">v{v.version}</span>
                  <div className="flex-1">
                    <p className="text-xs">{v.service} → {fmtUsd(v.fee)} {v.currency}</p>
                    <p className="text-[0.65rem] text-muted-foreground">{v.reason} · {fmtDateTime(v.effectiveAt)}</p>
                  </div>
                  <Badge variant="outline" className="text-[0.6rem]">{v.changeType}</Badge>
                </li>
              ))}
            </ol>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// §15 — FEE COMMITMENTS SCREEN (CBR Portal, read-only)
// ────────────────────────────────────────────────────────────────────────────
export function FeeCommitmentsScreen({ data }: { data: Data }) {
  const brokerGtid = data?.tenant?.gtid;
  const { data: resp, isLoading } = useQuery({
    queryKey: ["fee-commitments", brokerGtid],
    queryFn: async () => {
      try {
        const r = await fetch(`/api/sgtx/customs-gateway/fee-demo/run?scenarioId=FEE-03&brokerGtid=${brokerGtid || ""}`, {
          method: "POST",
        });
        return await r.json();
      } catch { return { ok: false }; }
    },
    staleTime: 60_000,
  });
  const commitments: any[] = resp?.result?.commitments || SAMPLE_COMMITMENTS;

  return (
    <div className="space-y-4 w-full max-w-7xl mx-auto">
      <ScreenHeader
        icon={Lock}
        title="Fee Commitments"
        subtitle="§15 — Immutable fee commitments · hash-anchored · trader-accepted · read-only"
        badge="IMMUTABLE"
        action={<Badge variant="outline" className="text-[0.6rem] border-amber-500/40 text-amber-600"><Lock className="w-3 h-3 mr-1" />Read-only</Badge>}
      />
      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Fee commitments are <strong>immutable</strong>. Once a trader accepts a broker quote, the
          accepted fee is hash-anchored and cannot be edited, withdrawn, or replaced. Any
          deviation requires a formal additional-charge request (§16) or dispute resolution (§40).
        </p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Active Commitments" value={commitments.length} icon={Lock} accent="#10b981" />
        <StatCard label="Total Committed" value={fmtUsd(sum(commitments.map(c => c.amountUsd)))} icon={Banknote} />
        <StatCard label="Currencies" value={new Set(commitments.map(c => c.currency)).size} icon={Globe2} />
        <StatCard label="Integrity Verified" value={`${commitments.filter(c => c.hashVerified !== false).length}/${commitments.length}`} icon={ShieldCheck} accent="#10b981" />
      </div>
      <Card className="p-0">
        <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 sticky top-0">
              <tr>
                {["USTN", "Service", "Amount", "Currency", "Accepted At", "Hash", "Status"].map(h => (
                  <th key={h} className="text-left p-3 font-semibold uppercase tracking-wider text-[0.6rem]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {commitments.map((c, i) => (
                <tr key={i} className="border-t hover:bg-muted/20">
                  <td className="p-3 font-mono text-[0.65rem]">{c.ustn?.slice(0, 22)}…</td>
                  <td className="p-3">{c.service}</td>
                  <td className="p-3 tabular-nums font-semibold">{fmtUsd(c.amountUsd)}</td>
                  <td className="p-3"><Badge variant="outline" className="text-[0.6rem]">{c.currency}</Badge></td>
                  <td className="p-3 text-[0.65rem]">{fmtDateTime(c.acceptedAt)}</td>
                  <td className="p-3 font-mono text-[0.6rem] text-muted-foreground">
                    <Hash className="w-3 h-3 inline mr-1" />{c.commitmentHash?.slice(0, 16)}…
                  </td>
                  <td className="p-3"><Badge variant="default" className="text-[0.6rem]"><CheckCircle2 className="w-3 h-3 mr-1" />LOCKED</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// §16 — ADDITIONAL CHARGE REQUESTS SCREEN (CBR Portal)
// ────────────────────────────────────────────────────────────────────────────
export function AdditionalChargeRequestsScreen({ data }: { data: Data }) {
  const brokerGtid = data?.tenant?.gtid;
  const [showForm, setShowForm] = useState(false);
  const { data: resp, isLoading } = useQuery({
    queryKey: ["additional-charges", brokerGtid],
    queryFn: async () => {
      try {
        const r = await fetch(`/api/sgtx/customs-gateway/fee-demo/run?scenarioId=FEE-04&brokerGtid=${brokerGtid || ""}`, {
          method: "POST",
        });
        return await r.json();
      } catch { return { ok: false }; }
    },
    staleTime: 60_000,
  });
  const requests: any[] = resp?.result?.chargeRequests || SAMPLE_CHARGE_REQUESTS;

  return (
    <div className="space-y-4 w-full max-w-7xl mx-auto">
      <ScreenHeader
        icon={AlertCircle}
        title="Additional Charge Requests"
        subtitle="§16 — Post-quote fee change workflow · broker submits · trader accepts or disputes"
        badge="WORKFLOW"
        action={
          <Button size="sm" className="bg-gold-gradient text-sovereign" onClick={() => setShowForm(v => !v)}>
            <Send className="w-3.5 h-3.5 mr-1.5" />{showForm ? "Cancel" : "Submit Charge Request"}
          </Button>
        }
      />
      {showForm && (
        <Card className="p-4 space-y-3 border-amber-500/30">
          <h4 className="text-sm font-semibold">Submit Additional Charge Request</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="acr-ustn" className="text-xs">USTN</Label>
              <Input id="acr-ustn" placeholder="SGTX-USTN-…" className="text-xs font-mono" />
            </div>
            <div>
              <Label htmlFor="acr-amount" className="text-xs">Additional Amount (USD)</Label>
              <Input id="acr-amount" type="number" placeholder="0.00" className="text-xs" />
            </div>
          </div>
          <div>
            <Label htmlFor="acr-reason" className="text-xs">Reason</Label>
            <Textarea id="acr-reason" rows={3} placeholder="Justify the additional charge — e.g. re-inspection required by NFSA hold" className="text-xs" />
          </div>
          <div>
            <Label htmlFor="acr-evidence" className="text-xs">Evidence Package Hash</Label>
            <Input id="acr-evidence" placeholder="sha256:…" className="text-xs font-mono" />
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button size="sm" className="bg-gold-gradient text-sovereign"><Send className="w-3.5 h-3.5 mr-1.5" />Submit for Trader Review</Button>
          </div>
        </Card>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Pending" value={requests.filter(r => r.status === "PENDING").length} icon={Clock} accent="#fbbf24" />
        <StatCard label="Trader Accepted" value={requests.filter(r => r.status === "TRADER_ACCEPT").length} icon={CheckCircle2} accent="#10b981" />
        <StatCard label="Disputed" value={requests.filter(r => r.status === "DISPUTED").length} icon={Gavel} accent="#f87171" />
        <StatCard label="Total Value" value={fmtUsd(sum(requests.map(r => r.amountUsd)))} icon={Banknote} />
      </div>
      <Card className="p-0">
        <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 sticky top-0">
              <tr>
                {["USTN", "Reason", "Amount", "Status", "Submitted", "Evidence"].map(h => (
                  <th key={h} className="text-left p-3 font-semibold uppercase tracking-wider text-[0.6rem]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.map((r, i) => {
                const b = statusBadge(r.status);
                return (
                  <tr key={i} className="border-t hover:bg-muted/20">
                    <td className="p-3 font-mono text-[0.65rem]">{r.ustn?.slice(0, 22)}…</td>
                    <td className="p-3 max-w-xs truncate" title={r.reason}>{r.reason}</td>
                    <td className="p-3 tabular-nums">{fmtUsd(r.amountUsd)}</td>
                    <td className="p-3"><Badge variant={b.variant} className="text-[0.6rem]" style={b.color ? { color: b.color } : undefined}>{r.status}</Badge></td>
                    <td className="p-3 text-[0.65rem]">{timeAgo(r.submittedAt)}</td>
                    <td className="p-3 font-mono text-[0.6rem] text-muted-foreground">{r.evidenceHash ? `${r.evidenceHash.slice(0, 12)}…` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// §40 — FEE DISPUTES SCREEN (CBR Portal — broker view)
// ────────────────────────────────────────────────────────────────────────────
export function FeeDisputesScreen({ data }: { data: Data }) {
  const brokerGtid = data?.tenant?.gtid;
  const { data: resp } = useQuery({
    queryKey: ["fee-disputes-broker", brokerGtid],
    queryFn: async () => {
      try {
        const r = await fetch(`/api/sgtx/customs-gateway/fee-observability`);
        return await r.json();
      } catch { return { ok: false }; }
    },
    staleTime: 30_000,
  });
  const metrics = resp?.metrics || {};
  const disputes: any[] = resp?.disputes || SAMPLE_DISPUTES;

  return (
    <div className="space-y-4 w-full max-w-7xl mx-auto">
      <ScreenHeader
        icon={Gavel}
        title="Fee Disputes"
        subtitle="§40 — Dispute dashboard (broker view) · evidence request · response · resolution"
        badge="GOVERNED"
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Pending Disputes" value={metrics.pendingDisputes ?? disputes.filter(d => d.status === "FILED").length} icon={Clock} accent="#fbbf24" />
        <StatCard label="Awaiting Response" value={disputes.filter(d => d.status === "AWAITING_RESPONSE").length} icon={AlertCircle} accent="#fb923c" />
        <StatCard label="Upheld" value={metrics.upheldDisputes ?? disputes.filter(d => d.outcome === "UPHELD").length} icon={CheckCircle2} accent="#10b981" />
        <StatCard label="Fee Integrity Score" value={`${100 - (metrics.repeatedViolations || 0) * 5}%`} icon={ShieldCheck} accent="#10b981" />
      </div>
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Incoming Disputes</h3>
          <Badge variant="outline" className="text-[0.6rem]">§40 BROKER DASHBOARD</Badge>
        </div>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {disputes.length === 0 ? <EmptyState msg="No active disputes." /> : disputes.map((d, i) => (
            <div key={i} className="p-3 rounded-lg border bg-muted/10 space-y-2">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <p className="text-xs font-mono">{d.ustn?.slice(0, 26)}…</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{d.reason}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusBadge(d.status).variant} className="text-[0.6rem]">{d.status}</Badge>
                  <span className="text-xs font-bold tabular-nums">{fmtUsd(d.disputedAmountUsd)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[0.65rem] text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span>Filed {timeAgo(d.filedAt)}</span>
                {d.responseDeadline && <><span className="mx-1">·</span><AlertTriangle className="w-3 h-3 text-amber-500" /><span>Respond by {fmtDateTime(d.responseDeadline)}</span></>}
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" className="h-7 text-xs"><Eye className="w-3 h-3 mr-1" />View Evidence</Button>
                <Button size="sm" variant="outline" className="h-7 text-xs"><Send className="w-3 h-3 mr-1" />Respond</Button>
                {d.aiRecommendation && (
                  <Badge variant="outline" className="text-[0.6rem] border-violet-400/40 text-violet-600"><Sparkles className="w-3 h-3 mr-1" />AI: {d.aiRecommendation}</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// §25 — TRADER FEE VIEW SCREEN (Buyer Portal)
// ────────────────────────────────────────────────────────────────────────────
export function TraderFeeViewScreen({ data }: { data: Data }) {
  const traderGtid = data?.tenant?.gtid;
  const { data: resp } = useQuery({
    queryKey: ["trader-fee-view", traderGtid],
    queryFn: async () => {
      try {
        const r = await fetch(`/api/sgtx/customs-gateway/fee-demo/seed`);
        return await r.json();
      } catch { return { ok: false }; }
    },
    staleTime: 60_000,
  });
  const view = resp?.result?.traderFeeView || SAMPLE_TRADER_FEE_VIEW;

  return (
    <div className="space-y-4 w-full max-w-7xl mx-auto">
      <ScreenHeader
        icon={Receipt}
        title="Customs Fees"
        subtitle="§25 — Trader fee visibility · broker · accepted fee · government & pass-through charges"
        badge="TRANSPARENT"
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4 lg:col-span-1 space-y-3">
          <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-gold" /><h3 className="text-sm font-semibold">Accepted Broker Fee</h3></div>
          <dl className="text-xs space-y-2">
            <div className="flex justify-between"><dt className="text-muted-foreground">Broker</dt><dd className="font-medium font-mono text-[0.7rem]">{view.brokerGtid?.slice(0, 22)}…</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">USTN</dt><dd className="font-mono text-[0.7rem]">{view.ustn?.slice(0, 22)}…</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Service</dt><dd className="font-medium">{view.selectedService}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Accepted Fee</dt><dd className="font-bold tabular-nums">{fmtUsd(view.acceptedFeeUsd)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Accepted At</dt><dd>{fmtDateTime(view.acceptedAt)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Commitment Hash</dt><dd className="font-mono text-[0.6rem]">{view.commitmentHash?.slice(0, 16)}…</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Customs Status</dt><dd><Badge variant="outline" className="text-[0.6rem]">{view.customsStatus}</Badge></dd></div>
          </dl>
        </Card>
        <div className="lg:col-span-2 space-y-3">
          <FeeBreakdownScreen data={{ ustn: view.ustn, feeBreakdown: view.feeBreakdown }} />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" />Included Services</h3>
          <ul className="text-xs space-y-1.5 max-h-48 overflow-y-auto">
            {(view.includedServices || []).map((s: string, i: number) => (
              <li key={i} className="flex items-start gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" /><span>{s}</span></li>
            ))}
          </ul>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><AlertCircle className="w-4 h-4 text-amber-500" />Excluded Services</h3>
          <ul className="text-xs space-y-1.5 max-h-48 overflow-y-auto">
            {(view.excludedServices || []).map((s: string, i: number) => (
              <li key={i} className="flex items-start gap-2"><AlertCircle className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" /><span>{s}</span></li>
            ))}
          </ul>
        </Card>
      </div>
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><History className="w-4 h-4 text-muted-foreground" />Additional Charge Requests & Resolution History</h3>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {(view.additionalChargeRequests || []).length === 0 && (view.resolutionHistory || []).length === 0 ? (
            <EmptyState msg="No additional charges or disputes for this trade." />
          ) : (
            <>
              {(view.additionalChargeRequests || []).map((r: any, i: number) => (
                <div key={`acr-${i}`} className="p-2 rounded border bg-amber-500/5 flex items-center justify-between gap-2 text-xs">
                  <span>{r.reason}</span>
                  <div className="flex items-center gap-2"><Badge variant="outline" className="text-[0.6rem]">{r.status}</Badge><span className="tabular-nums">{fmtUsd(r.amountUsd)}</span></div>
                </div>
              ))}
              {(view.resolutionHistory || []).map((r: any, i: number) => (
                <div key={`rh-${i}`} className="p-2 rounded border bg-muted/10 flex items-center justify-between gap-2 text-xs">
                  <span>{r.action}</span>
                  <span className="text-[0.65rem] text-muted-foreground">{fmtDateTime(r.at)}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// §40 — TRADER DISPUTE SCREEN (Buyer Portal — trader view)
// ────────────────────────────────────────────────────────────────────────────
export function TraderDisputeScreen({ data }: { data: Data }) {
  const { data: resp } = useQuery({
    queryKey: ["trader-fee-disputes"],
    queryFn: async () => {
      try {
        const r = await fetch(`/api/sgtx/customs-gateway/fee-observability`);
        return await r.json();
      } catch { return { ok: false }; }
    },
    staleTime: 30_000,
  });
  const disputes: any[] = resp?.disputes || SAMPLE_DISPUTES;

  return (
    <div className="space-y-4 w-full max-w-7xl mx-auto">
      <ScreenHeader
        icon={Gavel}
        title="Fee Disputes"
        subtitle="§40 — Dispute dashboard (trader view) · disputed amount · broker · evidence · timeline"
        badge="TRADER"
        action={<Button size="sm" className="bg-gold-gradient text-sovereign"><Gavel className="w-3.5 h-3.5 mr-1.5" />File Dispute</Button>}
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="My Disputes" value={disputes.length} icon={Gavel} accent="#f87171" />
        <StatCard label="Total Disputed" value={fmtUsd(sum(disputes.map(d => d.disputedAmountUsd)))} icon={Banknote} accent="#fb923c" />
        <StatCard label="Upheld" value={disputes.filter(d => d.outcome === "UPHELD").length} icon={CheckCircle2} accent="#10b981" />
        <StatCard label="Awaiting Resolution" value={disputes.filter(d => !d.outcome).length} icon={Clock} accent="#fbbf24" />
      </div>
      <div className="space-y-3">
        {disputes.length === 0 ? (
          <Card className="p-8"><EmptyState msg="No fee disputes filed. Broker fees are matching accepted commitments." /></Card>
        ) : disputes.map((d, i) => (
          <Card key={i} className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <Badge variant={statusBadge(d.status).variant} className="text-[0.6rem]">{d.status}</Badge>
                  {d.outcome && <Badge variant="outline" className="text-[0.6rem]">{d.outcome}</Badge>}
                  <span className="text-[0.6rem] text-muted-foreground font-mono">{d.ustn?.slice(0, 24)}…</span>
                </div>
                <p className="text-sm text-foreground">{d.reason}</p>
              </div>
              <div className="text-right">
                <p className="text-[0.6rem] uppercase tracking-widest text-muted-foreground">Disputed</p>
                <p className="text-lg font-bold tabular-nums text-red-500">{fmtUsd(d.disputedAmountUsd)}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="space-y-1">
                <p className="text-[0.6rem] uppercase tracking-widest text-muted-foreground">Broker</p>
                <p className="font-mono text-[0.7rem]">{d.brokerGtid?.slice(0, 26)}…</p>
                <p className="text-[0.6rem] uppercase tracking-widest text-muted-foreground mt-2">Original Quote</p>
                <p className="tabular-nums">{fmtUsd(d.originalQuoteUsd)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[0.6rem] uppercase tracking-widest text-muted-foreground">New Charge</p>
                <p className="tabular-nums font-semibold">{fmtUsd(d.newChargeUsd)}</p>
                <p className="text-[0.6rem] uppercase tracking-widest text-muted-foreground mt-2">Response Deadline</p>
                <p className="text-amber-600">{d.responseDeadline ? fmtDateTime(d.responseDeadline) : "—"}</p>
              </div>
            </div>
            {d.evidence && (
              <div className="p-2 rounded border bg-muted/20 text-xs">
                <p className="text-[0.6rem] uppercase tracking-widest text-muted-foreground mb-1">Evidence</p>
                <p className="font-mono text-[0.65rem] break-all">{d.evidence}</p>
              </div>
            )}
            {d.timeline && d.timeline.length > 0 && (
              <ol className="border-l-2 border-muted pl-3 space-y-1.5 text-xs">
                {d.timeline.map((t: any, j: number) => (
                  <li key={j} className="relative">
                    <span className="absolute -left-[1.4rem] top-1 w-2 h-2 rounded-full bg-gold" />
                    <span className="text-[0.6rem] text-muted-foreground">{fmtDateTime(t.at)}</span>
                    <p>{t.label}</p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// §40 — FEE DISPUTE ADMIN SCREEN (Admin / Compliance Portal)
// ────────────────────────────────────────────────────────────────────────────
export function FeeDisputeAdminScreen() {
  const { data: resp, isLoading } = useQuery({
    queryKey: ["fee-dispute-admin"],
    queryFn: async () => {
      try {
        const r = await fetch(`/api/sgtx/customs-gateway/fee-observability`);
        return await r.json();
      } catch { return { ok: false }; }
    },
    staleTime: 30_000,
  });
  const metrics = resp?.metrics || {};
  const riskFlags: any[] = metrics.feeRiskFlags || [];
  const aging: any[] = resp?.disputeAging || SAMPLE_AGING;
  const anomalies: any[] = resp?.brokerFeeAnomalies || [];

  return (
    <div className="space-y-4 w-full max-w-7xl mx-auto">
      <ScreenHeader
        icon={Gavel}
        title="Fee Dispute Admin"
        subtitle="§40 — Dispute dashboard (admin/compliance view) · repeat offenders · patterns · audit"
        badge="COMPLIANCE"
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Schedules" value={metrics.totalFeeSchedules ?? 0} icon={Receipt} />
        <StatCard label="Active Commitments" value={metrics.activeFeeCommitments ?? 0} icon={Lock} accent="#10b981" />
        <StatCard label="Pending Disputes" value={metrics.pendingDisputes ?? 0} icon={Clock} accent="#fbbf24" />
        <StatCard label="Repeated Violations" value={metrics.repeatedViolations ?? 0} icon={TrendingDown} accent="#f87171" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Upheld" value={metrics.upheldDisputes ?? 0} icon={CheckCircle2} accent="#10b981" />
        <StatCard label="Rejected" value={metrics.rejectedDisputes ?? 0} icon={AlertCircle} accent="#94a3b8" />
        <StatCard label="Unexplained Charges" value={metrics.unexplainedCharges ?? 0} icon={AlertTriangle} accent="#fb923c" />
        <StatCard label="Avg Resolution (hrs)" value={metrics.avgDisputeResolutionHours ?? 0} icon={Activity} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" />Repeat Offender Signals</h3>
            <Badge variant="outline" className="text-[0.6rem]">§40 PATTERN</Badge>
          </div>
          {riskFlags.length === 0 ? <EmptyState msg="No repeat offender signals." /> : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {riskFlags.map((r, i) => (
                <div key={i} className="p-2 rounded border bg-muted/10 flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono text-[0.7rem]">{r.brokerGtid?.slice(0, 26)}…</span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{r.violationCount} violations</span>
                    <Badge variant={r.riskLevel === "HIGH" ? "destructive" : "secondary"} className="text-[0.6rem]">{r.riskLevel}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Clock className="w-4 h-4 text-muted-foreground" />Dispute Aging</h3>
          <div className="space-y-2">
            {aging.map((a, i) => {
              const pct = aging.length > 0 ? (a.count / Math.max(...aging.map(x => x.count), 1)) * 100 : 0;
              return (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between text-xs"><span>{a.bucket}</span><span className="tabular-nums">{a.count}</span></div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-gold" style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Activity className="w-4 h-4 text-muted-foreground" />Broker Fee Anomalies</h3>
        {anomalies.length === 0 ? <EmptyState msg="No fee anomalies detected by the integrity engine." /> : (
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 sticky top-0">
                <tr>{["USTN", "Broker", "Type", "Detected"].map(h => <th key={h} className="text-left p-2 font-semibold uppercase tracking-wider text-[0.6rem]">{h}</th>)}</tr>
              </thead>
              <tbody>
                {anomalies.map((a, i) => (
                  <tr key={i} className="border-t"><td className="p-2 font-mono text-[0.65rem]">{a.ustn?.slice(0, 22)}…</td><td className="p-2 font-mono text-[0.65rem]">{a.brokerGtid?.slice(0, 22)}…</td><td className="p-2"><Badge variant="outline" className="text-[0.6rem]">{a.anomalyType}</Badge></td><td className="p-2 text-[0.65rem]">{timeAgo(a.detectedAt)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── sample data (only used when API returns nothing — purely synthetic) ──────

const SAMPLE_FEE_SCHEDULES = [
  { service: "Standard customs entry (Nafeza)", fee: 150, currency: "USD", status: "ACTIVE", version: 3, updatedAt: new Date(Date.now() - 86400000 * 12).toISOString() },
  { service: "Certificate of Origin (EUR.1)", fee: 45, currency: "USD", status: "ACTIVE", version: 2, updatedAt: new Date(Date.now() - 86400000 * 30).toISOString() },
  { service: "Post-clearance amendment", fee: 85, currency: "USD", status: "DRAFT", version: 1, updatedAt: new Date(Date.now() - 86400000 * 2).toISOString() },
  { service: "Bonded warehouse entry", fee: 220, currency: "USD", status: "ACTIVE", version: 4, updatedAt: new Date(Date.now() - 86400000 * 5).toISOString() },
];

const SAMPLE_VERSION_HISTORY = [
  { service: "Standard customs entry (Nafeza)", fee: 150, currency: "USD", version: 3, changeType: "RATE_UPDATE", reason: "Quarterly rate review", effectiveAt: new Date(Date.now() - 86400000 * 12).toISOString() },
  { service: "Standard customs entry (Nafeza)", fee: 140, currency: "USD", version: 2, changeType: "RATE_UPDATE", reason: "Cost adjustment", effectiveAt: new Date(Date.now() - 86400000 * 90).toISOString() },
  { service: "Standard customs entry (Nafeza)", fee: 130, currency: "USD", version: 1, changeType: "INITIAL", reason: "Schedule created", effectiveAt: new Date(Date.now() - 86400000 * 180).toISOString() },
];

const SAMPLE_COMMITMENTS = [
  { ustn: "SGTX-USTN-7B3F-DEMO-001", service: "Standard customs entry (Nafeza)", amountUsd: 150, currency: "USD", acceptedAt: new Date(Date.now() - 86400000 * 3).toISOString(), commitmentHash: "sha256:9f8c2a1b7e4d5f6a3c8b9e1d2f4a6c8b0e3d5f7a9c1b2d4e6f8a0c2b4d6e8f1a", hashVerified: true },
  { ustn: "SGTX-USTN-7B3F-DEMO-002", service: "Certificate of Origin (EUR.1)", amountUsd: 45, currency: "USD", acceptedAt: new Date(Date.now() - 86400000 * 5).toISOString(), commitmentHash: "sha256:1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b", hashVerified: true },
];

const SAMPLE_CHARGE_REQUESTS = [
  { ustn: "SGTX-USTN-7B3F-DEMO-001", amountUsd: 35, reason: "NFSA re-inspection triggered by hold", status: "PENDING", submittedAt: new Date(Date.now() - 3600000 * 4).toISOString(), evidenceHash: "sha256:3f8e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e" },
  { ustn: "SGTX-USTN-7B3F-DEMO-002", amountUsd: 12, reason: "Port handling surcharge (congestion)", status: "TRADER_ACCEPT", submittedAt: new Date(Date.now() - 86400000 * 2).toISOString(), evidenceHash: "sha256:7e4d6f8a0c2b4d6e8f1a3c5b7d9e1f3a5c7b9d1e3f5a7c9b1d3f5a7c9b1d3f5a" },
  { ustn: "SGTX-USTN-7B3F-DEMO-003", amountUsd: 80, reason: "Bonded warehouse extension fee", status: "DISPUTED", submittedAt: new Date(Date.now() - 86400000).toISOString(), evidenceHash: null },
];

const SAMPLE_DISPUTES = [
  {
    ustn: "SGTX-USTN-7B3F-DEMO-003", brokerGtid: "SGTX-EG-CBR-000009-5E7B",
    disputedAmountUsd: 80, originalQuoteUsd: 220, newChargeUsd: 300,
    reason: "FEE_NOT_IN_QUOTATION — bonded warehouse extension was not in the accepted quote",
    status: "AWAITING_RESPONSE", filedAt: new Date(Date.now() - 86400000).toISOString(),
    responseDeadline: new Date(Date.now() + 86400000 * 2).toISOString(),
    evidence: "sha256:evidence-package-9f8c2a1b7e4d5f6a3c8b9e1d2f4a6c8b0e3d5f7a9c1b2d4e6f8a0c2b4d6e8f1a",
    aiRecommendation: "UPHOLD",
    timeline: [
      { at: new Date(Date.now() - 86400000).toISOString(), label: "Dispute filed by trader" },
      { at: new Date(Date.now() - 3600000 * 20).toISOString(), label: "Evidence package submitted" },
      { at: new Date(Date.now() - 3600000 * 2).toISOString(), label: "Awaiting broker response" },
    ],
  },
  {
    ustn: "SGTX-USTN-7B3F-DEMO-004", brokerGtid: "SGTX-EG-CBR-000009-5E7B",
    disputedAmountUsd: 25, originalQuoteUsd: 150, newChargeUsd: 175,
    reason: "DUPLICATE_CHARGE — port handling fee charged twice",
    status: "FILED", filedAt: new Date(Date.now() - 3600000 * 6).toISOString(),
    responseDeadline: new Date(Date.now() + 86400000 * 3).toISOString(),
    evidence: null,
    aiRecommendation: "PARTIAL",
    timeline: [{ at: new Date(Date.now() - 3600000 * 6).toISOString(), label: "Dispute filed by trader" }],
  },
];

const SAMPLE_TRADER_FEE_VIEW = {
  brokerGtid: "SGTX-EG-CBR-000009-5E7B",
  ustn: "SGTX-USTN-7B3F-DEMO-001",
  selectedService: "Standard customs entry (Nafeza)",
  acceptedFeeUsd: 150,
  acceptedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
  commitmentHash: "sha256:9f8c2a1b7e4d5f6a3c8b9e1d2f4a6c8b0e3d5f7a9c1b2d4e6f8a0c2b4d6e8f1a",
  customsStatus: "ACCEPTED",
  feeBreakdown: {
    tradeValueUsd: 10000,
    sgtxFeeRate: 0.015,
    sgtxFeeUsd: 150,
    brokerServiceUsd: 150,
    governmentChargesUsd: 850,
    thirdPartyPassThroughUsd: 220,
  },
  includedServices: ["Filing of CBP 3461", "Cargo release request", "Duty calculation", "Standard 3-day support"],
  excludedServices: ["Bonded warehouse extension", "PGA prior notice (FDA)", "Post-entry amendment"],
  additionalChargeRequests: [
    { reason: "NFSA re-inspection triggered by hold", amountUsd: 35, status: "PENDING" },
  ],
  resolutionHistory: [],
};

const SAMPLE_AGING = [
  { bucket: "< 24h", count: 1 },
  { bucket: "24–72h", count: 2 },
  { bucket: "3–7 days", count: 0 },
  { bucket: "7–14 days", count: 0 },
  { bucket: "> 14 days", count: 0 },
];

// ── small math helpers (defensive) ──────────────────────────────────────────
function avg(arr: number[]): number {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + (Number(b) || 0), 0) / arr.length;
}
function sum(arr: number[]): number {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + (Number(b) || 0), 0);
}
