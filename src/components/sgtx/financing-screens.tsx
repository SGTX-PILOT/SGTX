"use client";

// SGTX Phase 4 — Universal Trade Finance screens (Blueprint 3B.5)
// - FinancingBorrowerScreen (trader-buyer / trader-seller "financing" tab)
// - FinancingOpportunitiesScreen (bank / pfi "opportunities" tab)
// - FinancierPortfolioScreen (bank / pfi "portfolio" tab)
// - FinancierPreferencesScreen (bank / pfi "preferences" tab — NEW)

import { useEffect, useState, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SectionHeader, ExecutiveCards } from "@/components/sgtx/widgets";
import { fmtUsd, fmtDate, statusColor } from "@/lib/sgtx/format";
import { useAppStore } from "@/store/app-store";
import { toast } from "sonner";
import {
  Banknote, Plus, Clock, TrendingUp, DollarSign, Activity, ShieldCheck, Loader2,
  Sparkles, Send, CheckCircle2, FileText, Gavel, Lock, Eye, AlertTriangle, Zap,
  Coins, Building2, Globe2, Settings, ArrowRight, Info, Package,
} from "lucide-react";

// ============ Shared helpers ============
function fmtCountdown(target?: Date | string | null): string {
  if (!target) return "—";
  const d = typeof target === "string" ? new Date(target) : target;
  const diff = d.getTime() - Date.now();
  if (diff <= 0) return "Closed";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}h ${m}m`;
}

function creditColor(score: number): string {
  if (score >= 80) return "#10b981";
  if (score >= 60) return "#fbbf24";
  return "#f87171";
}
function matchColor(score: number): string {
  if (score >= 85) return "#10b981";
  if (score >= 70) return "#60a5fa";
  return "#fbbf24";
}

const FINANCING_TYPES = [
  { value: "PRE_SHIPMENT", label: "Pre-Shipment" },
  { value: "POST_SHIPMENT", label: "Post-Shipment" },
  { value: "INVOICE_FINANCING", label: "Invoice Financing" },
  { value: "STRUCTURED", label: "Structured" },
];
const SETTLEMENTS = [
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "STABLECOIN", label: "Stablecoin (USDC/USDT)" },
  { value: "DEFI_PROTOCOL", label: "DeFi Protocol" },
];
const COLLATERALS = [
  { value: "GOODS", label: "Goods" },
  { value: "WAREHOUSE_RECEIPT", label: "Warehouse Receipt" },
  { value: "RECEIVABLES", label: "Receivables" },
  { value: "NONE", label: "None" },
];
const COUNTRIES = ["EG", "DE", "VN", "AE", "SA", "US", "CN", "FR", "NL", "TR"];

function useTenantGtid(): string | null {
  return useAppStore((s) => s.activeTenantGtid);
}
function useTraderMode(): string {
  return useAppStore((s) => s.traderMode);
}

async function jfetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, opts);
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { const j = await r.json(); msg = j.error || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return r.json();
}

// ============================================================
// 1. BORROWER SCREEN
// ============================================================
export function FinancingBorrowerScreen() {
  const tenantGtid = useTenantGtid();
  const traderMode = useTraderMode() as string;
  const [lockedTrades, setLockedTrades] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [requestModal, setRequestModal] = useState<{ trade: any } | null>(null);
  const [bidsModal, setBidsModal] = useState<any | null>(null);
  const [signModal, setSignModal] = useState<any | null>(null);
  const [repayModal, setRepayModal] = useState<any | null>(null);

  const reload = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!tenantGtid) return;
    setTimeout(() => setLoading(true), 0);
    Promise.all([
      jfetch(`/api/sgtx/financing/locked-trades?borrowerGtid=${tenantGtid}`).catch(() => ({ trades: [] })),
      jfetch(`/api/sgtx/financing/request?borrowerGtid=${tenantGtid}`).catch(() => ({ requests: [] })),
    ]).then(([lt, rq]) => {
      setLockedTrades(lt.trades || []);
      setRequests(rq.requests || []);
    }).finally(() => setLoading(false));
  }, [tenantGtid, refreshKey]);

  const totalFunded = requests.filter(r => ["DISBURSING", "ACTIVE", "REPAID"].includes(r.status)).reduce((s, r) => s + (r.feeUsd ? r.amountUsd : 0), 0);
  const totalRepaid = requests.filter(r => r.status === "REPAID").reduce((s, r) => s + r.amountUsd, 0);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Universal Trade Finance"
        subtitle="Phase 4 · Non-custodial · 0.25% flat fee · Auto RFQ broadcast · Co-financing · DeFi"
        action={
          <Button size="sm" className="bg-gold-gradient text-sovereign" onClick={reload}>
            <Activity className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
        }
      />

      <ExecutiveCards cards={[
        { label: "Open Requests", value: String(requests.filter(r => ["REQUESTED", "RFQ_BROADCAST", "BIDDING_OPEN"].includes(r.status)).length), icon: Banknote, accent: "#fbbf24" },
        { label: "Active Loans", value: String(requests.filter(r => ["DISBURSING", "ACTIVE"].includes(r.status)).length), icon: TrendingUp, accent: "#10b981" },
        { label: "Total Funded", value: fmtUsd(totalFunded), icon: DollarSign, accent: "#60a5fa" },
        { label: "Repaid", value: fmtUsd(totalRepaid), icon: CheckCircle2, accent: "#a78bfa" },
      ]} />

      {/* Eligible trades */}
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Lock className="w-4 h-4 text-emerald-400" /> Locked Trades Eligible for Financing</h3>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-4"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</div>
        ) : lockedTrades.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4">No locked trades eligible for financing yet. A contract must be LOCKED and SGTX fee paid before you can request financing.</p>
        ) : (
          <div className="space-y-2">
            {lockedTrades.slice(0, 5).map((t) => (
              <div key={t.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/20 border border-border">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-mono text-muted-foreground truncate">{t.ustn.slice(0, 28)}…</span>
                    <Badge variant="outline" className="text-[0.6rem]">{t.borrowerRole}</Badge>
                    <Badge variant="outline" className="text-[0.6rem]">{t.multiShipment ? "Multi-ship" : "Single"}</Badge>
                  </div>
                  <p className="text-xs font-medium truncate">{t.commodity}</p>
                  <p className="text-[0.65rem] text-muted-foreground">{fmtUsd(t.tradeValueUsd)} · {t.incoterm} · {t.originPort} → {t.destPort}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {t.existingRequests > 0 && <span className="text-[0.6rem] text-amber-400">{t.existingRequests} existing</span>}
                  <Button size="sm" className="bg-gold-gradient text-sovereign h-7" onClick={() => setRequestModal({ trade: t })}>
                    <Plus className="w-3 h-3 mr-1" /> Request Financing
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Active requests */}
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3">My Financing Requests</h3>
        {requests.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">No financing requests yet. Click "Request Financing" on a locked trade above to start.</p>
        ) : (
          <div className="space-y-3">
            {requests.map((r) => (
              <RequestCard key={r.id} r={r} onViewBids={() => setBidsModal(r)} onSign={() => setSignModal(r)} onRepay={() => setRepayModal(r)} onChanged={reload} />
            ))}
          </div>
        )}
      </Card>

      {requestModal && (
        <RequestFinancingModal
          trade={requestModal.trade}
          borrowerGtid={tenantGtid!}
          traderMode={traderMode}
          onClose={() => setRequestModal(null)}
          onSubmitted={() => { setRequestModal(null); reload(); toast.success("Financing request submitted — RFQ broadcast to matching financiers."); }}
        />
      )}
      {bidsModal && (
        <AcceptBidsModal
          request={bidsModal}
          borrowerGtid={tenantGtid!}
          onClose={() => setBidsModal(null)}
          onAccepted={() => { setBidsModal(null); reload(); toast.success("Bids accepted — financing agreement assembled with witness clause."); }}
        />
      )}
      {signModal && (
        <SignAgreementModal
          request={signModal}
          borrowerGtid={tenantGtid!}
          onClose={() => setSignModal(null)}
          onSigned={() => { setSignModal(null); reload(); toast.success("Agreement signed. Financiers notified to disburse."); }}
        />
      )}
      {repayModal && (
        <RepaymentScheduleModal request={repayModal} borrowerGtid={tenantGtid!} onClose={() => setRepayModal(null)} onRepaid={reload} />
      )}
    </div>
  );
}

function RequestCard({ r, onViewBids, onSign, onRepay, onChanged }: { r: any; onViewBids: () => void; onSign: () => void; onRepay: () => void; onChanged: () => void }) {
  const [credit, setCredit] = useState<any>(null);
  useEffect(() => {
    if (r.creditIntelligence) {
      setTimeout(() => { try { setCredit(JSON.parse(r.creditIntelligence)); } catch { /* ignore */ } }, 0);
    }
  }, [r.creditIntelligence]);

  const totalOffered = (r.bids || []).filter((b: any) => b.status === "SUBMITTED").reduce((s: number, b: any) => s + b.amountOffered, 0);
  const statusBadge = (
    <Badge variant="outline" className="text-[0.6rem]" style={{ color: statusColor(r.status), borderColor: `${statusColor(r.status)}55` }}>{r.status.replace(/_/g, " ")}</Badge>
  );

  return (
    <div className="p-3 rounded-lg bg-muted/20 border border-border">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-mono font-semibold">{r.requestId}</span>
            {statusBadge}
          </div>
          <p className="text-[0.65rem] text-muted-foreground">
            {fmtUsd(r.amountUsd)} · {r.financingType.replace(/_/g, " ")} · {r.tenorDays}d · {r.preferredSettlement.replace(/_/g, " ")}
          </p>
        </div>
        {r.status === "BIDDING_OPEN" && r.biddingWindowEndsAt && (
          <div className="text-right">
            <p className="text-[0.6rem] text-muted-foreground">Window closes</p>
            <p className="text-xs font-mono text-amber-400">{fmtCountdown(r.biddingWindowEndsAt)}</p>
          </div>
        )}
      </div>

      {credit && (
        <div className="grid grid-cols-3 gap-2 mb-2 text-xs">
          <div>
            <p className="text-[0.6rem] text-muted-foreground">Credit Score</p>
            <p className="font-semibold" style={{ color: creditColor(credit.creditScore) }}>{credit.creditScore}/100</p>
          </div>
          <div>
            <p className="text-[0.6rem] text-muted-foreground">Default Prob.</p>
            <p className="font-semibold">{credit.defaultProbability}%</p>
          </div>
          <div>
            <p className="text-[0.6rem] text-muted-foreground">Recommended LTV</p>
            <p className="font-semibold">{credit.recommendedLtv}%</p>
          </div>
        </div>
      )}

      {r.bids && r.bids.length > 0 && (
        <div className="text-xs text-muted-foreground mb-2">
          {(r.bids || []).length} bid(s) received · Total offered: <span className="text-foreground font-medium">{fmtUsd(totalOffered)}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {r.status === "BIDDING_OPEN" && (
          <Button size="sm" variant="outline" className="h-7" onClick={onViewBids}>
            <Eye className="w-3 h-3 mr-1" /> View Bids
          </Button>
        )}
        {(r.status === "AGREEMENT_PENDING" || r.status === "SIGNING") && (
          <Button size="sm" className="bg-gold-gradient text-sovereign h-7" onClick={onSign}>
            <ShieldCheck className="w-3 h-3 mr-1" /> Sign Agreement
          </Button>
        )}
        {(r.status === "DISBURSING" || r.status === "ACTIVE") && (
          <Button size="sm" variant="outline" className="h-7" onClick={onRepay}>
            <DollarSign className="w-3 h-3 mr-1" /> Repayment Schedule
          </Button>
        )}
        {r.status === "REPAID" && (
          <Badge variant="outline" className="text-[0.6rem] text-emerald-400 border-emerald-500/30"><CheckCircle2 className="w-3 h-3 mr-1" /> Fully Repaid · FeeLock Released</Badge>
        )}
      </div>
    </div>
  );
}

function RequestFinancingModal({ trade, borrowerGtid, traderMode, onClose, onSubmitted }: { trade: any; borrowerGtid: string; traderMode: string; onClose: () => void; onSubmitted: () => void }) {
  const [amount, setAmount] = useState(Math.round(trade.tradeValueUsd * 0.7));
  const [financingType, setFinancingType] = useState(trade.borrowerRole === "SELLER" ? "PRE_SHIPMENT" : "POST_SHIPMENT");
  const [tenorDays, setTenorDays] = useState(60);
  const [settlement, setSettlement] = useState("BANK_TRANSFER");
  const [currency] = useState("USD");
  const [collateral, setCollateral] = useState("GOODS");
  const [instructions, setInstructions] = useState("");
  const [credit, setCredit] = useState<any>(null);
  const [creditLoading, setCreditLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Compute credit intel preview
  useEffect(() => {
    setCreditLoading(true);
    fetch(`/api/sgtx/financing/credit-intelligence?borrowerGtid=${borrowerGtid}&includeAi=false`)
      .then(r => r.json())
      .then(d => setCredit(d.creditIntelligence))
      .catch(() => {/* ignore */})
      .finally(() => setCreditLoading(false));
  }, [borrowerGtid]);

  const ltvPct = trade.tradeValueUsd > 0 ? (amount / trade.tradeValueUsd) * 100 : 0;
  const ltvWarning = credit && ltvPct > credit.recommendedLtv;

  const submit = async () => {
    setSubmitting(true);
    try {
      await jfetch("/api/sgtx/financing/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          borrowerGtid, tradeId: trade.id, amountUsd: amount, financingType, tenorDays,
          preferredSettlement: settlement, preferredCurrency: currency, collateralType: collateral,
          specialInstructions: instructions, traderMode,
        }),
      });
      onSubmitted();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Request Financing — {trade.ustn.slice(0, 28)}…</DialogTitle>
          <DialogDescription>Phase 4 · Non-custodial · 0.25% flat fee deducted from disbursement via PSP split</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-2 rounded bg-muted/30">
            <p className="text-[0.65rem] text-muted-foreground">USTN</p>
            <p className="font-mono text-[0.7rem]">{trade.ustn}</p>
          </div>
          <div className="p-2 rounded bg-muted/30">
            <p className="text-[0.65rem] text-muted-foreground">Total Trade Value</p>
            <p className="font-semibold">{fmtUsd(trade.tradeValueUsd)}</p>
          </div>
          <div className="p-2 rounded bg-muted/30">
            <p className="text-[0.65rem] text-muted-foreground">Commodity</p>
            <p className="font-medium text-[0.7rem]">{trade.commodity}</p>
          </div>
          <div className="p-2 rounded bg-muted/30">
            <p className="text-[0.65rem] text-muted-foreground">Your Role</p>
            <p className="font-semibold">{trade.borrowerRole}</p>
          </div>
        </div>

        {/* AI Credit Intel Preview */}
        <Card className="p-3 border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <p className="text-xs font-semibold">AI Credit Intelligence (A2 — advisory)</p>
            {creditLoading && <Loader2 className="w-3 h-3 animate-spin text-amber-400" />}
          </div>
          {credit && (
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div><p className="text-[0.6rem] text-muted-foreground">Credit Score</p><p className="font-bold" style={{ color: creditColor(credit.creditScore) }}>{credit.creditScore}/100</p></div>
              <div><p className="text-[0.6rem] text-muted-foreground">Default Prob.</p><p className="font-bold">{credit.defaultProbability}%</p></div>
              <div><p className="text-[0.6rem] text-muted-foreground">Recommended LTV</p><p className="font-bold text-amber-400">{credit.recommendedLtv}%</p></div>
              <div className="col-span-3 text-[0.7rem] text-muted-foreground italic">{credit.recommendation}</div>
            </div>
          )}
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Requested Amount (USD)</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(+e.target.value)} className="h-9" />
            <p className="text-[0.65rem] text-muted-foreground mt-0.5">LTV: {ltvPct.toFixed(1)}% {ltvWarning && <span className="text-amber-400">⚠ exceeds recommended {credit?.recommendedLtv}%</span>}</p>
          </div>
          <div>
            <Label className="text-xs">Financing Type</Label>
            <Select value={financingType} onValueChange={setFinancingType}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{FINANCING_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Tenor (days)</Label>
            <Input type="number" value={tenorDays} onChange={(e) => setTenorDays(+e.target.value)} className="h-9" min={1} />
          </div>
          <div>
            <Label className="text-xs">Preferred Settlement</Label>
            <Select value={settlement} onValueChange={setSettlement}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{SETTLEMENTS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Collateral Type</Label>
            <Select value={collateral} onValueChange={setCollateral}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{COLLATERALS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Currency</Label>
            <Input value={currency} disabled className="h-9" />
          </div>
        </div>
        <div>
          <Label className="text-xs">Special Instructions</Label>
          <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. Seller needs working capital before harvest" className="min-h-[60px]" />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-gold-gradient text-sovereign" onClick={submit} disabled={submitting || amount <= 0 || tenorDays < 1}>
            {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
            Submit Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AcceptBidsModal({ request, borrowerGtid, onClose, onAccepted }: { request: any; borrowerGtid: string; onClose: () => void; onAccepted: () => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [accepting, setAccepting] = useState(false);
  const bids = (request.bids || []).filter((b: any) => b.status === "SUBMITTED");
  const totalSelected = bids.filter((b: any) => selected.includes(b.bidId)).reduce((s: number, b: any) => s + b.amountOffered, 0);
  const overP = totalSelected > request.amountUsd;

  const toggle = (bidId: string) => {
    setSelected(s => s.includes(bidId) ? s.filter(x => x !== bidId) : [...s, bidId]);
  };

  const accept = async () => {
    if (selected.length === 0) { toast.error("Select at least one bid"); return; }
    if (overP) { toast.error("Sum exceeds requested amount"); return; }
    setAccepting(true);
    try {
      await jfetch("/api/sgtx/financing/accept-bids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: request.id, borrowerGtid, selectedBidIds: selected }),
      });
      onAccepted();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setAccepting(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Accept Bids (Co-Financing) — {request.requestId}</DialogTitle>
          <DialogDescription>
            Bidding window closed. Select a combination summing to ≤ requested amount ({fmtUsd(request.amountUsd)}).
          </DialogDescription>
        </DialogHeader>

        {bids.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No bids received.</p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-2 text-[0.65rem] font-semibold text-muted-foreground uppercase pb-1 border-b border-border">
              <div className="col-span-1"></div>
              <div className="col-span-3">Financier</div>
              <div className="col-span-2">Amount</div>
              <div className="col-span-1">APR</div>
              <div className="col-span-2">Settlement</div>
              <div className="col-span-2">Collateral</div>
              <div className="col-span-1">Match</div>
            </div>
            {bids.map((b: any) => (
              <div key={b.bidId} className={`grid grid-cols-12 gap-2 items-center p-2 rounded-lg border ${selected.includes(b.bidId) ? "border-emerald-500/50 bg-emerald-500/5" : "border-border bg-muted/20"}`}>
                <div className="col-span-1"><Checkbox checked={selected.includes(b.bidId)} onCheckedChange={() => toggle(b.bidId)} /></div>
                <div className="col-span-3"><p className="text-xs font-medium truncate">{b.financier?.legalName}</p><p className="text-[0.6rem] text-muted-foreground font-mono">{b.financier?.gtid?.slice(0, 20)}</p></div>
                <div className="col-span-2 text-xs font-semibold">{fmtUsd(b.amountOffered)}</div>
                <div className="col-span-1 text-xs">{b.apr}%</div>
                <div className="col-span-2 text-[0.7rem]">{b.settlementMethod.replace(/_/g, " ")}</div>
                <div className="col-span-2 text-[0.7rem]">{b.collateralRequired}</div>
                <div className="col-span-1"><Badge variant="outline" className="text-[0.6rem]" style={{ color: matchColor(b.matchScore) }}>{b.matchScore}</Badge></div>
              </div>
            ))}
            <div className={`flex items-center justify-between p-2 rounded-lg ${overP ? "bg-red-500/10 border border-red-500/30" : "bg-muted/30 border border-border"}`}>
              <span className="text-xs">Total Selected:</span>
              <span className={`text-sm font-bold ${overP ? "text-red-400" : "text-emerald-400"}`}>{fmtUsd(totalSelected)} / {fmtUsd(request.amountUsd)}</span>
            </div>
            {bids.length < 2 && (
              <div className="text-[0.65rem] text-amber-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> G4U4: minimum 2 qualified bids required (or extend window).</div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-gold-gradient text-sovereign" onClick={accept} disabled={accepting || selected.length === 0 || overP}>
            {accepting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
            Accept Selected ({selected.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SignAgreementModal({ request, borrowerGtid, onClose, onSigned }: { request: any; borrowerGtid: string; onClose: () => void; onSigned: () => void }) {
  const [signing, setSigning] = useState(false);
  const agreement = (request.agreements || [])[0];

  const sign = async () => {
    setSigning(true);
    try {
      // Borrower signs
      await jfetch("/api/sgtx/financing/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agreementId: agreement.id, signerGtid: borrowerGtid, role: "BORROWER" }),
      });
      // Auto-governor signs
      await jfetch("/api/sgtx/financing/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agreementId: agreement.id, signerGtid: "SGTX-PLATFORM-GOVERNOR", role: "GOVERNOR" }),
      });
      onSigned();
    } catch (e: any) { toast.error(e.message); } finally { setSigning(false); }
  };

  if (!agreement) return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent><DialogHeader><DialogTitle>No agreement yet</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Agreement not yet assembled.</p></DialogContent>
    </Dialog>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sign Financing Agreement — {agreement.agreementId}</DialogTitle>
          <DialogDescription>Master agreement + {agreement.annexes?.length || 0} annex(es) · SGTX signs as witness</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-2 rounded bg-muted/30"><p className="text-[0.65rem] text-muted-foreground">Total Accepted</p><p className="font-bold">{fmtUsd(agreement.totalAcceptedAmount)}</p></div>
          <div className="p-2 rounded bg-muted/30"><p className="text-[0.65rem] text-muted-foreground">Blended APR</p><p className="font-bold">{agreement.blendedApr}%</p></div>
        </div>

        <Card className="p-3 bg-muted/20">
          <p className="text-xs font-semibold mb-1.5 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-gold" /> SGTX Financing Witness Clause (mandatory, non-removable)</p>
          <p className="text-[0.7rem] text-muted-foreground italic leading-relaxed">{agreement.witnessClauseText}</p>
        </Card>

        <div className="space-y-2">
          <p className="text-xs font-semibold">Annexes</p>
          {(agreement.annexes || []).map((a: any) => (
            <div key={a.id} className="flex items-center justify-between p-2 rounded bg-muted/20 text-xs">
              <div>
                <p className="font-mono">{a.id.slice(-8)}</p>
                <p className="text-[0.65rem] text-muted-foreground">{fmtUsd(a.amountFinanced)} @ {a.apr}% · Fee {fmtUsd(a.feeUsd)} · Net to borrower {fmtUsd(a.borrowerNetProceeds)}</p>
              </div>
              <Badge variant="outline" className="text-[0.6rem]" style={{ color: a.financierSignedAt ? "#10b981" : "#fbbf24" }}>
                {a.financierSignedAt ? "Signed by financier" : "Awaiting financier signature"}
              </Badge>
            </div>
          ))}
        </div>

        <div className="text-[0.65rem] text-muted-foreground">
          Signatures: Borrower {agreement.borrowerSignedAt ? "✓" : "○"} · Financier {agreement.financierSignedAt ? "✓" : "○"} · Governor {agreement.governorSignedAt ? "✓" : "○ (auto on borrower sign)"}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-gold-gradient text-sovereign" onClick={sign} disabled={signing || !!agreement.borrowerSignedAt}>
            {signing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5 mr-1" />}
            {agreement.borrowerSignedAt ? "Already Signed" : "Sign with Passkey (ZITADEL)"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RepaymentScheduleModal({ request, borrowerGtid, onClose, onRepaid }: { request: any; borrowerGtid: string; onClose: () => void; onRepaid: () => void }) {
  const [repaying, setRepaying] = useState(false);
  const [repayAmt, setRepayAmt] = useState(0);
  const agreement = (request.agreements || [])[0];

  const recordRepay = async (annexId: string, financierGtid: string, amount: number) => {
    setRepaying(true);
    try {
      await jfetch("/api/sgtx/financing/repay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: request.id, annexId, financierGtid, amountUsd: amount, method: "BANK_TRANSFER", txReference: `TX-${Date.now()}`, detectedVia: "PSP_WEBHOOK" }),
      });
      toast.success("Repayment recorded (PSP webhook detected)");
      onRepaid();
      onClose();
    } catch (e: any) { toast.error(e.message); } finally { setRepaying(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Repayment Schedule — {request.requestId}</DialogTitle>
          <DialogDescription>Automated monitoring · PSP webhooks / OpenBanking / onchain events</DialogDescription>
        </DialogHeader>
        {agreement && (
          <div className="space-y-3">
            {(agreement.annexes || []).map((a: any) => {
              const schedule = (() => { try { return JSON.parse(a.repaymentSchedule); } catch { return []; } })();
              return (
                <Card key={a.id} className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-xs font-semibold">Annex {a.id.slice(-8)}</p>
                      <p className="text-[0.65rem] text-muted-foreground">{fmtUsd(a.amountFinanced)} @ {a.apr}% · {a.tenorDays}d · Status: {a.status}</p>
                    </div>
                    <Badge variant="outline" className="text-[0.6rem]" style={{ color: statusColor(a.status) }}>{a.status}</Badge>
                  </div>
                  <table className="w-full text-[0.7rem]">
                    <thead><tr className="text-muted-foreground border-b border-border"><th className="text-left py-1">Due</th><th className="text-right">Principal</th><th className="text-right">Interest</th><th className="text-right">Total</th></tr></thead>
                    <tbody>
                      {schedule.map((s: any, i: number) => (
                        <tr key={i} className="border-b border-border/40"><td className="py-1">{s.dueDate}</td><td className="text-right">{fmtUsd(s.principal)}</td><td className="text-right">{fmtUsd(s.interest)}</td><td className="text-right font-medium">{fmtUsd(s.total)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  {a.status !== "REPAID" && (
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border">
                      <Input type="number" placeholder="Repay amount" className="h-7 text-xs" value={repayAmt || ""} onChange={(e) => setRepayAmt(+e.target.value)} />
                      <Button size="sm" className="bg-gold-gradient text-sovereign h-7" disabled={repaying || repayAmt <= 0} onClick={() => recordRepay(a.id, a.financierGtid, repayAmt)}>
                        {repaying ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <DollarSign className="w-3 h-3 mr-1" />} Record Repayment
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// 2. FINANCING OPPORTUNITIES SCREEN (Financier)
// ============================================================
export function FinancingOpportunitiesScreen() {
  const tenantGtid = useTenantGtid();
  const [rfqs, setRfqs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "high" | "defi">("all");
  const [detail, setDetail] = useState<any | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!tenantGtid) return;
    setTimeout(() => setLoading(true), 0);
    jfetch(`/api/sgtx/financing/rfqs?financierGtid=${tenantGtid}`)
      .then(d => setRfqs(d.rfqs || []))
      .catch(() => setRfqs([]))
      .finally(() => setLoading(false));
  }, [tenantGtid, refreshKey]);

  const filtered = rfqs.filter(r => {
    if (filter === "high") return r.matchScore >= 85;
    if (filter === "defi") return true; // all could be DeFi-eligible
    return true;
  });

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Financing Opportunities"
        subtitle="Open RFQs · Full Disclosure · Co-financing · Non-marketplace (you only see requests from borrowers in your saved network)"
        action={<Button size="sm" variant="outline" onClick={() => setRefreshKey(k => k + 1)}><Activity className="w-3.5 h-3.5 mr-1.5" />Refresh</Button>}
      />

      <div className="flex gap-2">
        <Button size="sm" variant={filter === "all" ? "default" : "outline"} className="h-7" onClick={() => setFilter("all")}>All ({rfqs.length})</Button>
        <Button size="sm" variant={filter === "high" ? "default" : "outline"} className="h-7" onClick={() => setFilter("high")}>High Match ≥85 ({rfqs.filter(r => r.matchScore >= 85).length})</Button>
        <Button size="sm" variant={filter === "defi" ? "default" : "outline"} className="h-7" onClick={() => setFilter("defi")}>DeFi-Eligible</Button>
      </div>

      {loading ? (
        <Card className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></Card>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No open RFQs match your preferences. You'll be notified via Smart Inbox when a new borrower request matches.</Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => (
            <Card key={r.rfqLogId} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <TooltipProvider><Tooltip><TooltipTrigger><Badge variant="outline" className="text-[0.65rem] font-bold" style={{ color: matchColor(r.matchScore), borderColor: `${matchColor(r.matchScore)}55` }}>Match {r.matchScore}</Badge></TooltipTrigger><TooltipContent><p className="text-xs max-w-[260px]">RFQ match score (0-100). Higher = better alignment with your preferences & historical success.</p></TooltipContent></Tooltip></TooltipProvider>
                    <span className="text-xs font-mono text-muted-foreground">{r.requestId}</span>
                    {r.alreadyBid && <Badge variant="outline" className="text-[0.6rem] text-emerald-400 border-emerald-500/30">Already Bid</Badge>}
                  </div>
                  <p className="text-sm font-semibold">{r.request?.borrower?.legalName}</p>
                  <p className="text-[0.65rem] text-muted-foreground font-mono">{r.request?.borrower?.gtid}</p>
                  <div className="grid grid-cols-4 gap-2 mt-2 text-xs">
                    <div><p className="text-[0.6rem] text-muted-foreground">Amount</p><p className="font-semibold">{fmtUsd(r.request?.amountUsd)}</p></div>
                    <div><p className="text-[0.6rem] text-muted-foreground">Type</p><p className="font-medium">{r.request?.financingType?.replace(/_/g, " ")}</p></div>
                    <div><p className="text-[0.6rem] text-muted-foreground">Tenor</p><p className="font-medium">{r.request?.tenorDays}d</p></div>
                    <div><p className="text-[0.6rem] text-muted-foreground">Credit Score</p><p className="font-semibold" style={{ color: creditColor(r.request?.creditScore || 0) }}>{r.request?.creditScore || "—"}/100</p></div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 w-44">
                  <div className="text-right">
                    <p className="text-[0.6rem] text-muted-foreground">Window closes</p>
                    <p className="text-xs font-mono text-amber-400">{fmtCountdown(r.request?.biddingWindowEndsAt)}</p>
                  </div>
                  <Button size="sm" className="bg-gold-gradient text-sovereign h-7 w-full" onClick={() => setDetail(r)}>
                    <Eye className="w-3 h-3 mr-1" /> View Details
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {detail && <RfqDetailModal rfq={detail} financierGtid={tenantGtid!} onClose={() => setDetail(null)} onBidSubmitted={() => { setDetail(null); setRefreshKey(k => k + 1); toast.success("Bid submitted (encrypted). Borrower will see after window closes."); }} />}
    </div>
  );
}

function RfqDetailModal({ rfq, financierGtid, onClose, onBidSubmitted }: { rfq: any; financierGtid: string; onClose: () => void; onBidSubmitted: () => void }) {
  const [tab, setTab] = useState("overview");
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [bidForm, setBidForm] = useState({
    amountOffered: rfq.request?.amountUsd || 0,
    apr: 5.0,
    settlementMethod: rfq.request?.preferredSettlement || "BANK_TRANSFER",
    collateralRequired: rfq.request?.collateralType || "GOODS",
    conditions: "",
    noteToBorrower: "",
    isDeFi: false,
    deFiProtocol: "",
  });
  const [protocols, setProtocols] = useState<any[]>([]);
  const [defiBullets, setDefiBullets] = useState<string[] | null>(null);
  const [defiAcked, setDefiAcked] = useState(false);
  const [defiLoading, setDefiLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/sgtx/financing/rfq/${rfq.request.id}?financierGtid=${financierGtid}&includeAi=true`)
      .then(r => r.json())
      .then(d => setDetail(d))
      .catch(() => {/* ignore */})
      .finally(() => setLoading(false));
    fetch("/api/sgtx/financing/defi-protocols").then(r => r.json()).then(d => setProtocols(d.protocols || [])).catch(() => {});
  }, [rfq.request.id, financierGtid]);

  const loadDefi = async () => {
    setDefiLoading(true);
    try {
      const r = await jfetch(`/api/sgtx/financing/defi-risk-summary?stablecoin=USDC&protocol=${bidForm.deFiProtocol || "AAVE_V3"}&healthFactor=2.0&collateralType=${bidForm.collateralRequired}`);
      setDefiBullets(r.bullets);
    } catch (e: any) { toast.error(e.message); }
    finally { setDefiLoading(false); }
  };

  const ackDefi = async () => {
    try {
      await jfetch("/api/sgtx/financing/defi-risk-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ financierGtid, language: "en", protocol: bidForm.deFiProtocol, stablecoin: "USDC" }),
      });
      setDefiAcked(true);
      toast.success("DeFi risk acknowledged. You may now submit a DeFi bid.");
    } catch (e: any) { toast.error(e.message); }
  };

  const submit = async () => {
    if (bidForm.isDeFi && !defiAcked) { toast.error("Acknowledge DeFi risk first"); return; }
    setSubmitting(true);
    try {
      await jfetch("/api/sgtx/financing/bid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: rfq.request.id,
          financierGtid,
          amountOffered: +bidForm.amountOffered,
          apr: +bidForm.apr,
          settlementMethod: bidForm.settlementMethod,
          collateralRequired: bidForm.collateralRequired,
          conditions: bidForm.conditions,
          noteToBorrower: bidForm.noteToBorrower,
          isDeFi: bidForm.isDeFi,
          deFiProtocol: bidForm.isDeFi ? bidForm.deFiProtocol : null,
          defiRiskAcknowledgedAt: defiAcked ? new Date().toISOString() : null,
        }),
      });
      onBidSubmitted();
    } catch (e: any) { toast.error(e.message); }
    finally { setSubmitting(false); }
  };

  if (loading) return <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent><div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div></DialogContent></Dialog>;

  const req = detail?.request || rfq.request;
  const trade = detail?.trade;
  const borrower = detail?.borrower;
  const documents = detail?.documents || [];
  const historical = detail?.historical;
  const creditIntel = detail?.creditIntelligence;
  const aiSummary = detail?.aiRiskSummary;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">RFQ Full Disclosure — {rfq.requestId}</DialogTitle>
          <DialogDescription>Read-only · Confidentiality agreement in your MSA applies · Cannot be exported</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-6 w-full">
            <TabsTrigger value="overview" className="text-[0.7rem]">Trade</TabsTrigger>
            <TabsTrigger value="parties" className="text-[0.7rem]">Parties</TabsTrigger>
            <TabsTrigger value="docs" className="text-[0.7rem]">Docs</TabsTrigger>
            <TabsTrigger value="history" className="text-[0.7rem]">History</TabsTrigger>
            <TabsTrigger value="credit" className="text-[0.7rem]">Credit AI</TabsTrigger>
            <TabsTrigger value="bid" className="text-[0.7rem]">Submit Bid</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-2 mt-3">
            {trade && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded bg-muted/30"><p className="text-[0.6rem] text-muted-foreground">USTN</p><p className="font-mono text-[0.7rem]">{trade.ustn}</p></div>
                <div className="p-2 rounded bg-muted/30"><p className="text-[0.6rem] text-muted-foreground">Commodity (HS)</p><p className="font-medium">{trade.commodity} · {trade.commodityHs}</p></div>
                <div className="p-2 rounded bg-muted/30"><p className="text-[0.6rem] text-muted-foreground">Total Trade Value</p><p className="font-semibold">{fmtUsd(trade.tradeValueUsd)}</p></div>
                <div className="p-2 rounded bg-muted/30"><p className="text-[0.6rem] text-muted-foreground">Incoterm</p><p className="font-medium">{trade.incoterm}</p></div>
                <div className="p-2 rounded bg-muted/30"><p className="text-[0.6rem] text-muted-foreground">Route</p><p className="font-medium text-[0.7rem]">{trade.originPort} → {trade.destPort}</p></div>
                <div className="p-2 rounded bg-muted/30"><p className="text-[0.6rem] text-muted-foreground">Cold Chain</p><p className="font-medium">{trade.coldChain ? "Yes (-18°C)" : "No"}</p></div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="parties" className="space-y-2 mt-3">
            {trade && (
              <div className="grid grid-cols-2 gap-3">
                {[{ label: "Buyer", t: trade.buyer }, { label: "Seller", t: trade.seller }].map(({ label, t }: any) => (
                  <Card key={label} className="p-3">
                    <p className="text-[0.65rem] text-muted-foreground uppercase">{label}</p>
                    <p className="text-sm font-semibold">{t?.legalName}</p>
                    <p className="text-[0.65rem] font-mono text-muted-foreground">{t?.gtid}</p>
                    <div className="grid grid-cols-2 gap-1 mt-2 text-xs">
                      <div><p className="text-[0.6rem] text-muted-foreground">Jurisdiction</p><p>{t?.country}</p></div>
                      <div><p className="text-[0.6rem] text-muted-foreground">Trust Score</p><p className="font-semibold">{t?.trustScore}/100</p></div>
                      <div><p className="text-[0.6rem] text-muted-foreground">KYB Tier</p><p>{t?.kybTier}</p></div>
                      <div><p className="text-[0.6rem] text-muted-foreground">Sanctions</p><p className={t?.sanctionsCleared ? "text-emerald-400" : "text-red-400"}>{t?.sanctionsCleared ? "Cleared ✓" : "Pending"}</p></div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="docs" className="mt-3">
            <div className="space-y-1.5">
              {documents.length === 0 ? <p className="text-xs text-muted-foreground py-4">No documents.</p> : documents.map((d: any) => (
                <div key={d.id} className="flex items-center gap-2 p-2 rounded bg-muted/20 text-xs">
                  <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="flex-1 truncate">{d.title}</span>
                  <Badge variant="outline" className="text-[0.6rem]">{d.type.replace(/_/g, " ")}</Badge>
                  <Badge variant="outline" className="text-[0.6rem]" style={{ color: statusColor(d.status) }}>{d.status}</Badge>
                  <span className="text-[0.6rem] text-muted-foreground">{d.fileSizeKb}kb</span>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="history" className="space-y-2 mt-3">
            {historical && (
              <Card className="p-3">
                <p className="text-xs font-semibold mb-2">Borrower Historical Performance — {borrower?.legalName}</p>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div><p className="text-[0.6rem] text-muted-foreground">Total Trades</p><p className="font-semibold">{historical.totalTrades}</p></div>
                  <div><p className="text-[0.6rem] text-muted-foreground">Settled</p><p className="font-semibold">{historical.settledTrades}</p></div>
                  <div><p className="text-[0.6rem] text-muted-foreground">Total Value</p><p className="font-semibold">{fmtUsd(historical.totalTradeValue)}</p></div>
                  <div><p className="text-[0.6rem] text-muted-foreground">Dispute Rate</p><p className="font-semibold">{(historical.disputeRate * 100).toFixed(1)}%</p></div>
                  <div><p className="text-[0.6rem] text-muted-foreground">Avg Health</p><p className="font-semibold">{historical.avgHealthScore}/100</p></div>
                  <div><p className="text-[0.6rem] text-muted-foreground">On-time Repay</p><p className="font-semibold">{historical.financing.onTimeRepayments}</p></div>
                </div>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="credit" className="space-y-2 mt-3">
            {creditIntel && (
              <>
                <Card className="p-3 border-amber-500/30 bg-amber-500/5">
                  <div className="flex items-center gap-2 mb-2"><Sparkles className="w-3.5 h-3.5 text-amber-400" /><p className="text-xs font-semibold">AI Credit Intelligence (A2)</p></div>
                  <div className="grid grid-cols-3 gap-3 text-xs mb-2">
                    <div><p className="text-[0.6rem] text-muted-foreground">Credit Score</p><p className="font-bold text-lg" style={{ color: creditColor(creditIntel.creditScore) }}>{creditIntel.creditScore}</p></div>
                    <div><p className="text-[0.6rem] text-muted-foreground">Default Probability</p><p className="font-bold text-lg">{creditIntel.defaultProbability}%</p></div>
                    <div><p className="text-[0.6rem] text-muted-foreground">Recommended LTV</p><p className="font-bold text-lg text-amber-400">{creditIntel.recommendedLtv}%</p></div>
                  </div>
                  {aiSummary && <p className="text-[0.7rem] italic text-muted-foreground">{aiSummary}</p>}
                </Card>
                <Card className="p-3">
                  <p className="text-xs font-semibold mb-2">Signals Breakdown</p>
                  <pre className="text-[0.65rem] text-muted-foreground whitespace-pre-wrap overflow-x-auto max-h-48">{JSON.stringify(creditIntel.signals, null, 2)}</pre>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="bid" className="space-y-3 mt-3">
            <Card className="p-3">
              <p className="text-xs font-semibold mb-2">Submit Bid</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Amount Offered (USD)</Label>
                  <Input type="number" value={bidForm.amountOffered} onChange={(e) => setBidForm({ ...bidForm, amountOffered: +e.target.value })} className="h-9" />
                  <p className="text-[0.6rem] text-muted-foreground mt-0.5">Portion of {fmtUsd(rfq.request.amountUsd)}. Default 100% — adjust for co-financing tranche.</p>
                </div>
                <div>
                  <Label className="text-xs">APR (All-In Cost) %</Label>
                  <Input type="number" step="0.1" value={bidForm.apr} onChange={(e) => setBidForm({ ...bidForm, apr: +e.target.value })} className="h-9" />
                  <p className="text-[0.6rem] text-muted-foreground mt-0.5">Market avg: 5.0%. Deviation &gt;50% triggers warning.</p>
                </div>
                <div>
                  <Label className="text-xs">Settlement Method</Label>
                  <Select value={bidForm.settlementMethod} onValueChange={(v) => setBidForm({ ...bidForm, settlementMethod: v })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{SETTLEMENTS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Collateral Required</Label>
                  <Select value={bidForm.collateralRequired} onValueChange={(v) => setBidForm({ ...bidForm, collateralRequired: v })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{COLLATERALS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Conditions (optional)</Label>
                  <Input value={bidForm.conditions} onChange={(e) => setBidForm({ ...bidForm, conditions: e.target.value })} className="h-9" placeholder="e.g. Monthly repayments" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Note to Borrower (optional)</Label>
                  <Textarea value={bidForm.noteToBorrower} onChange={(e) => setBidForm({ ...bidForm, noteToBorrower: e.target.value })} className="min-h-[50px]" placeholder="e.g. Standard pre-shipment facility" />
                </div>
              </div>

              <div className="mt-3 p-2 rounded bg-muted/30 border border-border">
                <div className="flex items-center justify-between">
                  <Label className="text-xs flex items-center gap-2"><Zap className="w-3.5 h-3.5 text-amber-400" /> Use DeFi Protocol</Label>
                  <Switch checked={bidForm.isDeFi} onCheckedChange={(c) => { setBidForm({ ...bidForm, isDeFi: c }); if (!c) { setDefiAcked(false); setDefiBullets(null); } }} />
                </div>
                {bidForm.isDeFi && (
                  <div className="mt-2 space-y-2">
                    <Select value={bidForm.deFiProtocol} onValueChange={(v) => { setBidForm({ ...bidForm, deFiProtocol: v }); setDefiAcked(false); setDefiBullets(null); }}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Select protocol" /></SelectTrigger>
                      <SelectContent>{protocols.map(p => <SelectItem key={p.name} value={p.name}>{p.displayName} (Risk {p.riskScore}/100 · {p.actionability.color})</SelectItem>)}</SelectContent>
                    </Select>
                    {bidForm.deFiProtocol && (
                      <>
                        <Button size="sm" variant="outline" className="h-7 w-full" onClick={loadDefi} disabled={defiLoading}>
                          {defiLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <AlertTriangle className="w-3 h-3 mr-1" />}
                          View DeFi Plain-Language Risk Summary (Mandatory)
                        </Button>
                        {defiBullets && (
                          <div className="p-2 rounded bg-amber-500/5 border border-amber-500/30">
                            <p className="text-[0.7rem] font-semibold mb-1">⚠ DeFi Risks (read before proceeding):</p>
                            <ul className="text-[0.7rem] space-y-1 text-muted-foreground">
                              {defiBullets.map((b, i) => <li key={i}>• {b}</li>)}
                            </ul>
                            {!defiAcked ? (
                              <Button size="sm" className="bg-gold-gradient text-sovereign h-7 w-full mt-2" onClick={ackDefi}><CheckCircle2 className="w-3 h-3 mr-1" /> I understand</Button>
                            ) : (
                              <p className="text-[0.7rem] text-emerald-400 mt-1">✓ Acknowledged</p>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </Card>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button className="bg-gold-gradient text-sovereign" onClick={submit} disabled={submitting || (bidForm.isDeFi && !defiAcked)}>
                {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
                Submit Encrypted Bid
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// 3. FINANCIER PORTFOLIO SCREEN
// ============================================================
export function FinancierPortfolioScreen({ initialTab = "bids", title, subtitle }: { initialTab?: string; title?: string; subtitle?: string }) {
  const tenantGtid = useTenantGtid();
  const [bids, setBids] = useState<any[]>([]);
  const [repayments, setRepayments] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [stablecoins, setStablecoins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [disburseModal, setDisburseModal] = useState<any | null>(null);

  useEffect(() => {
    if (!tenantGtid) return;
    setTimeout(() => setLoading(true), 0);
    Promise.all([
      jfetch(`/api/sgtx/dashboard?tenant=${tenantGtid}`).catch(() => ({ financingBids: [] })),
      jfetch(`/api/sgtx/financing/repay?financierGtid=${tenantGtid}`).catch(() => ({ repayments: [] })),
      jfetch(`/api/sgtx/financing/liquidation-alerts?financierGtid=${tenantGtid}`).catch(() => ({ positions: [] })),
      jfetch(`/api/sgtx/financing/stablecoin-status`).catch(() => ({ stablecoins: [] })),
    ]).then(([d, r, p, s]) => {
      setBids(d.financingBids || []);
      setRepayments(r.repayments || []);
      setPositions(p.positions || []);
      setStablecoins(s.stablecoins || []);
    }).finally(() => setLoading(false));
  }, [tenantGtid, refreshKey]);

  const totalExposure = bids.filter(b => b.status === "ACCEPTED").reduce((s, b) => s + b.amountUsd, 0);
  const activeLoans = bids.filter(b => b.status === "ACCEPTED").length;
  const pendingBids = bids.filter(b => b.status === "SUBMITTED").length;
  const avgApr = bids.length > 0 ? (bids.reduce((s, b) => s + b.apr, 0) / bids.length).toFixed(2) : "—";

  // Accepted annexes with disbursable status
  const disbursable = bids.filter(b => b.status === "ACCEPTED" && b.request?.agreements?.some((a: any) => a.annexes?.some((an: any) => an.financierGtid === tenantGtid && an.financierSignedAt && !an.disbursedAt)));

  return (
    <div className="space-y-4">
      <SectionHeader title={title || "My Bids & Active Loans"} subtitle={subtitle || "Co-financing · PSP split disbursement · Automated repayment monitoring"} action={<Button size="sm" variant="outline" onClick={() => setRefreshKey(k => k + 1)}><Activity className="w-3.5 h-3.5 mr-1.5" />Refresh</Button>} />

      <ExecutiveCards cards={[
        { label: "Total Exposure", value: fmtUsd(totalExposure), icon: DollarSign, accent: "#fbbf24" },
        { label: "Active Loans", value: String(activeLoans), icon: Banknote, accent: "#10b981" },
        { label: "Pending Bids", value: String(pendingBids), icon: Clock, accent: "#60a5fa" },
        { label: "Avg APR", value: `${avgApr}%`, icon: TrendingUp, accent: "#a78bfa" },
      ]} />

      {/* Stablecoin peg status (always visible) */}
      {stablecoins.length > 0 && (
        <Card className="p-3">
          <p className="text-xs font-semibold mb-2 flex items-center gap-1.5"><Coins className="w-3.5 h-3.5 text-amber-400" /> Stablecoin Peg Status</p>
          <div className="grid grid-cols-3 gap-2">
            {stablecoins.map((s: any) => (
              <div key={s.symbol} className="p-2 rounded bg-muted/20">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-semibold">{s.symbol}</span>
                  <Badge variant="outline" className="text-[0.6rem]" style={{ color: s.action.alertLevel === "OK" ? "#10b981" : s.action.alertLevel === "WARNING" ? "#fbbf24" : "#f87171" }}>{s.action.alertLevel}</Badge>
                </div>
                <p className="text-[0.65rem] text-muted-foreground">Deviation: {s.deviationPct}%</p>
                {s.action.alertLevel !== "OK" && <p className="text-[0.6rem] text-amber-400 mt-0.5">{s.action.notice}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Tabs defaultValue={initialTab}>
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="bids" className="text-xs">Bids ({bids.length})</TabsTrigger>
          <TabsTrigger value="disbursable" className="text-xs">Disbursement Ready ({disbursable.length})</TabsTrigger>
          <TabsTrigger value="repayments" className="text-xs">Repayments ({repayments.length})</TabsTrigger>
          <TabsTrigger value="defi" className="text-xs">DeFi Positions ({positions.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="bids" className="mt-3 space-y-2">
          {bids.length === 0 ? <Card className="p-8 text-center text-sm text-muted-foreground">No bids submitted yet. Visit Financing Opportunities to see open RFQs.</Card> : bids.map((b: any) => (
            <div key={b.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/20 border border-border">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium">{b.request?.borrower?.legalName}</p>
                <p className="text-[0.6rem] text-muted-foreground">{fmtUsd(b.amountUsd)} @ {b.apr}% APR · {b.isDeFi ? `DeFi (${b.request?.purpose?.replace(/_/g, " ") || ""})` : "Traditional"} · {b.bidId || b.id.slice(-8)}</p>
              </div>
              <Badge variant="outline" className="text-[0.6rem]" style={{ color: statusColor(b.status), borderColor: `${statusColor(b.status)}55` }}>{b.status}</Badge>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="disbursable" className="mt-3 space-y-2">
          {disbursable.length === 0 ? <Card className="p-8 text-center text-sm text-muted-foreground">No annexes awaiting disbursement.</Card> : disbursable.map((b: any) => {
            const ann = b.request?.agreements?.[0]?.annexes?.find((a: any) => a.financierGtid === tenantGtid);
            if (!ann) return null;
            return (
              <Card key={b.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold">{b.request?.borrower?.legalName}</p>
                    <p className="text-[0.65rem] text-muted-foreground">Annex {ann.id.slice(-8)} · {fmtUsd(ann.amountFinanced)} @ {ann.apr}%</p>
                    <p className="text-[0.65rem] text-amber-400 mt-1">Fee (0.25%): {fmtUsd(ann.feeUsd)} · Borrower receives: {fmtUsd(ann.borrowerNetProceeds)}</p>
                  </div>
                  <Button size="sm" className="bg-gold-gradient text-sovereign h-7" onClick={() => setDisburseModal({ bid: b, annex: ann })}>
                    <DollarSign className="w-3 h-3 mr-1" /> Disburse
                  </Button>
                </div>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="repayments" className="mt-3 space-y-2">
          {repayments.length === 0 ? <Card className="p-8 text-center text-sm text-muted-foreground">No repayments detected yet (PSP webhook / OpenBanking / onchain monitoring active).</Card> : repayments.map((r: any) => (
            <div key={r.id} className="flex items-center justify-between p-2 rounded bg-muted/20 text-xs">
              <div>
                <p className="font-medium">{fmtUsd(r.amountUsd)}</p>
                <p className="text-[0.6rem] text-muted-foreground">{r.request?.borrower?.legalName} · {r.method} · {new Date(r.repaidAt).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[0.6rem]">{r.detectedVia.replace(/_/g, " ")}</Badge>
                <Badge variant="outline" className="text-[0.6rem]" style={{ color: statusColor(r.status) }}>{r.status}</Badge>
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="defi" className="mt-3 space-y-2">
          {positions.length === 0 ? <Card className="p-8 text-center text-sm text-muted-foreground">No active DeFi positions.</Card> : positions.map((p: any) => (
            <Card key={p.id} className={`p-3 ${p.riskAssessment?.status === "LIQUIDATION_RISK" ? "border-red-500/40 bg-red-500/5" : p.riskAssessment?.status === "WARNING" ? "border-amber-500/40 bg-amber-500/5" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold">{p.protocolName}</span>
                    <Badge variant="outline" className="text-[0.6rem]" style={{ color: p.riskAssessment?.status === "ACTIVE" ? "#10b981" : p.riskAssessment?.status === "WARNING" ? "#fbbf24" : "#f87171" }}>{p.riskAssessment?.status}</Badge>
                  </div>
                  <p className="text-[0.65rem] text-muted-foreground">Debt: {fmtUsd(p.debtUsd)} · Collateral: {fmtUsd(p.collateralUsd)}</p>
                  <div className="grid grid-cols-2 gap-2 mt-1 text-xs">
                    <div><p className="text-[0.6rem] text-muted-foreground">Health Factor</p><p className={`font-bold ${p.healthFactor < 1.5 ? "text-amber-400" : "text-emerald-400"}`}>{p.healthFactor.toFixed(2)}</p></div>
                    <div><p className="text-[0.6rem] text-muted-foreground">Predicted 24h</p><p className={`font-bold ${p.predictedHealth24h < 1.5 ? "text-red-400" : "text-emerald-400"}`}>{p.predictedHealth24h?.toFixed(2)}</p></div>
                  </div>
                  {p.aiAdvice && <p className="text-[0.7rem] text-amber-400 mt-2 flex items-start gap-1"><Sparkles className="w-3 h-3 mt-0.5 flex-shrink-0" /> {p.aiAdvice}</p>}
                </div>
                <div className="flex flex-col gap-1">
                  <Button size="sm" variant="outline" className="h-7 text-[0.7rem]"><Coins className="w-3 h-3 mr-1" /> Add Collateral</Button>
                  <Button size="sm" variant="outline" className="h-7 text-[0.7rem]"><DollarSign className="w-3 h-3 mr-1" /> Repay</Button>
                </div>
              </div>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      {disburseModal && (
        <DisburseModal annex={disburseModal.annex} bid={disburseModal.bid} financierGtid={tenantGtid!} onClose={() => setDisburseModal(null)} onDisbursed={() => { setDisburseModal(null); setRefreshKey(k => k + 1); toast.success("Disbursement complete — PSP split executed."); }} />
      )}
    </div>
  );
}

function DisburseModal({ annex, bid, financierGtid, onClose, onDisbursed }: { annex: any; bid: any; financierGtid: string; onClose: () => void; onDisbursed: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const disburse = async () => {
    setSubmitting(true);
    try {
      const r = await jfetch("/api/sgtx/financing/disburse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annexId: annex.id, financierGtid }),
      });
      setResult(r);
      toast.success("Disbursement executed");
    } catch (e: any) { toast.error(e.message); }
    finally { setSubmitting(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Disburse Funds — PSP Split</DialogTitle>
          <DialogDescription>One click · Non-custodial FeeLock · Real-time split</DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="space-y-2">
            <div className="p-3 rounded bg-emerald-500/10 border border-emerald-500/30 text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-1" />
              <p className="text-sm font-semibold">Disbursed Successfully</p>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between p-2 rounded bg-muted/30"><span className="text-muted-foreground">Financier pays:</span><span className="font-semibold">{fmtUsd(annex.amountFinanced)}</span></div>
              <div className="flex justify-between p-2 rounded bg-muted/30"><span className="text-muted-foreground">SGTX fee (0.25%):</span><span className="font-semibold text-amber-400">−{fmtUsd(annex.feeUsd)}</span></div>
              <div className="flex justify-between p-2 rounded bg-emerald-500/10 border border-emerald-500/30"><span className="text-muted-foreground">Borrower receives:</span><span className="font-bold text-emerald-400">{fmtUsd(annex.borrowerNetProceeds)}</span></div>
              <div className="text-[0.65rem] text-muted-foreground mt-2">PSP Reference: <span className="font-mono">{result.pspReference}</span></div>
            </div>
            <Button className="bg-gold-gradient text-sovereign w-full" onClick={onDisbursed}>Done</Button>
          </div>
        ) : (
          <>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between p-2 rounded bg-muted/30"><span className="text-muted-foreground">Disbursement Amount:</span><span className="font-semibold">{fmtUsd(annex.amountFinanced)}</span></div>
              <div className="flex justify-between p-2 rounded bg-muted/30"><span className="text-muted-foreground">SGTX Fee (0.25%):</span><span className="font-semibold text-amber-400">{fmtUsd(annex.feeUsd)}</span></div>
              <div className="flex justify-between p-2 rounded bg-emerald-500/10 border border-emerald-500/30"><span className="text-muted-foreground">Borrower Net Proceeds:</span><span className="font-bold text-emerald-400">{fmtUsd(annex.borrowerNetProceeds)}</span></div>
            </div>
            <p className="text-[0.65rem] text-muted-foreground italic">PSP will split in real-time. Borrower sees net amount. Both legs confirmed via webhooks.</p>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button className="bg-gold-gradient text-sovereign" onClick={disburse} disabled={submitting}>
                {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <DollarSign className="w-3.5 h-3.5 mr-1" />}
                Disburse {fmtUsd(annex.amountFinanced)}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// 4. FINANCIER PREFERENCES SCREEN (NEW)
// ============================================================
export function FinancierPreferencesScreen() {
  const tenantGtid = useTenantGtid();
  const [pref, setPref] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tenantGtid) return;
    fetch(`/api/sgtx/financing/preferences?financierGtid=${tenantGtid}`)
      .then(r => r.json())
      .then(d => setPref(d.preference))
      .catch(() => {/* ignore */})
      .finally(() => setLoading(false));
  }, [tenantGtid]);

  const update = (patch: any) => setPref((p: any) => ({ ...p, ...patch }));

  const toggleInArray = (arr: string[], val: string) => arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];

  const save = async () => {
    setSaving(true);
    try {
      await jfetch("/api/sgtx/financing/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ financierGtid: tenantGtid, ...pref }),
      });
      toast.success("Preferences saved");
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  if (loading || !pref) return <Card className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></Card>;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Financier Preferences"
        subtitle="Auto-RFQ matching criteria · Non-marketplace (we never show your name to borrowers who don't already know you)"
        action={<Button size="sm" className="bg-gold-gradient text-sovereign" onClick={save} disabled={saving}>{saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />} Save Preferences</Button>}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Borrower countries */}
        <Card className="p-4">
          <p className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Globe2 className="w-3.5 h-3.5 text-gold" /> Accepted Borrower Countries</p>
          <p className="text-[0.65rem] text-muted-foreground mb-2">Only borrowers incorporated in these countries will see your bid windows.</p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {(pref.acceptedBorrowerCountries || []).map((c: string) => (
              <Badge key={c} variant="outline" className="text-[0.7rem] cursor-pointer" onClick={() => update({ acceptedBorrowerCountries: pref.acceptedBorrowerCountries.filter((x: string) => x !== c) })}>{c} ✕</Badge>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {COUNTRIES.filter(c => !(pref.acceptedBorrowerCountries || []).includes(c)).slice(0, 8).map(c => (
              <Button key={c} size="sm" variant="outline" className="h-6 text-[0.65rem]" onClick={() => update({ acceptedBorrowerCountries: [...(pref.acceptedBorrowerCountries || []), c] })}>+ {c}</Button>
            ))}
          </div>
        </Card>

        {/* Risk thresholds */}
        <Card className="p-4">
          <p className="text-sm font-semibold mb-3 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-gold" /> Risk Thresholds</p>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between text-xs mb-1"><span>Min Trust Score</span><span className="font-bold text-gold">{pref.minTrustScore}</span></div>
              <Slider value={[pref.minTrustScore]} min={50} max={100} step={1} onValueChange={([v]) => update({ minTrustScore: v })} />
            </div>
            <div>
              <Label className="text-xs">Min Trade Value (USD)</Label>
              <Input type="number" value={pref.minTradeValue} onChange={(e) => update({ minTradeValue: +e.target.value })} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Max Financed Per Request (USD)</Label>
              <Input type="number" value={pref.maxFinancedPerRequest} onChange={(e) => update({ maxFinancedPerRequest: +e.target.value })} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Min Tranche Size (USD)</Label>
              <Input type="number" value={pref.minTrancheSize} onChange={(e) => update({ minTrancheSize: +e.target.value })} className="h-8 text-xs" />
            </div>
          </div>
        </Card>

        {/* Financing types & settlement */}
        <Card className="p-4">
          <p className="text-sm font-semibold mb-3 flex items-center gap-1.5"><Banknote className="w-3.5 h-3.5 text-gold" /> Financing Types & Settlement</p>
          <div className="mb-3">
            <p className="text-xs font-semibold mb-1.5">Preferred Financing Types</p>
            <div className="space-y-1.5">
              {FINANCING_TYPES.map(t => (
                <div key={t.value} className="flex items-center gap-2">
                  <Checkbox checked={(pref.preferredFinancingTypes || []).includes(t.value)} onCheckedChange={() => update({ preferredFinancingTypes: toggleInArray(pref.preferredFinancingTypes || [], t.value) })} />
                  <span className="text-xs">{t.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold mb-1.5">Preferred Settlement Methods</p>
            <div className="space-y-1.5">
              {SETTLEMENTS.map(s => (
                <div key={s.value} className="flex items-center gap-2">
                  <Checkbox checked={(pref.preferredSettlementMethods || []).includes(s.value)} onCheckedChange={() => update({ preferredSettlementMethods: toggleInArray(pref.preferredSettlementMethods || [], s.value) })} />
                  <span className="text-xs">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* DeFi + Geographic + Notifications */}
        <Card className="p-4">
          <p className="text-sm font-semibold mb-3 flex items-center gap-1.5"><Settings className="w-3.5 h-3.5 text-gold" /> DeFi · Geographic · Notifications</p>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Enable DeFi Bids</Label>
              <Switch checked={pref.enableDeFi} onCheckedChange={(c) => update({ enableDeFi: c })} />
            </div>
            <div>
              <Label className="text-xs">Default APR Benchmark (%)</Label>
              <Input type="number" step="0.1" value={pref.defaultAprBenchmark} onChange={(e) => update({ defaultAprBenchmark: +e.target.value })} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Geographic Mode</Label>
              <Select value={pref.geographicMode} onValueChange={(v) => update({ geographicMode: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All countries (subject to accepted list)</SelectItem>
                  <SelectItem value="ACCEPT_ONLY">Accept only listed</SelectItem>
                  <SelectItem value="ALL_EXCEPT">All except listed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Smart Inbox Notifications</Label>
              <Switch checked={pref.notificationsEnabled} onCheckedChange={(c) => update({ notificationsEnabled: c })} />
            </div>
            <div>
              <Label className="text-xs">Webhook URL (optional)</Label>
              <Input value={pref.webhookUrl || ""} onChange={(e) => update({ webhookUrl: e.target.value })} placeholder="https://…" className="h-8 text-xs" />
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-3 bg-amber-500/5 border-amber-500/30">
        <p className="text-xs text-amber-400 flex items-start gap-2"><Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> SGTX is a non-marketplace platform. These preferences filter which borrower RFQs reach your Smart Inbox — they never broadcast your name to borrowers you haven't already worked with.</p>
      </Card>
    </div>
  );
}

// ============================================================================
// FinancedTradesScreen — Blueprint §3.14.3.4 "Full Disclosure to Financiers"
// Shows the financier all trades they have financed or bid on, with full
// visibility into trade details, shipments, documents, milestones, and
// collateral status. This is the "key trust advantage" of SGTX trade finance.
// ============================================================================

interface FinancedTradeRow {
  ustn: string;
  status: string;
  phase: number;
  commodity?: string;
  incoterm?: string;
  totalValue?: number;
  currency?: string;
  financedAmount?: number;
  financedPct?: number;
  ltv?: number;
  healthScore?: number;
  buyer?: { legalName?: string; gtid?: string; trustScore?: number };
  seller?: { legalName?: string; gtid?: string; trustScore?: number };
  shipments?: any[];
  documents?: any[];
  milestones?: any[];
}

export function FinancedTradesScreen({ data }: { data?: any }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "disbursed" | "repaid" | "defaulted">("all");
  const openTcc = useAppStore((s) => s.openTcc);
  const setUstnContext = useAppStore((s) => s.setUstnContext);

  // Build the financed-trades list from the dashboard's financingBids data.
  // Each bid is linked to a financing request, which is linked to a trade.
  const financedTrades: FinancedTradeRow[] = useMemo(() => {
    const bids = Array.isArray(data?.financingBids) ? data.financingBids : [];
    const seen = new Set<string>();
    const rows: FinancedTradeRow[] = [];
    for (const bid of bids) {
      const trade = bid?.request?.trade;
      if (!trade?.ustn || seen.has(trade.ustn)) continue;
      seen.add(trade.ustn);
      rows.push({
        ustn: trade.ustn,
        status: trade.status || "UNKNOWN",
        phase: trade.phase || 0,
        commodity: trade.commodity,
        incoterm: trade.incoterm,
        totalValue: trade.totalValue,
        currency: trade.currency || "USD",
        financedAmount: bid?.request?.requestedAmount,
        financedPct: bid?.request?.requestedAmount && trade?.totalValue
          ? Math.round((bid.request.requestedAmount / trade.totalValue) * 100)
          : undefined,
        ltv: bid?.ltv,
        healthScore: trade.healthScore,
        buyer: trade.buyer,
        seller: trade.seller,
        shipments: trade.shipments,
        documents: trade.documents,
        milestones: trade.milestones,
      });
    }
    return rows;
  }, [data]);

  const filtered = useMemo(() => {
    let list = financedTrades;
    if (filter === "active") {
      list = list.filter((t) => ["IN_EXECUTION", "CONTRACT_SIGNED", "DELIVERED"].includes(t.status));
    } else if (filter === "disbursed") {
      list = list.filter((t) => t.financedAmount && t.financedAmount > 0);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) =>
        t.ustn?.toLowerCase().includes(q) ||
        t.commodity?.toLowerCase().includes(q) ||
        t.buyer?.legalName?.toLowerCase().includes(q) ||
        t.seller?.legalName?.toLowerCase().includes(q) ||
        t.status?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [financedTrades, filter, search]);

  const totalFinanced = financedTrades.reduce((sum, t) => sum + (t.financedAmount || 0), 0);
  const activeCount = financedTrades.filter((t) => ["IN_EXECUTION", "CONTRACT_SIGNED"].includes(t.status)).length;
  const avgLtv = financedTrades.length > 0
    ? Math.round(financedTrades.reduce((sum, t) => sum + (t.ltv || 0), 0) / financedTrades.length)
    : 0;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Financed Trades — Full Disclosure"
        subtitle="Blueprint §3.14.3.4 · Complete trade details for every trade you finance · collateral = goods in transit"
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">Total Financed</p>
          <p className="text-lg font-bold text-foreground mt-1">{fmtUsd(totalFinanced)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">Active Trades</p>
          <p className="text-lg font-bold text-foreground mt-1">{activeCount}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">Avg LTV</p>
          <p className="text-lg font-bold mt-1" style={{ color: avgLtv > 80 ? "#ef4444" : avgLtv > 60 ? "#f59e0b" : "#10b981" }}>
            {avgLtv}%
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">Trades Visible</p>
          <p className="text-lg font-bold text-foreground mt-1">{financedTrades.length}</p>
        </Card>
      </div>

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by USTN, commodity, party, status…"
          className="flex-1 h-9 text-sm"
        />
        <div className="flex gap-1">
          {(["all", "active", "disbursed"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              className="h-9 text-xs capitalize"
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : f === "active" ? "Active" : "Disbursed"}
            </Button>
          ))}
        </div>
      </div>

      {/* Trades table */}
      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center">
            <Package className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">No financed trades yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              When you bid on and win financing requests, the trades will appear here with full disclosure.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 border-b border-border/50">
                <tr>
                  <th className="text-left p-3 font-semibold text-muted-foreground">USTN</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Commodity</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Parties</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Status</th>
                  <th className="text-right p-3 font-semibold text-muted-foreground">Financed</th>
                  <th className="text-right p-3 font-semibold text-muted-foreground">LTV</th>
                  <th className="text-center p-3 font-semibold text-muted-foreground">Shipments</th>
                  <th className="text-center p-3 font-semibold text-muted-foreground">Docs</th>
                  <th className="text-center p-3 font-semibold text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const ltvColor = (t.ltv || 0) > 80 ? "#ef4444" : (t.ltv || 0) > 60 ? "#f59e0b" : "#10b981";
                  return (
                    <tr key={t.ustn} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                      <td className="p-3">
                        <button
                          onClick={() => {
                            setUstnContext(t.ustn);
                            toast.success("Trade context set", { description: t.ustn });
                          }}
                          className="font-mono text-[0.7rem] text-gold hover:underline"
                          title="Set as active trade context"
                        >
                          {t.ustn}
                        </button>
                      </td>
                      <td className="p-3 text-foreground">
                        <p className="font-medium">{t.commodity || "—"}</p>
                        {t.incoterm && <p className="text-[0.6rem] text-muted-foreground">{t.incoterm}</p>}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        <p className="text-[0.65rem]">{t.buyer?.legalName || "—"}</p>
                        <p className="text-[0.6rem] text-muted-foreground/70">→ {t.seller?.legalName || "—"}</p>
                      </td>
                      <td className="p-3">
                        <Badge
                          variant="outline"
                          className="text-[0.55rem] h-4 px-1"
                          style={{ color: statusColor(t.status), borderColor: `${statusColor(t.status)}55` }}
                        >
                          {(t.status || "").replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="p-3 text-right">
                        {t.financedAmount ? (
                          <>
                            <p className="font-semibold text-foreground">{fmtUsd(t.financedAmount)}</p>
                            {t.financedPct && <p className="text-[0.6rem] text-muted-foreground">{t.financedPct}% of trade</p>}
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {t.ltv ? (
                          <span className="font-semibold" style={{ color: ltvColor }}>{t.ltv}%</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3 text-center text-muted-foreground">
                        {t.shipments?.length || 0}
                      </td>
                      <td className="p-3 text-center text-muted-foreground">
                        {t.documents?.length || 0}
                      </td>
                      <td className="p-3 text-center">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[0.65rem]"
                          onClick={() => openTcc(t.ustn)}
                        >
                          <Eye className="w-3 h-3 mr-1" /> View
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-3 bg-gold/5 border-gold/20">
        <p className="text-xs text-foreground/80 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-gold flex-shrink-0 mt-0.5" />
          <span>
            <strong>Full Disclosure Model (§3.14.3.4):</strong> Financiers see complete trade details —
            buyer/seller names, documents, historical performance, previous financing history, and AI credit
            intelligence — before and after bidding. This builds trust and confidence. All access is audit-logged.
          </span>
        </p>
      </Card>
    </div>
  );
}

