"use client";

// SGTX Phase 8 — Dispute Resolution & Arbitration screens (Blueprint 3B.9)
// - DisputeResolutionScreen (filing, mediation log, offers, AI proposal, expert, arbitration)

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
  Gavel, FileText, ShieldCheck, Loader2, Send, CheckCircle2, AlertTriangle, Sparkles,
  Users, Activity, RefreshCw, Eye, Mic, X, Clock, Coins,
} from "lucide-react";

function useTenantGtid(): string | null { return useAppStore((s) => s.activeTenantGtid); }
async function jfetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, opts);
  if (!r.ok) { let msg = `HTTP ${r.status}`; try { const j = await r.json(); msg = j.error || msg; } catch { /* ignore */ } throw new Error(msg); }
  return r.json();
}

const DISPUTE_CATEGORIES = [
  { value: "QUALITY", label: "Quality — goods don't conform" },
  { value: "DELAY", label: "Delay — late delivery" },
  { value: "NON_PAYMENT", label: "Non-Payment — buyer fails to pay" },
  { value: "DOCUMENT_FRAUD", label: "Documentation Fraud — forged certificate" },
  { value: "COLD_CHAIN", label: "Cold Chain Failure — temperature deviation" },
  { value: "WEIGHT_SHORTAGE", label: "Weight Shortage — net weight less than invoice" },
  { value: "SERVICE_QUALITY", label: "Service Quality — broker/lab/QC failed" },
  { value: "FINANCING", label: "Financing — financier/borrower dispute" },
  { value: "SGTX_FEE", label: "SGTX Fee — fee calculation dispute" },
];

// ============================================================
// DISPUTE RESOLUTION SCREEN
// ============================================================
export function DisputeResolutionScreen() {
  const tenantGtid = useTenantGtid();
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [fileModal, setFileModal] = useState(false);
  const [detailModal, setDetailModal] = useState<any | null>(null);

  const reload = useCallback(() => setRefreshKey(k => k + 1), []);

  useEffect(() => {
    if (!tenantGtid) return;
    setTimeout(() => setLoading(true), 0);
    jfetch(`/api/sgtx/dashboard?tenant=${tenantGtid}`)
      .then(d => setDisputes(d.disputes || []))
      .catch(() => setDisputes([]))
      .finally(() => setLoading(false));
  }, [tenantGtid, refreshKey]);

  if (loading) return <Card className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></Card>;

  const open = disputes.filter(d => d.status !== "RESOLVED");
  const resolved = disputes.filter(d => d.status === "RESOLVED");

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Dispute Resolution & Arbitration"
        subtitle="Phase 8 · AI triage · Evidence autocompile · Mediation log · Predictive outcome · AI settlement · Third-party expert · Arbitration prep"
        action={<Button size="sm" className="bg-gold-gradient text-sovereign" onClick={() => setFileModal(true)}><Gavel className="w-3.5 h-3.5 mr-1.5" />File Dispute</Button>}
      />

      <ExecutiveCards cards={[
        { label: "Open Disputes", value: String(open.length), icon: Gavel, accent: open.length > 0 ? "#f87171" : "#10b981" },
        { label: "In Mediation", value: String(open.filter(d => d.status === "MEDIATION").length), icon: Users, accent: "#fbbf24" },
        { label: "Arbitration", value: String(open.filter(d => d.status === "ARBITRATION_PENDING").length), icon: ShieldCheck, accent: "#60a5fa" },
        { label: "Resolved", value: String(resolved.length), icon: CheckCircle2, accent: "#10b981" },
      ]} />

      <div className="space-y-3">
        {disputes.length === 0 ? (
          <Card className="p-8 text-center"><p className="text-sm text-muted-foreground">No disputes. 🛡 All trades in good standing.</p></Card>
        ) : disputes.map((d) => (
          <Card key={d.id} className="p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge variant="outline" className="text-[0.6rem]" style={{ color: statusColor(d.status) }}>{d.status.replace(/_/g, " ")}</Badge>
                  <Badge variant="outline" className="text-[0.6rem]">{d.type.replace(/_/g, " ")}</Badge>
                  <span className="text-[0.6rem] text-muted-foreground font-mono">{d.trade?.ustn?.slice(0, 24)}…</span>
                </div>
                <p className="text-sm text-foreground">{d.description}</p>
                {d.aiRootCause && (
                  <div className="mt-2 p-2 rounded-lg bg-gold/5 border border-gold/20">
                    <p className="text-[0.6rem] tracking-widest text-gold uppercase font-semibold flex items-center gap-1 mb-1"><Sparkles className="w-3 h-3" /> AI Triage / Root Cause</p>
                    <p className="text-xs text-foreground/90">{d.aiRootCause}</p>
                  </div>
                )}
                {d.resolution && <p className="text-xs text-emerald-400 mt-2">✓ {d.resolution}</p>}
                <div className="flex items-center gap-4 mt-2 text-[0.65rem] text-muted-foreground">
                  <span>Claim: {fmtUsd(d.claimAmountUsd)}</span>
                  <span>Evidence: {d.evidenceCount} items</span>
                  <span>Filed {fmtDate(d.createdAt)}</span>
                </div>
              </div>
              {d.status !== "RESOLVED" && <Button size="sm" variant="outline" className="h-7" onClick={() => setDetailModal(d)}><Eye className="w-3 h-3 mr-1" />Open Mediation</Button>}
            </div>
          </Card>
        ))}
      </div>

      {fileModal && <FileDisputeModal onClose={() => setFileModal(false)} onSubmitted={() => { setFileModal(false); reload(); toast.success("Dispute filed — evidence compiling, FeeLock frozen."); }} />}
      {detailModal && <DisputeDetailModal dispute={detailModal} tenantGtid={tenantGtid!} onClose={() => setDetailModal(null)} onChanged={reload} />}
    </div>
  );
}

