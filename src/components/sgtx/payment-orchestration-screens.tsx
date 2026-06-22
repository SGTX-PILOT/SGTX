"use client";

// SGTX Part 6 — One-Click Payment Orchestration Screen
import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionHeader, ExecutiveCards } from "@/components/sgtx/widgets";
import { fmtUsd, statusColor } from "@/lib/sgtx/format";
import { useAppStore } from "@/store/app-store";
import { toast } from "sonner";
import {
  Banknote, Loader2, CheckCircle2, AlertTriangle, ShieldCheck, Activity,
  RefreshCw, Zap, FileText, Building2, Coins,
} from "lucide-react";

function useTenantGtid(): string | null { return useAppStore((s) => s.activeTenantGtid); }
async function jfetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, opts);
  if (!r.ok) { let msg = `HTTP ${r.status}`; try { const j = await r.json(); msg = j.error || msg; } catch { /* ignore */ } throw new Error(msg); }
  return r.json();
}

export function PaymentOrchestrationScreen() {
  const tenantGtid = useTenantGtid();
  const [splitPreview, setSplitPreview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState<any>(null);
  const [pspMatrix, setPspMatrix] = useState<any>(null);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const reload = useCallback(() => setRefreshKey(k => k + 1), []);

  useEffect(() => {
    if (!tenantGtid) return;
    setTimeout(() => setLoading(true), 0);
    Promise.all([
      jfetch(`/api/sgtx/payment/split-instruction?ustn=SGTX-1397F3A-2345B6C-20260415120000-A1B2C3D4&payerGtid=${tenantGtid}&invoiceValueUsd=100000`).catch(() => null),
      jfetch(`/api/sgtx/payment/psp-responsibility`).catch(() => null),
    ]).then(([split, matrix]) => {
      setSplitPreview(split); setPspMatrix(matrix);
    }).finally(() => setLoading(false));
  }, [tenantGtid, refreshKey]);

  const payStage1 = async () => {
    setPaying(true);
    try {
      const r = await jfetch("/api/sgtx/payment/stage1", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ustn: "SGTX-1397F3A-2345B6C-20260415120000-A1B2C3D4", payerGtid: tenantGtid, invoiceValueUsd: 100000 }),
      });
      setPaid(r);
      toast.success(`Stage 1 paid: $${r.totalAmount?.toFixed(2)} across ${r.splits?.length} payees. FeeLock ACTIVE. ACID obtained.`);
      reload();
    } catch (e: any) { toast.error(e.message); }
    finally { setPaying(false); }
  };

  if (loading) return <Card className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></Card>;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Payment Orchestration"
        subtitle="Part 6 · One-click Stage 1 (pre-shipment) + Stage 2 (post-departure) · PSP split to all payees · Government API auto-orchestration"
        action={<Button size="sm" variant="outline" onClick={reload}><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh</Button>}
      />

      <ExecutiveCards cards={[
        { label: "Stage 1 Total", value: splitPreview ? fmtUsd(splitPreview.totalAmount) : "—", sub: `${splitPreview?.payeeCount || 0} payees`, icon: Banknote, accent: "#fbbf24" },
        { label: "FeeLock Status", value: paid ? "ACTIVE" : "PENDING", icon: ShieldCheck, accent: paid ? "#10b981" : "#fbbf24" },
        { label: "Government APIs", value: paid ? "3 called" : "—", sub: paid ? "CargoX + Nafeza + ETA" : "Awaiting payment", icon: Building2, accent: "#60a5fa" },
        { label: "SGTX Fee (1.5%)", value: fmtUsd(1500), icon: Coins, accent: "#a78bfa" },
      ]} />

      {/* Stage 1 Fee Breakdown */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm flex items-center gap-1.5"><Zap className="w-4 h-4 text-gold" /> Stage 1 — Pre-shipment Payment (One Click)</h3>
          {paid ? <Badge variant="outline" className="text-[0.6rem] text-emerald-400 border-emerald-500/30"><CheckCircle2 className="w-3 h-3 mr-1" />PAID · FeeLock ACTIVE</Badge> : <Badge variant="outline" className="text-[0.6rem] text-amber-400">PENDING</Badge>}
        </div>
        {splitPreview && (
          <div className="space-y-1.5 mb-3">
            <div className="grid grid-cols-12 gap-2 text-[0.6rem] font-semibold text-muted-foreground uppercase pb-1 border-b border-border">
              <div className="col-span-4">Payee</div>
              <div className="col-span-5">Description</div>
              <div className="col-span-2 text-right">Amount</div>
              <div className="col-span-1 text-right">API</div>
            </div>
            {splitPreview.splits?.map((s: any, i: number) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center p-1.5 rounded bg-muted/20 text-xs">
                <div className="col-span-4 font-mono text-[0.65rem] truncate">{s.payee_gtid}</div>
                <div className="col-span-5 text-[0.65rem] text-muted-foreground">{s.description}</div>
                <div className="col-span-2 text-right font-semibold">{fmtUsd(s.amount)}</div>
                <div className="col-span-1 text-right">{["SGTX-PLATFORM", "EG-CUSTOMS", "EG-PLANT-QUARANTINE", "EG-NFSA", "EG-CHAMBER", "EG-PORT", "CARGOX"].includes(s.payee_gtid) ? <Badge variant="outline" className="text-[0.5rem] text-blue-400">API</Badge> : ""}</div>
              </div>
            ))}
            <div className="grid grid-cols-12 gap-2 items-center p-2 rounded bg-gold/5 border border-gold/20 text-xs font-bold">
              <div className="col-span-9 text-right text-gold">TOTAL STAGE 1:</div>
              <div className="col-span-3 text-right text-gold">{fmtUsd(splitPreview.totalAmount)}</div>
            </div>
          </div>
        )}
        {!paid && (
          <Button className="bg-gold-gradient text-sovereign w-full h-9" onClick={payStage1} disabled={paying}>
            {paying ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Processing PSP split...</> : <><Banknote className="w-4 h-4 mr-1.5" /> Pay Stage 1 ({splitPreview ? fmtUsd(splitPreview.totalAmount) : "..."})</>}
          </Button>
        )}
        {paid && (
          <div className="space-y-2">
            <Card className="p-3 bg-emerald-500/5 border-emerald-500/30">
              <p className="text-xs font-semibold text-emerald-400 mb-1.5 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Payment Successful — Government APIs Orchestrated</p>
              <div className="grid grid-cols-3 gap-2 text-[0.65rem]">
                <div><p className="text-muted-foreground">CargoX ACID</p><p className="font-mono font-semibold">{paid.governmentApiCalls?.cargox?.acid}</p></div>
                <div><p className="text-muted-foreground">Nafeza Declaration</p><p className="font-mono font-semibold">{paid.governmentApiCalls?.nafeza?.declarationId?.slice(0, 20)}…</p></div>
                <div><p className="text-muted-foreground">ETA UUID</p><p className="font-mono font-semibold">{paid.governmentApiCalls?.eta?.uuid?.slice(0, 20)}…</p></div>
              </div>
              <p className="text-[0.6rem] text-muted-foreground mt-1.5">Request ID: {paid.requestId} · PSP: {paid.splits ? "SWIFT_BANK" : "N/A"} · Container release authorised.</p>
            </Card>
          </div>
        )}
      </Card>

      {/* PSP Responsibility Matrix */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-gold" /> PSP Responsibility Matrix (Non-Custodial)</h3>
          <button onClick={() => setShowDisclaimer(!showDisclaimer)} className="text-[0.6rem] text-gold hover:underline">{showDisclaimer ? "Hide" : "Show"} disclaimer</button>
        </div>
        {showDisclaimer && pspMatrix && (
          <div className="p-2 rounded bg-amber-500/5 border border-amber-500/20 text-[0.65rem] text-muted-foreground italic mb-2">
            ⚠ {pspMatrix.legal_disclaimer}
          </div>
        )}
        {pspMatrix && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[0.6rem] font-semibold text-red-400 uppercase mb-1">SGTX SHALL NOT</p>
              {pspMatrix.sgtx_shall_not?.map((item: string, i: number) => <p key={i} className="text-[0.65rem] text-muted-foreground">❌ {item}</p>)}
            </div>
            <div>
              <p className="text-[0.6rem] font-semibold text-emerald-400 uppercase mb-1">Licensed PSP SHALL</p>
              {pspMatrix.psp_shall?.map((item: string, i: number) => <p key={i} className="text-[0.65rem] text-muted-foreground">✅ {item}</p>)}
            </div>
          </div>
        )}
      </Card>

      {/* Late Fee Check Button */}
      <Card className="p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> Late Fee Calculator (Cron)</p>
            <p className="text-[0.6rem] text-muted-foreground">0.1%/day · Capped at 100% · Checks overdue FeePaymentRequests</p>
          </div>
          <Button size="sm" variant="outline" className="h-7" onClick={async () => { try { const r = await jfetch("/api/sgtx/payment/fees", { method: "POST" }); toast.success(`Checked ${r.checked} fees · ${r.penalized} penalized`); } catch (e: any) { toast.error(e.message); } }}>
            <Activity className="w-3 h-3 mr-1" /> Run Check
          </Button>
        </div>
      </Card>

      {/* Deferred Expiry Check */}
      <Card className="p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-amber-400" /> Deferred Payment Guarantee Expiry Check</p>
            <p className="text-[0.6rem] text-muted-foreground">3-step escalation: 7d reminder → 1d alert → expiry auto-charge/block</p>
          </div>
          <Button size="sm" variant="outline" className="h-7" onClick={async () => { try { const r = await jfetch("/api/sgtx/payment/deferred-expiry-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }); toast.success(`Checked ${r.checked} deferred fees · ${r.reminded} reminded · ${r.alerted} alerted · ${r.expired} expired`); } catch (e: any) { toast.error(e.message); } }}>
            <Activity className="w-3 h-3 mr-1" /> Run Check
          </Button>
        </div>
      </Card>
    </div>
  );
}

import { Clock } from "lucide-react";
