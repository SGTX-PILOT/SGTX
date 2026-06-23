"use client";

// SGTX Phase 6 — Settlement & Payment Orchestration screens (Blueprint 3B.7)
// - BuyerSettlementScreen (trader-buyer "settlement" tab)
// - SellerSettlementScreen (trader-seller "settlement" tab)
// - MonthlyStatementsScreen (trader-buyer/seller "statements" tab)
// - ReconciliationQueueScreen (bank/gov "reconciliation" tab)
// - DeferredFeesScreen (gov "deferred-fees" tab)
// - LatePenaltiesScreen (cross-portal)

import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { SectionHeader, ExecutiveCards } from "@/components/sgtx/widgets";
import { fmtUsd, fmtDate, statusColor } from "@/lib/sgtx/format";
import { useAppStore } from "@/store/app-store";
import { toast } from "sonner";
import {
  Banknote, CheckCircle2, Clock, AlertTriangle, Loader2, Send, Mic, Download,
  ShieldCheck, Activity, DollarSign, FileText, Sparkles, Zap, X, ArrowRight, Coins,
  Gavel, RefreshCw,
} from "lucide-react";

// ============ Helpers ============
function useTenantGtid(): string | null {
  return useAppStore((s) => s.activeTenantGtid);
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

function statusBadge(status: string) {
  const color = status === "CONFIRMED" ? "#10b981" : status === "PENDING_APPROVAL" ? "#fbbf24" : status === "PROCESSING" ? "#60a5fa" : status === "FAILED" || status === "CANCELLED" || status === "FROZEN" ? "#f87171" : "#94a3b8";
  return <Badge variant="outline" className="text-[0.6rem]" style={{ color, borderColor: `${color}55` }}>{status.replace(/_/g, " ")}</Badge>;
}

// ============================================================
// 1. BUYER SETTLEMENT SCREEN
// ============================================================
export function BuyerSettlementScreen() {
  const tenantGtid = useTenantGtid();
  const [instructions, setInstructions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [approveModal, setApproveModal] = useState<any | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);

  const reload = useCallback(() => setRefreshKey(k => k + 1), []);

  useEffect(() => {
    if (!tenantGtid) return;
    setTimeout(() => setLoading(true), 0);
    jfetch(`/api/sgtx/settlement/instructions?tenantGtid=${tenantGtid}&role=payer`)
      .then(d => setInstructions(d.instructions || []))
      .catch(() => setInstructions([]))
      .finally(() => setLoading(false));
  }, [tenantGtid, refreshKey]);

  const pending = instructions.filter(i => i.status === "PENDING_APPROVAL");
  const confirmed = instructions.filter(i => i.status === "CONFIRMED");
  const processing = instructions.filter(i => i.status === "PROCESSING" || i.status === "APPROVED");
  const totalPending = pending.reduce((s, i) => s + i.amountUsd, 0);
  const totalConfirmed = confirmed.reduce((s, i) => s + i.amountUsd, 0);

  if (loading) return <Card className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></Card>;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Settlement & Payment"
        subtitle="Phase 6 · One-click approval · Voice command · PSP router with AI fallback · Milestone-based preapproval"
        action={<div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setVoiceOpen(true)}><Mic className="w-3.5 h-3.5 mr-1.5" />Voice</Button>
          <Button size="sm" variant="outline" onClick={reload}><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh</Button>
        </div>}
      />

      <ExecutiveCards cards={[
        { label: "Pending Approval", value: String(pending.length), sub: fmtUsd(totalPending), icon: Clock, accent: "#fbbf24" },
        { label: "Processing", value: String(processing.length), icon: Activity, accent: "#60a5fa" },
        { label: "Confirmed", value: String(confirmed.length), sub: fmtUsd(totalConfirmed), icon: CheckCircle2, accent: "#10b981" },
        { label: "Total Settled", value: fmtUsd(totalConfirmed), icon: DollarSign, accent: "#a78bfa" },
      ]} />

      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3">Settlement Instructions (Payer)</h3>
        {instructions.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No settlement instructions yet. Instructions are auto-generated when delivery is confirmed (Phase 5) or milestones are reached.</p>
        ) : (
          <div className="space-y-2">
            {instructions.map((inst) => (
              <div key={inst.id} className="p-3 rounded-lg bg-muted/20 border border-border">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="text-xs font-mono font-semibold">{inst.instructionId}</span>
                      {statusBadge(inst.status)}
                      {inst.preapproved && <Badge variant="outline" className="text-[0.55rem] text-purple-400 border-purple-500/30">PREAPPROVED</Badge>}
                      {inst.autoExecute && <Badge variant="outline" className="text-[0.55rem] text-cyan-400 border-cyan-500/30">AUTO</Badge>}
                    </div>
                    <p className="text-[0.65rem] text-muted-foreground font-mono">{inst.ustn.slice(0, 32)}…</p>
                    <p className="text-[0.65rem] text-muted-foreground">{fmtUsd(inst.amountUsd)} · {inst.type.replace(/_/g, " ")} · {inst.milestoneType}</p>
                    {inst.dueDate && <p className="text-[0.65rem] text-muted-foreground">Due: {fmtDate(inst.dueDate)}{inst.daysLate > 0 && <span className="text-red-400 ml-1">· {inst.daysLate}d late · +${inst.lateFeeApplied.toFixed(2)} penalty</span>}</p>}
                    {inst.cancelWindowEndsAt && new Date() < new Date(inst.cancelWindowEndsAt) && (
                      <p className="text-[0.65rem] text-amber-400 mt-0.5">⏱ Cancel window expires: {new Date(inst.cancelWindowEndsAt).toLocaleTimeString()}</p>
                    )}
                    {inst.pspSelected && <p className="text-[0.65rem] text-muted-foreground">PSP: {inst.pspSelected}</p>}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {inst.status === "PENDING_APPROVAL" && (
                      <Button size="sm" className="bg-gold-gradient text-sovereign h-7" onClick={() => setApproveModal(inst)}>
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Approve
                      </Button>
                    )}
                    {inst.status === "APPROVED" && inst.cancelWindowEndsAt && new Date() < new Date(inst.cancelWindowEndsAt) && (
                      <Button size="sm" variant="outline" className="h-7 text-red-400 border-red-500/30" onClick={async () => {
                        try { await jfetch("/api/sgtx/settlement/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instructionId: inst.id, buyerGtid: tenantGtid }) }); toast.success("Payment cancelled"); reload(); } catch (e: any) { toast.error(e.message); }
                      }}><X className="w-3 h-3 mr-1" /> Cancel</Button>
                    )}
                    {inst.status === "CONFIRMED" && inst.reconciliation && (
                      <Badge variant="outline" className="text-[0.6rem] text-emerald-400 border-emerald-500/30"><CheckCircle2 className="w-3 h-3 mr-1" />Reconciled {(inst.reconciliation.confidence * 100).toFixed(0)}%</Badge>
                    )}
                  </div>
                </div>
                {inst.pspAttempts?.length > 0 && (
                  <div className="text-[0.6rem] text-muted-foreground border-t border-border pt-1.5 mt-1.5">
                    PSP attempts: {inst.pspAttempts.map((a: any, i: number) => <span key={i} className="mr-2">{a.pspName}={a.status}{a.pspReference ? ` (${a.pspReference})` : ""}</span>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {approveModal && (
        <ApproveSettlementModal
          instruction={approveModal}
          buyerGtid={tenantGtid!}
          onClose={() => setApproveModal(null)}
          onApproved={() => { setApproveModal(null); reload(); toast.success("Settlement approved — PSP routing initiated."); }}
        />
      )}
      {voiceOpen && <VoiceApprovalModal buyerGtid={tenantGtid!} onClose={() => setVoiceOpen(false)} onResult={reload} />}
    </div>
  );
}

function ApproveSettlementModal({ instruction, buyerGtid, onClose, onApproved }: { instruction: any; buyerGtid: string; onClose: () => void; onApproved: () => void }) {
  const [recommendation, setRecommendation] = useState<any>(null);
  const [selectedPsp, setSelectedPsp] = useState<string>("");
  const [approving, setApproving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    jfetch(`/api/sgtx/settlement/psp-recommend?payerGtid=${buyerGtid}&payeeGtid=${instruction.payeeGtid}&amountUsd=${instruction.amountUsd}&includeAi=true`)
      .then(d => { setRecommendation(d); setSelectedPsp(d.top?.pspName || ""); })
      .catch(() => {/* ignore */})
      .finally(() => setLoading(false));
  }, [buyerGtid, instruction]);

  const approve = async () => {
    setApproving(true);
    try {
      const r = await jfetch("/api/sgtx/settlement/approve", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructionId: instruction.id, buyerGtid, overridePsp: selectedPsp !== recommendation?.top?.pspName ? selectedPsp : undefined }),
      });
      if (r.status === "CONFIRMED") toast.success(`Settlement confirmed via ${selectedPsp} ✓`);
      else toast.info("Settlement processing — PSP fallback chain active.");
      onApproved();
    } catch (e: any) { toast.error(e.message); }
    finally { setApproving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-gold" /> Approve Settlement — {instruction.instructionId}</DialogTitle>
          <DialogDescription>One-click approval · Governor-signed · PSP fallback chain (3 retries)</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded bg-muted/30"><p className="text-[0.6rem] text-muted-foreground">Amount</p><p className="font-bold text-base">{fmtUsd(instruction.amountUsd)}</p></div>
            <div className="p-2 rounded bg-muted/30"><p className="text-[0.6rem] text-muted-foreground">USTN</p><p className="font-mono text-[0.7rem]">{instruction.ustn.slice(0, 28)}…</p></div>
            <div className="p-2 rounded bg-muted/30"><p className="text-[0.6rem] text-muted-foreground">Type</p><p className="font-medium">{instruction.type.replace(/_/g, " ")}</p></div>
            <div className="p-2 rounded bg-muted/30"><p className="text-[0.6rem] text-muted-foreground">Milestone</p><p className="font-medium">{instruction.milestoneType}</p></div>
          </div>
          <div className="p-2 rounded bg-muted/30 text-xs">
            <p className="text-[0.6rem] text-muted-foreground">Governor Signature</p>
            <p className="font-mono text-[0.6rem] text-emerald-400">{instruction.governorSignature?.slice(0, 40)}…</p>
          </div>

          {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : recommendation && (
            <Card className="p-3 border-amber-500/30 bg-amber-500/5">
              <div className="flex items-center gap-2 mb-2"><Sparkles className="w-3.5 h-3.5 text-amber-400" /><p className="text-xs font-semibold">PSP Router (A2 — LightGBM + Groq)</p></div>
              {recommendation.aiExplanation && <p className="text-[0.7rem] italic text-muted-foreground mb-2">{recommendation.aiExplanation}</p>}
              <Select value={selectedPsp} onValueChange={setSelectedPsp}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {recommendation.ranked.map((p: any) => (
                    <SelectItem key={p.pspName} value={p.pspName}>
                      {p.displayName} (score {p.score}, fee ${p.feeUsd.toFixed(2)}, ~{p.settlementDays}d)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[0.6rem] text-muted-foreground mt-1.5">Override the recommended PSP if needed. Fallback chain: {recommendation.ranked.slice(0, 3).map((p: any) => p.pspName).join(" → ")}</p>
            </Card>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-gold-gradient text-sovereign" onClick={approve} disabled={approving || loading}>
            {approving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
            Approve {fmtUsd(instruction.amountUsd)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VoiceApprovalModal({ buyerGtid, onClose, onResult }: { buyerGtid: string; onClose: () => void; onResult: () => void }) {
  const [transcript, setTranscript] = useState("");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);

  const submit = async () => {
    setProcessing(true);
    try {
      const r = await jfetch("/api/sgtx/settlement/voice-approve", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, buyerGtid }),
      });
      setResult(r);
      if (r.executed) toast.success("Voice settlement executed ✓");
    } catch (e: any) { toast.error(e.message); }
    finally { setProcessing(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Mic className="w-4 h-4 text-gold" /> Voice Settlement Approval</DialogTitle><DialogDescription>"Approve settlement for USTN SGTX-..." → biometric verification → zero-click</DialogDescription></DialogHeader>
        <Textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder='e.g. "Approve settlement SI-20260420-003 for USTN SGTX-8842A2B..."' className="min-h-[70px]" />
        {result && (
          <Card className="p-3 bg-muted/20">
            <p className="text-xs font-semibold mb-1">AI Intent (A1 · {result.aiProvider})</p>
            <pre className="text-[0.7rem] whitespace-pre-wrap">{JSON.stringify(result.intent, null, 2)}</pre>
            {result.executed && <p className="text-xs text-emerald-400 mt-1">✓ Executed: {result.executionResult?.status}</p>}
            <p className="text-[0.7rem] text-muted-foreground mt-1 italic">Response: {result.response}</p>
          </Card>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-gold-gradient text-sovereign" onClick={submit} disabled={processing || !transcript.trim()}>
            {processing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Mic className="w-3.5 h-3.5 mr-1" />} Process
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// 2. SELLER SETTLEMENT SCREEN
// ============================================================
export function SellerSettlementScreen() {
  const tenantGtid = useTenantGtid();
  const [instructions, setInstructions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!tenantGtid) return;
    setTimeout(() => setLoading(true), 0);
    jfetch(`/api/sgtx/settlement/instructions?tenantGtid=${tenantGtid}&role=payee`)
      .then(d => setInstructions(d.instructions || []))
      .catch(() => setInstructions([]))
      .finally(() => setLoading(false));
  }, [tenantGtid, refreshKey]);

  if (loading) return <Card className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></Card>;

  const confirmed = instructions.filter(i => i.status === "CONFIRMED");
  const pending = instructions.filter(i => i.status === "PENDING_APPROVAL" || i.status === "PROCESSING");
  const totalReceived = confirmed.reduce((s, i) => s + i.amountUsd, 0);
  const totalPending = pending.reduce((s, i) => s + i.amountUsd, 0);

  return (
    <div className="space-y-4">
      <SectionHeader title="Settlements (Payee)" subtitle="Track incoming payments · Reconciliation status · Late penalties · File non-payment disputes" action={<Button size="sm" variant="outline" onClick={() => setRefreshKey(k => k + 1)}><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh</Button>} />

      <ExecutiveCards cards={[
        { label: "Total Received", value: fmtUsd(totalReceived), icon: DollarSign, accent: "#10b981" },
        { label: "Pending", value: fmtUsd(totalPending), sub: `${pending.length} instruction(s)`, icon: Clock, accent: "#fbbf24" },
        { label: "Confirmed", value: String(confirmed.length), icon: CheckCircle2, accent: "#60a5fa" },
        { label: "Reconciled", value: String(confirmed.filter(i => i.reconciliation?.autoReconciled).length), icon: ShieldCheck, accent: "#a78bfa" },
      ]} />

      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3">Incoming Settlements</h3>
        {instructions.length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">No incoming settlements yet.</p> : (
          <div className="space-y-2">
            {instructions.map((inst) => (
              <div key={inst.id} className="p-3 rounded-lg bg-muted/20 border border-border">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="text-xs font-mono font-semibold">{inst.instructionId}</span>
                      {statusBadge(inst.status)}
                    </div>
                    <p className="text-[0.65rem] text-muted-foreground font-mono">{inst.ustn.slice(0, 32)}…</p>
                    <p className="text-[0.65rem] text-muted-foreground">{fmtUsd(inst.amountUsd)} · from {inst.payerGtid.slice(0, 20)}… · {inst.milestoneType}</p>
                    {inst.dueDate && inst.status === "PENDING_APPROVAL" && inst.daysLate > 0 && (
                      <p className="text-[0.65rem] text-red-400 mt-0.5">⚠ {inst.daysLate}d overdue · Late fee: ${inst.lateFeeApplied.toFixed(2)}</p>
                    )}
                    {inst.reconciliation && (
                      <p className="text-[0.65rem] text-emerald-400 mt-0.5">✓ Reconciled ({(inst.reconciliation.confidence * 100).toFixed(0)}% confidence, {inst.reconciliation.source.replace(/_/g, " ")})</p>
                    )}
                  </div>
                  {inst.status === "PENDING_APPROVAL" && inst.daysLate > 7 && (
                    <Button size="sm" variant="outline" className="h-7 text-red-400 border-red-500/30" onClick={() => toast.info("Non-payment dispute filed (Phase 8). Evidence package includes settlement instructions + PSP logs.")}>
                      <Gavel className="w-3 h-3 mr-1" /> File Dispute
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ============================================================
// 3. MONTHLY STATEMENTS SCREEN
// ============================================================
export function MonthlyStatementsScreen() {
  const tenantGtid = useTenantGtid();
  const [statements, setStatements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [genModal, setGenModal] = useState(false);

  useEffect(() => {
    if (!tenantGtid) return;
    setTimeout(() => setLoading(true), 0);
    jfetch(`/api/sgtx/settlement/statements?tenantGtid=${tenantGtid}`)
      .then(d => setStatements(d.statements || []))
      .catch(() => setStatements([]))
      .finally(() => setLoading(false));
  }, [tenantGtid, refreshKey]);

  const download = (id: string, format: "pdf" | "csv" | "json") => {
    window.open(`/api/sgtx/settlement/statement/${id}/download?format=${format}`, "_blank");
    toast.success(`Downloading ${format.toUpperCase()} statement…`);
  };

  if (loading) return <Card className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></Card>;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Monthly Reconciliation Statements"
        subtitle="Cryptographically signed (Ed25519) · SHA-256 checksum · PDF/CSV/JSON download · ECB daily rates"
        action={<Button size="sm" className="bg-gold-gradient text-sovereign" onClick={() => setGenModal(true)}><FileText className="w-3.5 h-3.5 mr-1.5" />Generate Statement</Button>}
      />

      <Card className="p-4">
        {statements.length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">No statements generated yet. Click "Generate Statement" to create one.</p> : (
          <div className="space-y-2">
            {statements.map((s) => (
              <div key={s.id} className="p-3 rounded-lg bg-muted/20 border border-border">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-mono font-semibold">{s.statementId}</span>
                      <Badge variant="outline" className="text-[0.6rem] text-emerald-400 border-emerald-500/30"><ShieldCheck className="w-3 h-3 mr-1" />Signed</Badge>
                    </div>
                    <p className="text-[0.65rem] text-muted-foreground">Period: {s.month}/{s.year} · {s.ustnCount} USTN(s) · Total: {fmtUsd(s.totalSettledUsd)} · Fees: {fmtUsd(s.totalFeesUsd)}</p>
                    <p className="text-[0.6rem] text-muted-foreground font-mono mt-0.5">checksum: {s.checksum.slice(0, 30)}…</p>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 text-[0.7rem]" onClick={() => download(s.id, "pdf")}><Download className="w-3 h-3 mr-1" />PDF</Button>
                    <Button size="sm" variant="outline" className="h-7 text-[0.7rem]" onClick={() => download(s.id, "csv")}><Download className="w-3 h-3 mr-1" />CSV</Button>
                    <Button size="sm" variant="outline" className="h-7 text-[0.7rem]" onClick={() => download(s.id, "json")}><Download className="w-3 h-3 mr-1" />JSON</Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {genModal && <GenerateStatementModal tenantGtid={tenantGtid!} onClose={() => setGenModal(false)} onGenerated={() => { setGenModal(false); setRefreshKey(k => k + 1); toast.success("Statement generated and signed."); }} />}
    </div>
  );
}

function GenerateStatementModal({ tenantGtid, onClose, onGenerated }: { tenantGtid: string; onClose: () => void; onGenerated: () => void }) {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [generating, setGenerating] = useState(false);

  const generate = async () => {
    setGenerating(true);
    try {
      await jfetch("/api/sgtx/settlement/statements", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantGtid, month, year }),
      });
      onGenerated();
    } catch (e: any) { toast.error(e.message); }
    finally { setGenerating(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Generate Monthly Statement</DialogTitle><DialogDescription>Ed25519 signed · SHA-256 checksum · ECB daily rates</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">Month</Label><Select value={String(month)} onValueChange={(v) => setMonth(+v)}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: 12 }, (_, i) => <SelectItem key={i + 1} value={String(i + 1)}>{new Date(2026, i, 1).toLocaleString("default", { month: "long" })}</SelectItem>)}</SelectContent></Select></div>
          <div><Label className="text-xs">Year</Label><Input type="number" value={year} onChange={(e) => setYear(+e.target.value)} className="h-9" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-gold-gradient text-sovereign" onClick={generate} disabled={generating}>
            {generating ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <FileText className="w-3.5 h-3.5 mr-1" />} Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// 4. RECONCILIATION QUEUE SCREEN (bank/gov)
// ============================================================
export function ReconciliationQueueScreen() {
  const tenantGtid = useTenantGtid();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [reconcileModal, setReconcileModal] = useState<any | null>(null);

  useEffect(() => {
    if (!tenantGtid) return;
    setTimeout(() => setLoading(true), 0);
    jfetch(`/api/sgtx/settlement/reconcile?tenantGtid=${tenantGtid}`)
      .then(d => setRecords(d.records || []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, [tenantGtid, refreshKey]);

  if (loading) return <Card className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></Card>;

  const autoReconciled = records.filter(r => r.reconciliation?.autoReconciled);
  const needsReview = records.filter(r => r.reconciliation && !r.reconciliation.autoReconciled);

  return (
    <div className="space-y-4">
      <SectionHeader title="Reconciliation Queue" subtitle="PSP webhooks · OpenBanking (PSD2) · Manual upload · HF Donut statement extraction (A2)" action={<Button size="sm" variant="outline" onClick={() => setRefreshKey(k => k + 1)}><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh</Button>} />

      <ExecutiveCards cards={[
        { label: "Total Records", value: String(records.length), icon: FileText, accent: "#60a5fa" },
        { label: "Auto-Reconciled", value: String(autoReconciled.length), sub: "≥95% confidence", icon: CheckCircle2, accent: "#10b981" },
        { label: "Needs Review", value: String(needsReview.length), icon: AlertTriangle, accent: "#fbbf24" },
        { label: "Auto Rate", value: records.length > 0 ? `${Math.round(autoReconciled.length / records.length * 100)}%` : "—", icon: Zap, accent: "#a78bfa" },
      ]} />

      <Tabs defaultValue="auto">
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="auto" className="text-xs">Auto-Reconciled ({autoReconciled.length})</TabsTrigger>
          <TabsTrigger value="review" className="text-xs">Needs Review ({needsReview.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="auto" className="mt-3 space-y-2">
          {autoReconciled.length === 0 ? <Card className="p-6 text-center text-xs text-muted-foreground">No auto-reconciled records.</Card> : autoReconciled.map((r) => (
            <div key={r.id} className="p-2.5 rounded bg-emerald-500/5 border border-emerald-500/30 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono font-semibold">{r.instructionId}</span>
                <Badge variant="outline" className="text-[0.6rem] text-emerald-400">{(r.reconciliation.confidence * 100).toFixed(0)}%</Badge>
              </div>
              <p className="text-[0.65rem] text-muted-foreground">{fmtUsd(r.amountUsd)} · {r.reconciliation.source.replace(/_/g, " ")} · {fmtDate(r.reconciliation.matchedDate)}</p>
            </div>
          ))}
        </TabsContent>
        <TabsContent value="review" className="mt-3 space-y-2">
          {needsReview.length === 0 ? <Card className="p-6 text-center text-xs text-muted-foreground">No records need review.</Card> : needsReview.map((r) => (
            <div key={r.id} className="p-2.5 rounded bg-amber-500/5 border border-amber-500/30 text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono font-semibold">{r.instructionId}</span>
                <Badge variant="outline" className="text-[0.6rem] text-amber-400">{(r.reconciliation.confidence * 100).toFixed(0)}%</Badge>
              </div>
              <p className="text-[0.65rem] text-muted-foreground">{fmtUsd(r.amountUsd)} · {r.reconciliation.source.replace(/_/g, " ")}</p>
              <Button size="sm" variant="outline" className="h-6 mt-1 text-[0.65rem]" onClick={() => setReconcileModal(r)}>Review</Button>
            </div>
          ))}
        </TabsContent>
      </Tabs>

      {reconcileModal && <ManualReconcileModal instruction={reconcileModal} onClose={() => setReconcileModal(null)} onReconciled={() => { setReconcileModal(null); setRefreshKey(k => k + 1); }} />}
    </div>
  );
}

function ManualReconcileModal({ instruction, onClose, onReconciled }: { instruction: any; onClose: () => void; onReconciled: () => void }) {
  const [statementText, setStatementText] = useState("");
  const [processing, setProcessing] = useState(false);
  const [extracted, setExtracted] = useState<any>(null);

  const submit = async () => {
    setProcessing(true);
    try {
      const r = await jfetch("/api/sgtx/settlement/reconcile", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructionId: instruction.id, statementText, source: "MANUAL_UPLOAD" }),
      });
      setExtracted(r.extracted);
      if (r.autoReconciled) { toast.success("Auto-reconciled ✓"); onReconciled(); }
      else toast.info("Match below 95% — needs further review.");
    } catch (e: any) { toast.error(e.message); }
    finally { setProcessing(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Manual Reconciliation — {instruction.instructionId}</DialogTitle><DialogDescription>Paste bank statement line or SWIFT confirmation. AI (HF Donut) extracts data.</DialogDescription></DialogHeader>
        <Textarea value={statementText} onChange={(e) => setStatementText(e.target.value)} placeholder='e.g. "2026-03-04 | CREDIT | $48,000.00 | Ref: SGTX-1234B6C-002139F-20260210060000-T1U2V3W4 | From: European Importer GmbH"' className="min-h-[80px]" />
        {extracted && (
          <Card className="p-2 bg-muted/20">
            <p className="text-xs font-semibold mb-1">AI Extracted (A2)</p>
            <pre className="text-[0.65rem] whitespace-pre-wrap">{JSON.stringify(extracted, null, 2)}</pre>
          </Card>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-gold-gradient text-sovereign" onClick={submit} disabled={processing || !statementText.trim()}>
            {processing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />} Reconcile
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// 5. DEFERRED FEES SCREEN (gov)
// ============================================================
export function DeferredFeesScreen() {
  const [fees, setFees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setTimeout(() => setLoading(true), 0);
    jfetch(`/api/sgtx/settlement/deferred-fees`)
      .then(d => setFees(d.fees || []))
      .catch(() => setFees([]))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  if (loading) return <Card className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></Card>;

  const deferred = fees.filter(f => f.status === "DEFERRED");
  const triggered = fees.filter(f => f.status === "TRIGGERED");
  const paid = fees.filter(f => f.status === "PAID");

  return (
    <div className="space-y-4">
      <SectionHeader title="Deferred Government Fees" subtitle="Auto-triggered on customs clearance · Guarantee-secured · Direct payment to government agency" action={<Button size="sm" variant="outline" onClick={() => setRefreshKey(k => k + 1)}><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh</Button>} />

      <ExecutiveCards cards={[
        { label: "Deferred", value: String(deferred.length), sub: fmtUsd(deferred.reduce((s, f) => s + f.amountUsd, 0)), icon: Clock, accent: "#fbbf24" },
        { label: "Triggered", value: String(triggered.length), icon: Zap, accent: "#60a5fa" },
        { label: "Paid", value: String(paid.length), icon: CheckCircle2, accent: "#10b981" },
        { label: "Total Value", value: fmtUsd(fees.reduce((s, f) => s + f.amountUsd, 0)), icon: Coins, accent: "#a78bfa" },
      ]} />

      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3">Deferred Fees</h3>
        {fees.length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">No deferred fees.</p> : (
          <div className="space-y-2">
            {fees.map((f) => (
              <div key={f.id} className="p-2.5 rounded bg-muted/20 border border-border text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono font-semibold">{f.feeType.replace(/_/g, " ")}</span>
                  <Badge variant="outline" className="text-[0.6rem]" style={{ color: statusColor(f.status) }}>{f.status}</Badge>
                </div>
                <p className="text-[0.65rem] text-muted-foreground">{fmtUsd(f.amountUsd)} · USTN {f.ustn.slice(0, 24)}…</p>
                <p className="text-[0.65rem] text-muted-foreground">Payer: {f.payerGtid.slice(0, 20)}… · Trigger: {f.trigger.replace(/_/g, " ")}</p>
                {f.guaranteeIssued && <p className="text-[0.65rem] text-emerald-400">✓ Guarantee: {fmtUsd(f.guaranteeAmount || 0)}</p>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ============================================================
// 6. LATE PENALTIES SCREEN (cross-portal)
// ============================================================
export function LatePenaltiesScreen() {
  const [penalties, setPenalties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setTimeout(() => setLoading(true), 0);
    jfetch(`/api/sgtx/settlement/late-penalties`)
      .then(d => setPenalties(d.penalties || []))
      .catch(() => setPenalties([]))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  if (loading) return <Card className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></Card>;

  return (
    <div className="space-y-4">
      <SectionHeader title="Late Payment Penalties" subtitle="0.1%/day · Capped at 10% · Auto-reminders (priority 90) · Escalate to dispute after grace period" action={<Button size="sm" variant="outline" onClick={async () => { try { const r = await jfetch("/api/sgtx/settlement/late-penalties", { method: "POST" }); toast.success(`Checked ${r.checked} instructions · ${r.penalized} new penalties`); setRefreshKey(k => k + 1); } catch (e: any) { toast.error(e.message); } }}><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Run Check</Button>} />

      <ExecutiveCards cards={[
        { label: "Active Penalties", value: String(penalties.length), icon: AlertTriangle, accent: penalties.length > 0 ? "#f87171" : "#10b981" },
        { label: "Total Due", value: fmtUsd(penalties.reduce((s, p) => s + p.totalDue, 0)), icon: DollarSign, accent: "#fbbf24" },
        { label: "Total Penalties", value: fmtUsd(penalties.reduce((s, p) => s + p.penaltyAmount, 0)), icon: AlertTriangle, accent: "#fb923c" },
        { label: "Reminders Sent", value: String(penalties.reduce((s, p) => s + p.remindersSent, 0)), icon: Send, accent: "#60a5fa" },
      ]} />

      <div className="space-y-2">
        {penalties.map((p) => (
          <Card key={p.id} className="p-3 border-red-500/30 bg-red-500/5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-mono">{p.ustn.slice(0, 28)}…</span>
                  <Badge variant="outline" className="text-[0.6rem] text-red-400 border-red-500/30">{p.daysLate}d late</Badge>
                </div>
                <p className="text-[0.65rem] text-muted-foreground">Original: {fmtUsd(p.originalAmount)} · Penalty ({(p.penaltyRate * 100).toFixed(1)}%/day): {fmtUsd(p.penaltyAmount)} · <span className="text-red-400 font-semibold">Total due: {fmtUsd(p.totalDue)}</span></p>
                <p className="text-[0.65rem] text-muted-foreground">Reminders: {p.remindersSent} · Last: {p.lastReminderAt ? fmtDate(p.lastReminderAt) : "—"}</p>
              </div>
              <Button size="sm" variant="outline" className="h-7 text-red-400 border-red-500/30" onClick={() => toast.info("Non-payment dispute filed (Phase 8). Evidence package includes settlement instructions, PSP attempts, and reminders.")}>
                <Gavel className="w-3 h-3 mr-1" /> File Dispute
              </Button>
            </div>
          </Card>
        ))}
        {penalties.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground"><CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />No late payment penalties. All settlements on schedule.</Card>}
      </div>
    </div>
  );
}

// ============================================================
// 7. MILESTONE PAYMENT SCHEDULE SCREEN
// ============================================================
export function MilestoneScheduleScreen({ ustn }: { ustn?: string }) {
  const [schedule, setSchedule] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ustn) return;
    jfetch(`/api/sgtx/settlement/milestone-schedule?ustn=${ustn}`)
      .then(d => setSchedule(d.schedule))
      .catch(() => setSchedule(null))
      .finally(() => setLoading(false));
  }, [ustn]);

  if (loading) return <Card className="p-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></Card>;
  if (!schedule) return <Card className="p-4 text-xs text-muted-foreground text-center">No milestone schedule. Full payment on delivery.</Card>;

  const steps = typeof schedule.scheduleJson === "string" ? JSON.parse(schedule.scheduleJson) : schedule.scheduleJson;

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold flex items-center gap-1.5"><Coins className="w-3.5 h-3.5 text-gold" /> Milestone Payment Schedule</h4>
        {schedule.preapproved && <Badge variant="outline" className="text-[0.6rem] text-purple-400 border-purple-500/30">PREAPPROVED · AUTO</Badge>}
      </div>
      <div className="space-y-1.5">
        {steps.map((s: any, i: number) => (
          <div key={i} className="flex items-center gap-2 p-1.5 rounded bg-muted/20 text-xs">
            <div className="w-6 h-6 rounded-full bg-gold/20 flex items-center justify-center text-[0.6rem] font-bold text-gold">{s.percentage}%</div>
            <div className="flex-1">
              <p className="font-medium">{s.milestone}</p>
              <p className="text-[0.6rem] text-muted-foreground">{fmtUsd(s.amount)} · {s.trigger}</p>
            </div>
          </div>
        ))}
        <div className="text-[0.65rem] text-muted-foreground text-right pt-1">Total: {fmtUsd(schedule.totalAmount)}</div>
      </div>
    </Card>
  );
}