function FileDisputeModal({ onClose, onSubmitted }: { onClose: () => void; onSubmitted: () => void }) {
  const tenantGtid = useTenantGtid();
  const [ustn, setUstn] = useState("");
  const [category, setCategory] = useState("QUALITY");
  const [description, setDescription] = useState("");
  const [claimAmount, setClaimAmount] = useState(0);
  const [remedy, setRemedy] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (description.trim().length < 10) { toast.error("Description must be ≥10 chars"); return; }
    setSubmitting(true);
    try {
      await jfetch("/api/sgtx/disputes/file", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ustn, filedByGtid: tenantGtid, category, description, claimAmountUsd: claimAmount, remedySought: remedy }),
      });
      onSubmitted();
    } catch (e: any) { toast.error(e.message); }
    finally { setSubmitting(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Gavel className="w-4 h-4 text-gold" /> File Dispute</DialogTitle><DialogDescription>G10U1: Must reference valid locked USTN · FeeLock frozen on filing · Counterparty notified</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">USTN</Label><Input value={ustn} onChange={(e) => setUstn(e.target.value)} placeholder="SGTX-..." className="font-mono text-xs h-9" /></div>
          <div><Label className="text-xs">Category</Label><Select value={category} onValueChange={setCategory}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{DISPUTE_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></div>
          <div><Label className="text-xs">Description (min 10 chars)</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Strawberries arrived with 10% mould. Claiming $2,000 refund." className="min-h-[70px]" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Claim Amount (USD)</Label><Input type="number" value={claimAmount} onChange={(e) => setClaimAmount(+e.target.value)} className="h-9" /></div>
            <div><Label className="text-xs">Remedy Sought</Label><Input value={remedy} onChange={(e) => setRemedy(e.target.value)} placeholder="e.g. Full refund" className="h-9" /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-gold-gradient text-sovereign" onClick={submit} disabled={submitting || !ustn || description.trim().length < 10}>
            {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Gavel className="w-3.5 h-3.5 mr-1" />} Submit Dispute
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DisputeDetailModal({ dispute, tenantGtid, onClose, onChanged }: { dispute: any; tenantGtid: string; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [action, setAction] = useState<string | null>(null);

  const load = useCallback(() => {
    jfetch(`/api/sgtx/disputes/evidence?disputeId=${dispute.id}`)
      .then(setData)
      .catch(() => {/* ignore */})
      .finally(() => setLoading(false));
  }, [dispute.id]);

  useEffect(() => { load(); }, [load]);

  const sendMessage = async (type: string = "TEXT", amount?: number) => {
    if (!message.trim() && type === "TEXT") return;
    setAction("send");
    try {
      const tenant = await jfetch(`/api/sgtx/tenants?gtid=${tenantGtid}`);
      const name = tenant.tenant?.legalName || "Party";
      const role = dispute.trade?.buyerGtid === tenantGtid ? "BUYER" : dispute.trade?.sellerGtid === tenantGtid ? "SELLER" : "PARTY";
      await jfetch("/api/sgtx/disputes/mediation", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disputeId: dispute.id, senderGtid: tenantGtid, senderName: `${name} (${role})`, senderRole: role, messageType: type, messageText: message, offerAmountUsd: amount }),
      });
      setMessage(""); load(); toast.success("Message posted");
    } catch (e: any) { toast.error(e.message); }
    finally { setAction(null); }
  };

  const acceptProposal = async (proposalId: string) => {
    setAction("accept");
    try {
      const role = dispute.trade?.buyerGtid === tenantGtid ? "BUYER" : "SELLER";
      await jfetch("/api/sgtx/disputes/proposal", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept", proposalId, acceptorGtid: tenantGtid, role }),
      });
      toast.success("Proposal accepted"); load(); onChanged();
    } catch (e: any) { toast.error(e.message); }
    finally { setAction(null); }
  };

  const prepareArbitration = async () => {
    setAction("arb");
    try {
      await jfetch("/api/sgtx/disputes/arbitration", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disputeId: dispute.id, arbitrationBody: "ICC" }),
      });
      toast.success("Arbitration case prepared — PDF ready"); load(); onChanged();
    } catch (e: any) { toast.error(e.message); }
    finally { setAction(null); }
  };

  if (loading) return <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent><Loader2 className="w-5 h-5 animate-spin mx-auto" /></DialogContent></Dialog>;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Gavel className="w-4 h-4 text-gold" /> Dispute Mediation — {dispute.type}</DialogTitle>
          <DialogDescription>{dispute.trade?.ustn?.slice(0, 32)}… · {dispute.description.slice(0, 80)}…</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="mediation">
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="mediation" className="text-[0.7rem]">Mediation</TabsTrigger>
            <TabsTrigger value="evidence" className="text-[0.7rem]">Evidence</TabsTrigger>
            <TabsTrigger value="prediction" className="text-[0.7rem]">Prediction</TabsTrigger>
            <TabsTrigger value="proposal" className="text-[0.7rem]">AI Proposal</TabsTrigger>
            <TabsTrigger value="actions" className="text-[0.7rem]">Actions</TabsTrigger>
          </TabsList>

          {/* Mediation Log */}
          <TabsContent value="mediation" className="mt-3 space-y-2 max-h-80 overflow-y-auto">
            {(data?.mediation || []).map((m: any) => (
              <div key={m.id} className={`p-2 rounded text-xs ${m.senderRole === "AI_MEDIATOR" ? "bg-gold/5 border border-gold/20" : m.senderRole === "EXPERT" ? "bg-purple-500/5 border border-purple-500/20" : "bg-muted/20"}`}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-semibold">{m.senderName}</span>
                  <span className="text-[0.55rem] text-muted-foreground">{new Date(m.createdAt).toLocaleString()}</span>
                </div>
                <p>{m.messageText}</p>
                {m.offerAmountUsd && <p className="text-gold font-semibold mt-1">Offer: {fmtUsd(m.offerAmountUsd)}</p>}
                {m.sentimentFlag === "hostile" && <Badge variant="outline" className="text-[0.55rem] text-red-400 mt-1">⚠ Hostile — cooling-off suggested</Badge>}
              </div>
            ))}
            <div className="flex gap-2 mt-2">
              <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Type mediation message..." className="h-8 text-xs" onKeyDown={(e) => e.key === "Enter" && sendMessage()} />
              <Button size="sm" className="bg-gold-gradient text-sovereign h-8" disabled={action === "send"} onClick={() => sendMessage()}><Send className="w-3 h-3" /></Button>
            </div>
          </TabsContent>

          {/* Evidence Package */}
          <TabsContent value="evidence" className="mt-3 space-y-2">
            {data?.evidence ? (
              <Card className="p-3">
                <p className="text-xs font-semibold mb-1">Evidence Package Compiled</p>
                <p className="text-[0.65rem] text-muted-foreground font-mono">Hash: {data.evidence.packageHash?.slice(0, 40)}…</p>
                <p className="text-[0.65rem] text-muted-foreground font-mono">Loom: {data.evidence.loomHash?.slice(0, 30)}…</p>
                <p className="text-[0.65rem] text-muted-foreground">Size: {data.evidence.fileSizeKb}kb · Token: {data.evidence.verificationToken?.slice(0, 20)}…</p>
                <details className="mt-2"><summary className="text-xs cursor-pointer text-gold">Contents ({JSON.parse(data.evidence.contents).length} items)</summary><pre className="text-[0.6rem] mt-1 whitespace-pre-wrap max-h-40 overflow-y-auto">{JSON.parse(data.evidence.contents).map((c: string, i: number) => `${i+1}. ${c}`).join("\n")}</pre></details>
              </Card>
            ) : <p className="text-xs text-muted-foreground text-center py-4">Evidence not yet compiled.</p>}
            {data?.qcFlags?.length > 0 && (
              <Card className="p-3 border-purple-500/30 bg-purple-500/5">
                <p className="text-xs font-semibold mb-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-purple-400" /> QC Override Fast-Track ({data.qcFlags.length})</p>
                {data.qcFlags.map((f: any) => (
                  <div key={f.id} className="text-[0.65rem] text-muted-foreground">
                    AI detected: {JSON.parse(f.originalAiDetection).defect_type} ({Math.round(JSON.parse(f.originalAiDetection).confidence * 100)}%) → Inspector classified: {f.inspectorClassification} — "{f.inspectorReason}"
                  </div>
                ))}
              </Card>
            )}
          </TabsContent>

          {/* Prediction */}
          <TabsContent value="prediction" className="mt-3 space-y-2">
            {data?.prediction ? (
              <Card className="p-3 border-amber-500/30 bg-amber-500/5">
                <p className="text-xs font-semibold mb-2 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-amber-400" /> Predictive Outcome (A2 XGBoost)</p>
                <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                  <div><p className="text-[0.6rem] text-muted-foreground">Filer Win Prob.</p><p className="font-bold text-lg" style={{ color: data.prediction.filerWinProbability >= 0.6 ? "#10b981" : data.prediction.filerWinProbability >= 0.4 ? "#fbbf24" : "#f87171" }}>{Math.round(data.prediction.filerWinProbability * 100)}%</p></div>
                  <div><p className="text-[0.6rem] text-muted-foreground">Award Range</p><p className="font-semibold text-[0.7rem]">{data.prediction.predictedAwardMin ? fmtUsd(data.prediction.predictedAwardMin) : "—"} – {data.prediction.predictedAwardMax ? fmtUsd(data.prediction.predictedAwardMax) : "—"}</p></div>
                  <div><p className="text-[0.6rem] text-muted-foreground">Confidence</p><p className="font-semibold">{Math.round(data.prediction.confidence * 100)}%</p></div>
                </div>
                <p className="text-[0.7rem] italic text-muted-foreground">{data.prediction.summary}</p>
              </Card>
            ) : <p className="text-xs text-muted-foreground text-center py-4">Prediction not yet generated.</p>}
          </TabsContent>

          {/* AI Settlement Proposal */}
          <TabsContent value="proposal" className="mt-3 space-y-2">
            {(data?.proposals || []).length === 0 ? (
              <Button size="sm" className="bg-gold-gradient text-sovereign" onClick={async () => { setAction("gen"); try { await jfetch("/api/sgtx/disputes/proposal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ disputeId: dispute.id }) }); toast.success("AI settlement proposal generated"); load(); } catch (e: any) { toast.error(e.message); } finally { setAction(null); } }} disabled={action === "gen"}>
                {action === "gen" ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />} Request AI Settlement Proposal
              </Button>
            ) : data.proposals.map((p: any) => (
              <Card key={p.id} className="p-3 border-emerald-500/30 bg-emerald-500/5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono font-semibold">{p.proposalId}</span>
                  <div className="flex gap-1">
                    {p.buyerAccepted && <Badge variant="outline" className="text-[0.55rem] text-emerald-400">Buyer ✓</Badge>}
                    {p.sellerAccepted && <Badge variant="outline" className="text-[0.55rem] text-emerald-400">Seller ✓</Badge>}
                    {p.addendumSigned && <Badge variant="outline" className="text-[0.55rem] text-emerald-400">Signed ✓</Badge>}
                  </div>
                </div>
                <p className="text-sm font-bold">{p.proposalType.replace(/_/g, " ")}: {p.amountUsd ? fmtUsd(p.amountUsd) : "N/A"}</p>
                <p className="text-[0.65rem] text-muted-foreground mt-1">{p.rationale}</p>
                <p className="text-[0.6rem] text-muted-foreground mt-1">Confidence: {Math.round(p.confidence * 100)}% · Expires: {fmtDate(p.acceptanceDeadline)}</p>
                {!p.addendumSigned && (
                  <Button size="sm" className="bg-gold-gradient text-sovereign h-7 mt-2" disabled={action === "accept"} onClick={() => acceptProposal(p.proposalId)}>
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Accept Proposal
                  </Button>
                )}
              </Card>
            ))}
          </TabsContent>

          {/* Actions: Expert, Arbitration, Fee Dispute */}
          <TabsContent value="actions" className="mt-3 space-y-2">
            <Button size="sm" variant="outline" className="w-full h-8" onClick={() => toast.info("Expert invitation sent — secure link generated.")}><Users className="w-3 h-3 mr-1" /> Invite Third-Party Expert</Button>
            <Button size="sm" variant="outline" className="w-full h-8" onClick={prepareArbitration} disabled={action === "arb"}>
              {action === "arb" ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <ShieldCheck className="w-3 h-3 mr-1" />} Prepare Arbitration Case (ICC)
            </Button>
            <Button size="sm" variant="outline" className="w-full h-8" onClick={async () => { setAction("qc"); try { const r = await jfetch("/api/sgtx/disputes/qc-overrides", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ disputeId: dispute.id }) }); toast.success(`QC override check: ${r.flags?.length || 0} flags`); load(); } catch (e: any) { toast.error(e.message); } finally { setAction(null); } }} disabled={action === "qc"}>
              <AlertTriangle className="w-3 h-3 mr-1" /> Check QC Overrides
            </Button>
            <Button size="sm" variant="outline" className="w-full h-8" onClick={async () => { setAction("doc"); try { const r = await jfetch("/api/sgtx/disputes/document-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ disputeId: dispute.id }) }); toast.success(`Document check: ${r.flags?.length || 0} flags`); } catch (e: any) { toast.error(e.message); } finally { setAction(null); } }} disabled={action === "doc"}>
              <FileText className="w-3 h-3 mr-1" /> Document Authenticity Check
            </Button>
            {data?.experts?.length > 0 && (
              <Card className="p-2 bg-muted/20">
                <p className="text-xs font-semibold mb-1">Invited Experts ({data.experts.length})</p>
                {data.experts.map((e: any) => <p key={e.id} className="text-[0.65rem] text-muted-foreground">{e.expertName} ({e.expertType}) — {e.status}</p>)}
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
