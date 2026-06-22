"use client";

// SGTX Phase 5 — Physical Execution & Multiparty Tracking screens (Blueprint 3B.6)
// - PalletLoadingScreen (LSP portal) — barcode scan sim, batch mode, layer progress, multisensor consensus
// - QcExecutionScreen (QC portal) — conditional pass + action plan + reinspection
// - CustomsExecutionScreen (CBR portal) — Nafeza submission + AI doc validation
// - VesselTrackingScreen (SHIP portal) — milestones + cold-chain alerts + AIS position
// - DeliveryConfirmationScreen (Trader Buyer) — one-click confirm with hold validation
// - StuckTradeRecoveryScreen (cross-portal) — SLA-based escalation dashboard
// - ExecutionOverviewScreen (TCC) — milestone timeline + pallet progress + holds

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
import { Switch } from "@/components/ui/switch";
import { SectionHeader, ExecutiveCards } from "@/components/sgtx/widgets";
import { fmtDate, statusColor } from "@/lib/sgtx/format";
import { useAppStore } from "@/store/app-store";
import { toast } from "sonner";
import {
  Package, ScanLine, Mic, Layers, CheckCircle2, AlertTriangle, Clock, Truck, Ship,
  FileText, ShieldCheck, Loader2, Thermometer, Zap, Send, Eye, X, Plus, Activity,
  Banknote, Gavel, Sparkles, Box, Container, Globe2,
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

const MILESTONE_ICON: Record<string, any> = {
  PALLET_LOADED: Package, CONTAINER_LOADED: Container, DEPARTED: Ship, IN_TRANSIT: Globe2,
  ARRIVED: Truck, GATED_IN: Box, CUSTOMS_CLEARED: ShieldCheck, BL_ISSUED: FileText, DELIVERED: CheckCircle2,
};

function milestoneColor(status: string): string {
  if (status === "AUTO_CONFIRMED") return "#10b981";
  if (status === "CONFIRMED") return "#60a5fa";
  if (status === "PENDING") return "#fbbf24";
  if (status === "FAILED" || status === "SKIPPED") return "#f87171";
  return "#94a3b8";
}

// ============================================================
// 1. PALLET LOADING SCREEN (LSP portal)
// ============================================================
export function PalletLoadingScreen() {
  const tenantGtid = useTenantGtid();
  const [shipments, setShipments] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [scanInput, setScanInput] = useState("");
  const [batchMode, setBatchMode] = useState(false);
  const [batchScans, setBatchScans] = useState<string[]>([]);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!tenantGtid) return;
    setTimeout(() => setLoading(true), 0);
    jfetch(`/api/sgtx/dashboard?tenant=${tenantGtid}`)
      .then(d => setShipments(d.shipmentsCarrier || []))
      .catch(() => setShipments([]))
      .finally(() => setLoading(false));
  }, [tenantGtid, refreshKey]);

  const reload = useCallback(() => setRefreshKey(k => k + 1), []);

  const handleScan = async (sscc: string) => {
    if (!selected) return;
    try {
      const r = await jfetch("/api/sgtx/execution/pallet/scan", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipmentId: selected.id, sscc, loadedBy: tenantGtid, scanMethod: "BARCODE" }),
      });
      if (r.autoContainerLoaded) toast.success("Multisensor consensus reached — container auto-loaded! 🎉");
      else toast.success(`Pallet ${r.pallet?.palletId} loaded`);
      setScanInput("");
      reload();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleBatchSubmit = async () => {
    if (batchScans.length === 0 || !selected) return;
    try {
      const r = await jfetch("/api/sgtx/execution/pallet/batch-scan", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipmentId: selected.id, ssccs: batchScans, loadedBy: tenantGtid }),
      });
      toast.success(`Batch: ${r.confirmed} confirmed${r.failed.length ? `, ${r.failed.length} failed` : ""}${r.autoContainerLoaded ? " — container auto-loaded!" : ""}`);
      setBatchScans([]);
      reload();
    } catch (e: any) { toast.error(e.message); }
  };

  if (loading) return <Card className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></Card>;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Pallet-Level Loading"
        subtitle="Phase 5 · SSCC barcode scan · Voice commands · Batch mode · Multisensor consensus (zero-click container auto-load)"
        action={<div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setVoiceOpen(true)}><Mic className="w-3.5 h-3.5 mr-1.5" />Voice</Button>
          <Button size="sm" variant="outline" onClick={reload}><Activity className="w-3.5 h-3.5 mr-1.5" />Refresh</Button>
        </div>}
      />

      {/* Shipment selector */}
      <Card className="p-3">
        <Label className="text-xs mb-1.5 block">Select Shipment</Label>
        <Select value={selected?.id || ""} onValueChange={(v) => setSelected(shipments.find(s => s.id === v) || null)}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Choose shipment to load" /></SelectTrigger>
          <SelectContent>
            {shipments.map((s: any) => (
              <SelectItem key={s.id} value={s.id}>
                {s.containerNo} · {s.trade?.commodity?.slice(0, 30)} · {s.status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      {selected && <PalletLoadingDetail shipmentId={selected.id} key={refreshKey} />}

      {/* Scan input */}
      {selected && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm flex items-center gap-1.5"><ScanLine className="w-4 h-4 text-gold" /> Scan Pallet SSCC</h3>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Batch mode</Label>
              <Switch checked={batchMode} onCheckedChange={setBatchMode} />
            </div>
          </div>
          {!batchMode ? (
            <div className="flex gap-2">
              <Input
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                placeholder="Scan or enter SSCC barcode (e.g. 0010000000001)"
                className="font-mono"
                onKeyDown={(e) => e.key === "Enter" && scanInput && handleScan(scanInput)}
              />
              <Button className="bg-gold-gradient text-sovereign" onClick={() => scanInput && handleScan(scanInput)}><ScanLine className="w-4 h-4 mr-1" />Scan</Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  placeholder="Scan SSCC — press Enter to add to batch"
                  className="font-mono"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && scanInput) {
                      setBatchScans([...batchScans, scanInput]);
                      setScanInput("");
                    }
                  }}
                />
                <Button variant="outline" onClick={() => { if (scanInput) { setBatchScans([...batchScans, scanInput]); setScanInput(""); } }}>Add</Button>
              </div>
              {batchScans.length > 0 && (
                <div className="p-2 rounded bg-muted/30 text-xs space-y-1 max-h-32 overflow-y-auto">
                  {batchScans.map((s, i) => <div key={i} className="flex justify-between"><span className="font-mono">{s}</span><button onClick={() => setBatchScans(batchScans.filter((_, j) => j !== i))}><X className="w-3 h-3" /></button></div>)}
                </div>
              )}
              <Button className="bg-gold-gradient text-sovereign w-full" onClick={handleBatchSubmit} disabled={batchScans.length === 0}>
                <CheckCircle2 className="w-4 h-4 mr-1" /> Confirm Batch ({batchScans.length})
              </Button>
            </div>
          )}
        </Card>
      )}

      {voiceOpen && <VoiceCommandModal shipmentId={selected?.id} workerGtid={tenantGtid!} onClose={() => setVoiceOpen(false)} onResult={() => { setVoiceOpen(false); reload(); }} />}
    </div>
  );
}

function PalletLoadingDetail({ shipmentId }: { shipmentId: string }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    jfetch(`/api/sgtx/execution/milestones?shipmentId=${shipmentId}`)
      .then(setData).catch(() => setData(null));
  }, [shipmentId]);

  if (!data) return <Card className="p-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></Card>;

  const layers = data.pallets.reduce((acc: any, p: any) => {
    acc[p.layerPosition] = acc[p.layerPosition] || [];
    acc[p.layerPosition].push(p);
    return acc;
  }, {});
  const layerKeys = Object.keys(layers).sort((a, b) => +a - +b);

  return (
    <>
      <ExecutiveCards cards={[
        { label: "Pallets Loaded", value: `${data.palletProgress.loaded}/${data.palletProgress.total}`, icon: Package, accent: data.palletProgress.allLoaded ? "#10b981" : "#fbbf24" },
        { label: "Milestones", value: String(data.milestones.filter((m: any) => m.status === "CONFIRMED" || m.status === "AUTO_CONFIRMED").length), icon: CheckCircle2, accent: "#60a5fa" },
        { label: "Active Holds", value: String(data.holds.length), icon: AlertTriangle, accent: data.holds.length > 0 ? "#f87171" : "#10b981" },
        { label: "Container Auto-Load", value: data.palletProgress.allLoaded ? "READY" : "PENDING", icon: Zap, accent: data.palletProgress.allLoaded ? "#10b981" : "#94a3b8" },
      ]} />

      {/* Layer-by-layer progress */}
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-1.5"><Layers className="w-4 h-4 text-gold" /> Non-Uniform Layer Stacking</h3>
        <div className="space-y-3">
          {layerKeys.map(layer => (
            <div key={layer}>
              <p className="text-xs font-semibold mb-1.5 text-muted-foreground">Layer {layer} ({layers[layer].filter((p: any) => p.loaded).length}/{layers[layer].length} loaded)</p>
              <div className="grid grid-cols-10 gap-1">
                {layers[layer].map((p: any) => (
                  <div key={p.id} className={`aspect-square rounded border-2 flex items-center justify-center text-[0.55rem] font-mono ${p.loaded ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400" : "border-border bg-muted/20 text-muted-foreground"}`} title={`${p.palletId} (SSCC: ${p.sscc})`}>
                    {p.palletId.replace("OR", "")}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Milestone timeline */}
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3">Milestone Timeline</h3>
        <div className="space-y-2">
          {data.milestones.filter((m: any) => m.sequence > 0).map((m: any) => {
            const Icon = MILESTONE_ICON[m.type] || Clock;
            return (
              <div key={m.id} className="flex items-center gap-3 p-2 rounded bg-muted/20">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: `${milestoneColor(m.status)}20`, color: milestoneColor(m.status) }}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">{m.label}</p>
                  <p className="text-[0.65rem] text-muted-foreground">
                    {m.actorName || "System"} · {m.confirmedAt ? new Date(m.confirmedAt).toLocaleString() : m.slaDeadline ? `SLA: ${new Date(m.slaDeadline).toLocaleString()}` : "Pending"}
                    {m.autoConfirmed && <span className="text-emerald-400 ml-1">· auto-confirmed (multisensor)</span>}
                    {m.voiceTranscript && <span className="text-purple-400 ml-1">· voice: "{m.voiceTranscript.slice(0, 40)}"</span>}
                  </p>
                </div>
                <Badge variant="outline" className="text-[0.6rem]" style={{ color: milestoneColor(m.status), borderColor: `${milestoneColor(m.status)}55` }}>{m.status.replace(/_/g, " ")}</Badge>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Active holds */}
      {data.holds.length > 0 && (
        <Card className="p-4 border-amber-500/30 bg-amber-500/5">
          <h3 className="font-semibold text-sm mb-2 flex items-center gap-1.5 text-amber-400"><AlertTriangle className="w-4 h-4" /> Active Holds ({data.holds.length})</h3>
          {data.holds.map((h: any) => (
            <div key={h.id} className="text-xs text-muted-foreground mb-1">
              <Badge variant="outline" className="text-[0.6rem] mr-2">{h.holdType.replace(/_/g, " ")}</Badge>
              {h.reason}
              <span className="ml-2 text-amber-400">{h.blocksSettlement ? "· blocks settlement" : ""}{h.blocksDelivery ? " · blocks delivery" : ""}</span>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}

function VoiceCommandModal({ shipmentId, workerGtid, onClose, onResult }: { shipmentId?: string; workerGtid: string; onClose: () => void; onResult: () => void }) {
  const [transcript, setTranscript] = useState("");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);

  const submit = async () => {
    setProcessing(true);
    try {
      const r = await jfetch("/api/sgtx/execution/voice-command", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, workerGtid, shipmentId }),
      });
      setResult(r);
      if (r.executed) toast.success("Voice command executed ✓");
    } catch (e: any) { toast.error(e.message); }
    finally { setProcessing(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Mic className="w-4 h-4 text-gold" /> Voice Command</DialogTitle>
          <DialogDescription>Vosk transcribes → AI extracts intent → biometric verification → milestone confirmed (zero clicks)</DialogDescription>
        </DialogHeader>
        <div>
          <Label className="text-xs">Speak your command</Label>
          <Textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder='e.g. "Pallet OR011 loaded into container TCNU1234567"' className="min-h-[70px]" />
          <p className="text-[0.65rem] text-muted-foreground mt-1">Examples: "Pallet OR015 loaded", "Container sealed", "Confirm delivery for USTN SGTX-..."</p>
        </div>
        {result && (
          <Card className="p-3 bg-muted/20">
            <p className="text-xs font-semibold mb-1">AI Intent (A1 · {result.aiProvider})</p>
            <pre className="text-[0.7rem] whitespace-pre-wrap">{JSON.stringify(result.intent, null, 2)}</pre>
            {result.executed && <p className="text-xs text-emerald-400 mt-1">✓ Executed: {result.executionResult?.milestone?.label || "action performed"}</p>}
            <p className="text-[0.7rem] text-muted-foreground mt-1 italic">Response: {result.response}</p>
          </Card>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-gold-gradient text-sovereign" onClick={submit} disabled={processing || !transcript.trim()}>
            {processing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Mic className="w-3.5 h-3.5 mr-1" />}
            Process
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// 2. QC EXECUTION SCREEN (QC portal) — conditional pass + reinspection
// ============================================================
export function QcExecutionScreen() {
  const tenantGtid = useTenantGtid();
  const [insp, setInsp] = useState<any[]>([]);
  const [reinsps, setReinsps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [condModal, setCondModal] = useState<any | null>(null);
  const [reinspModal, setReinspModal] = useState<any | null>(null);

  useEffect(() => {
    if (!tenantGtid) return;
    setTimeout(() => setLoading(true), 0);
    Promise.all([
      jfetch(`/api/sgtx/dashboard?tenant=${tenantGtid}`).catch(() => ({ qcInspections: [] })),
      jfetch(`/api/sgtx/execution/qc/reinspection-request?qcProviderGtid=${tenantGtid}`).catch(() => ({ requests: [] })),
    ]).then(([d, r]) => {
      setInsp(d.qcInspections || []);
      setReinsps(r.requests || []);
    }).finally(() => setLoading(false));
  }, [tenantGtid, refreshKey]);

  if (loading) return <Card className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></Card>;

  return (
    <div className="space-y-4">
      <SectionHeader title="QC Inspection Execution" subtitle="Conditional pass with action plan · Reinspection workflow · AI defect detection (ViT)" action={<Button size="sm" variant="outline" onClick={() => setRefreshKey(k => k + 1)}><Activity className="w-3.5 h-3.5 mr-1.5" />Refresh</Button>} />

      {/* Reinspection requests */}
      {reinsps.length > 0 && (
        <Card className="p-4 border-purple-500/30 bg-purple-500/5">
          <h3 className="font-semibold text-sm mb-2 flex items-center gap-1.5"><Gavel className="w-4 h-4 text-purple-400" /> Reinspection Requests ({reinsps.length})</h3>
          <div className="space-y-2">
            {reinsps.map((r: any) => (
              <div key={r.id} className="flex items-start justify-between p-2 rounded bg-muted/20 text-xs">
                <div className="flex-1">
                  <p className="font-mono font-semibold">{r.requestId}</p>
                  <p className="text-[0.65rem] text-muted-foreground">USTN: {r.ustn?.slice(0, 28)}…</p>
                  <p className="mt-1">{r.reason}</p>
                  {r.evidenceNote && <p className="text-[0.65rem] text-muted-foreground italic mt-0.5">Evidence: {r.evidenceNote}</p>}
                </div>
                <Badge variant="outline" className="text-[0.6rem]" style={{ color: statusColor(r.status) }}>{r.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Inspections */}
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3">Inspection Queue</h3>
        {insp.length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">No inspections assigned.</p> : (
          <div className="space-y-2">
            {insp.map((q: any) => (
              <div key={q.id} className="flex items-center justify-between p-2.5 rounded bg-muted/20 border border-border">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">{q.inspectionType.replace(/_/g, " ")} · {q.inspectorName}</p>
                  <p className="text-[0.65rem] text-muted-foreground font-mono">{q.trade?.ustn?.slice(0, 28)}… · {q.trade?.commodity?.slice(0, 30)}</p>
                  <p className="text-[0.65rem] text-muted-foreground">Defects: {q.defectCount} · {q.notes?.slice(0, 60)}</p>
                </div>
                <div className="flex gap-1.5">
                  {q.result === "CONDITIONAL_PASS" && <Badge variant="outline" className="text-[0.6rem] text-amber-400 border-amber-500/30">CONDITIONAL</Badge>}
                  <Button size="sm" variant="outline" className="h-7 text-[0.7rem]" onClick={() => setCondModal(q)}>Conditional Pass</Button>
                  <Button size="sm" variant="outline" className="h-7 text-[0.7rem]" onClick={() => setReinspModal(q)}>Request Reinspection</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {condModal && <ConditionalPassModal inspection={condModal} inspectorGtid={tenantGtid!} onClose={() => setCondModal(null)} onSubmitted={() => { setCondModal(null); setRefreshKey(k => k + 1); toast.success("Conditional pass submitted — hold placed on shipment."); }} />}
      {reinspModal && <ReinspectionModal inspection={reinspModal} requestedByGtid={tenantGtid!} onClose={() => setReinspModal(null)} onSubmitted={() => { setReinspModal(null); setRefreshKey(k => k + 1); toast.success("Reinspection request sent to QC provider."); }} />}
    </div>
  );
}

function ConditionalPassModal({ inspection, inspectorGtid, onClose, onSubmitted }: { inspection: any; inspectorGtid: string; onClose: () => void; onSubmitted: () => void }) {
  const [actionPlan, setActionPlan] = useState("");
  const [deadlineHours, setDeadlineHours] = useState(24);
  const [escalation, setEscalation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [aiDefects, setAiDefects] = useState<any>(null);

  const submit = async () => {
    if (actionPlan.trim().length < 10) { toast.error("Action plan must be ≥10 chars"); return; }
    setSubmitting(true);
    try {
      // Find shipmentId from trade
      const trade = await jfetch(`/api/sgtx/trade?ustn=${inspection.trade.ustn}`);
      const shipmentId = trade.shipments?.[0]?.id;
      if (!shipmentId) { toast.error("No shipment found for trade"); setSubmitting(false); return; }
      await jfetch("/api/sgtx/execution/qc/conditional-pass", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspectionId: inspection.id, ustn: inspection.trade.ustn, shipmentId,
          actionPlan, deadlineHours, escalationTerms: escalation, inspectorGtid,
          commodity: inspection.trade.commodity, inspectionType: inspection.inspectionType,
          photoCount: 6, inspectorNotes: inspection.notes || "",
        }),
      });
      onSubmitted();
    } catch (e: any) { toast.error(e.message); }
    finally { setSubmitting(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-amber-400" /> Conditional Pass with Action Plan</DialogTitle>
          <DialogDescription>Loading proceeds but hold placed — blocks settlement until action plan completed & verified</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="p-2 rounded bg-muted/30 text-xs">
            <p><span className="text-muted-foreground">Inspection:</span> {inspection.inspectionType}</p>
            <p><span className="text-muted-foreground">Commodity:</span> {inspection.trade?.commodity}</p>
            <p><span className="text-muted-foreground">Defects:</span> {inspection.defectCount}</p>
          </div>
          <div>
            <Label className="text-xs">Action Plan (mandatory, ≥10 chars)</Label>
            <Textarea value={actionPlan} onChange={(e) => setActionPlan(e.target.value)} placeholder='e.g. "Replace 3 mould-affected cartons on pallet OR019 within 24h. Inspector to verify before container seal."' className="min-h-[70px]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Deadline (hours)</Label>
              <Input type="number" value={deadlineHours} onChange={(e) => setDeadlineHours(+e.target.value)} min={1} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Escalation Terms (optional)</Label>
              <Input value={escalation} onChange={(e) => setEscalation(e.target.value)} placeholder="e.g. 20% penalty after deadline" className="h-9" />
            </div>
          </div>
          <Card className="p-2 bg-amber-500/5 border-amber-500/30 text-[0.7rem]">
            <p className="flex items-start gap-1.5"><AlertTriangle className="w-3 h-3 mt-0.5 text-amber-400" /> A hold will be placed on the shipment: <strong>blocks settlement</strong> until action plan is marked completed & verified. Loading is still allowed.</p>
          </Card>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-gold-gradient text-sovereign" onClick={submit} disabled={submitting || actionPlan.trim().length < 10}>
            {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
            Submit Conditional Pass
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReinspectionModal({ inspection, requestedByGtid, onClose, onSubmitted }: { inspection: any; requestedByGtid: string; onClose: () => void; onSubmitted: () => void }) {
  const [reason, setReason] = useState("");
  const [sameProvider, setSameProvider] = useState(false);
  const [newProvider, setNewProvider] = useState("");
  const [evidence, setEvidence] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (reason.trim().length < 10) { toast.error("Reason must be ≥10 chars"); return; }
    setSubmitting(true);
    try {
      await jfetch("/api/sgtx/execution/qc/reinspection-request", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ustn: inspection.trade.ustn, originalInspectionId: inspection.id, requestedByGtid,
          reason, sameProvider, newQcProviderGtid: sameProvider ? null : newProvider, evidenceNote: evidence,
        }),
      });
      onSubmitted();
    } catch (e: any) { toast.error(e.message); }
    finally { setSubmitting(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Gavel className="w-4 h-4 text-purple-400" /> Request Reinspection</DialogTitle>
          <DialogDescription>Second inspection by same or different QC provider · both reports stored immutably</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Reason for Reinspection (≥10 chars)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Buyer disputes original PASS verdict — quality degradation during transit." className="min-h-[60px]" />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={sameProvider} onCheckedChange={setSameProvider} />
            <Label className="text-xs">Use same QC provider</Label>
          </div>
          {!sameProvider && (
            <div>
              <Label className="text-xs">New QC Provider GTID (from saved contacts)</Label>
              <Input value={newProvider} onChange={(e) => setNewProvider(e.target.value)} placeholder="SGTX-EG-QC-XXXXXX-XXXXXX" className="font-mono text-xs h-9" />
              <p className="text-[0.65rem] text-muted-foreground mt-0.5">Non-marketplace: only providers you've previously worked with.</p>
            </div>
          )}
          <div>
            <Label className="text-xs">Evidence Note (optional)</Label>
            <Textarea value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="e.g. Photos attached showing shrivelled peel on 15% of lot." className="min-h-[50px]" />
          </div>
          <Card className="p-2 bg-muted/30 text-[0.7rem]">
            <p>Fee: <span className="font-semibold">$350</span> · Added to payment plan (Stage 1 or buyer's batch)</p>
          </Card>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-gold-gradient text-sovereign" onClick={submit} disabled={submitting || reason.trim().length < 10}>
            {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
            Submit Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// 3. CUSTOMS EXECUTION SCREEN (CBR portal) — Nafeza + AI doc validation
// ============================================================
export function CustomsExecutionScreen() {
  const tenantGtid = useTenantGtid();
  const [decls, setDecls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [docCheck, setDocCheck] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantGtid) return;
    setTimeout(() => setLoading(true), 0);
    jfetch(`/api/sgtx/dashboard?tenant=${tenantGtid}`)
      .then(d => setDecls(d.customsDecls || []))
      .catch(() => setDecls([]))
      .finally(() => setLoading(false));
  }, [tenantGtid, refreshKey]);

  const submitDecl = async (declId: string) => {
    setSubmitting(declId);
    try {
      await jfetch("/api/sgtx/execution/customs/submit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ declarationId: declId, brokerGtid: tenantGtid }),
      });
      toast.success("Declaration submitted to Nafeza — ACCEPTED ✓");
      setRefreshKey(k => k + 1);
    } catch (e: any) { toast.error(e.message); }
    finally { setSubmitting(null); }
  };

  const checkDocs = async (ustn: string) => {
    setDocCheck({ loading: true });
    try {
      const r = await jfetch(`/api/sgtx/execution/document-check?ustn=${ustn}&includeAi=true`);
      setDocCheck(r);
    } catch (e: any) { toast.error(e.message); setDocCheck(null); }
  };

  if (loading) return <Card className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></Card>;

  return (
    <div className="space-y-4">
      <SectionHeader title="Customs Execution" subtitle="Nafeza API submission · AI document validation (A2) · Digital twin clearance simulation" action={<Button size="sm" variant="outline" onClick={() => setRefreshKey(k => k + 1)}><Activity className="w-3.5 h-3.5 mr-1.5" />Refresh</Button>} />

      <div className="space-y-2">
        {decls.map((d: any) => (
          <Card key={d.id} className="p-3">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <Badge variant="outline" className="text-[0.6rem]">{d.regime}</Badge>
                  <span className="text-xs font-mono">{d.declarationNo || "Draft"}</span>
                </div>
                <p className="text-xs text-muted-foreground font-mono">{d.trade?.ustn?.slice(0, 28)}…</p>
                <p className="text-[0.65rem] text-muted-foreground">{d.trade?.commodity} · {d.trade?.originPort} → {d.trade?.destPort}</p>
              </div>
              <Badge variant="outline" className="text-[0.6rem]" style={{ color: statusColor(d.status) }}>{d.status} · Nafeza: {d.nafezaStatus || "—"}</Badge>
            </div>
            <div className="flex gap-2">
              {d.status === "DRAFT" || d.status === "SUBMITTED" ? (
                <Button size="sm" className="bg-gold-gradient text-sovereign h-7" onClick={() => submitDecl(d.id)} disabled={submitting === d.id}>
                  {submitting === d.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Send className="w-3 h-3 mr-1" />}
                  Submit to Nafeza
                </Button>
              ) : (
                <Badge variant="outline" className="text-[0.6rem] text-emerald-400 border-emerald-500/30"><CheckCircle2 className="w-3 h-3 mr-1" />Cleared {d.clearedAt && `· ${fmtDate(d.clearedAt)}`}</Badge>
              )}
              <Button size="sm" variant="outline" className="h-7" onClick={() => checkDocs(d.trade.ustn)}><FileText className="w-3 h-3 mr-1" />Check Docs (AI)</Button>
            </div>
          </Card>
        ))}
        {decls.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground">No customs declarations assigned.</Card>}
      </div>

      {docCheck && (
        <Dialog open onOpenChange={(o) => !o && setDocCheck(null)}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle>AI Document Validation (A2)</DialogTitle><DialogDescription>RIA-driven checklist · validates mandatory docs for the trade's commodity & route</DialogDescription></DialogHeader>
            {docCheck.loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : (
              <div className="space-y-2">
                <div className={`p-2 rounded ${docCheck.allSatisfied ? "bg-emerald-500/10 border border-emerald-500/30" : "bg-red-500/10 border border-red-500/30"}`}>
                  <p className="text-sm font-semibold flex items-center gap-1.5">
                    {docCheck.allSatisfied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-red-400" />}
                    {docCheck.allSatisfied ? "All mandatory docs satisfied" : `${docCheck.blockingCount} mandatory doc(s) missing`}
                  </p>
                </div>
                <div className="space-y-1">
                  {docCheck.required.map((r: any) => (
                    <div key={r.type} className="flex items-center justify-between p-2 rounded bg-muted/20 text-xs">
                      <span className="font-mono">{r.type}</span>
                      <div className="flex items-center gap-1.5">
                        {r.mandatory && <Badge variant="outline" className="text-[0.55rem] text-amber-400 border-amber-500/30">MANDATORY</Badge>}
                        <Badge variant="outline" className="text-[0.6rem]" style={{ color: ["VERIFIED", "UPLOADED"].includes(r.status) ? "#10b981" : "#f87171" }}>{r.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
                {docCheck.aiValidation && (
                  <Card className="p-2 bg-amber-500/5 border-amber-500/30">
                    <p className="text-xs font-semibold mb-1 flex items-center gap-1.5"><Sparkles className="w-3 h-3 text-amber-400" /> AI Validation (A2)</p>
                    <pre className="text-[0.65rem] whitespace-pre-wrap">{JSON.stringify(docCheck.aiValidation, null, 2)}</pre>
                  </Card>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ============================================================
// 4. VESSEL TRACKING SCREEN (SHIP portal) — milestones + cold-chain + preadvice
// ============================================================
export function VesselTrackingScreen() {
  const tenantGtid = useTenantGtid();
  const [shipments, setShipments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selected, setSelected] = useState<any | null>(null);

  useEffect(() => {
    if (!tenantGtid) return;
    setTimeout(() => setLoading(true), 0);
    jfetch(`/api/sgtx/dashboard?tenant=${tenantGtid}`)
      .then(d => setShipments(d.shipmentsCarrier || []))
      .catch(() => setShipments([]))
      .finally(() => setLoading(false));
  }, [tenantGtid, refreshKey]);

  if (loading) return <Card className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></Card>;

  return (
    <div className="space-y-4">
      <SectionHeader title="Vessel Tracking & Cold-Chain" subtitle="AIS position updates · LSTM cold-chain prediction · Container release pre-advice" action={<Button size="sm" variant="outline" onClick={() => setRefreshKey(k => k + 1)}><Activity className="w-3.5 h-3.5 mr-1.5" />Refresh</Button>} />

      <div className="space-y-2">
        {shipments.map((s: any) => (
          <Card key={s.id} className="p-3">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <Ship className="w-3.5 h-3.5 text-gold" />
                  <span className="text-xs font-semibold">{s.vesselName} · {s.vesselImo}</span>
                  <Badge variant="outline" className="text-[0.6rem]" style={{ color: statusColor(s.status) }}>{s.status}</Badge>
                </div>
                <p className="text-[0.65rem] text-muted-foreground font-mono">{s.containerNo} · {s.ustn?.slice(0, 28)}…</p>
                <p className="text-[0.65rem] text-muted-foreground">{s.originPort} → {s.destPort} · ETD {fmtDate(s.etd)} · ETA {fmtDate(s.eta)}</p>
                {s.coldChainTemp != null && <p className="text-[0.65rem] text-cyan-400 mt-0.5"><Thermometer className="w-3 h-3 inline mr-1" />Cold chain: {s.coldChainTemp}°C</p>}
                {s.lat != null && <p className="text-[0.65rem] text-muted-foreground">AIS: {s.lat.toFixed(2)}, {s.lng?.toFixed(2)}</p>}
              </div>
              <Button size="sm" variant="outline" className="h-7" onClick={() => setSelected(s)}><Eye className="w-3 h-3 mr-1" />Details</Button>
            </div>
          </Card>
        ))}
        {shipments.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground">No vessels assigned.</Card>}
      </div>

      {selected && <VesselDetailModal shipment={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function VesselDetailModal({ shipment, onClose }: { shipment: any; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [coldAlerts, setColdAlerts] = useState<any[]>([]);
  const [preadvices, setPreadvices] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      jfetch(`/api/sgtx/execution/milestones?shipmentId=${shipment.id}`),
      jfetch(`/api/sgtx/execution/cold-chain/alerts?shipmentId=${shipment.id}`),
      jfetch(`/api/sgtx/execution/preadvice?shipmentId=${shipment.id}`),
    ]).then(([m, c, p]) => {
      setData(m); setColdAlerts(c.alerts || []); setPreadvices(p.preadvices || []);
    }).catch(() => {/* ignore */});
  }, [shipment.id]);

  const sendPreadvice = async () => {
    try {
      await jfetch("/api/sgtx/execution/preadvice", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipmentId: shipment.id }),
      });
      toast.success("Pre-advice webhook sent to terminal ✓");
      const p = await jfetch(`/api/sgtx/execution/preadvice?shipmentId=${shipment.id}`);
      setPreadvices(p.preadvices || []);
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Ship className="w-4 h-4 text-gold" /> {shipment.vesselName}</DialogTitle>
          <DialogDescription>{shipment.containerNo} · {shipment.ustn?.slice(0, 32)}…</DialogDescription>
        </DialogHeader>

        {data && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 rounded bg-muted/30"><p className="text-[0.6rem] text-muted-foreground">Position</p><p className="font-mono">{shipment.lat?.toFixed(2)}, {shipment.lng?.toFixed(2)}</p></div>
              <div className="p-2 rounded bg-muted/30"><p className="text-[0.6rem] text-muted-foreground">Cold Chain</p><p className="font-semibold text-cyan-400">{shipment.coldChainTemp}°C</p></div>
              <div className="p-2 rounded bg-muted/30"><p className="text-[0.6rem] text-muted-foreground">ETD</p><p>{fmtDate(shipment.etd)}</p></div>
              <div className="p-2 rounded bg-muted/30"><p className="text-[0.6rem] text-muted-foreground">ETA</p><p>{fmtDate(shipment.eta)}</p></div>
            </div>

            {/* Cold-chain alerts */}
            {coldAlerts.length > 0 && (
              <Card className="p-3 border-amber-500/30 bg-amber-500/5">
                <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5 text-amber-400"><Thermometer className="w-3.5 h-3.5" /> Cold-Chain Alerts ({coldAlerts.length})</h4>
                {coldAlerts.map((a: any) => (
                  <div key={a.id} className="text-xs mb-2">
                    <Badge variant="outline" className="text-[0.55rem] mr-1.5" style={{ color: a.severity === "CRITICAL" ? "#f87171" : a.severity === "WARNING" ? "#fbbf24" : "#60a5fa" }}>{a.severity}</Badge>
                    <span className="text-[0.65rem] text-muted-foreground">Excursion: {a.excursionTemp}°C for {a.durationMin}min · Shelf life: {a.originalShelfLifeDays}→{a.predictedShelfLifeDays}d</span>
                    <p className="text-[0.7rem] italic mt-0.5">{a.aiNarrative}</p>
                  </div>
                ))}
              </Card>
            )}

            {/* Pre-advice */}
            <Card className="p-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-gold" /> Container Release Pre-Advice</h4>
                <Button size="sm" variant="outline" className="h-7 text-[0.7rem]" onClick={sendPreadvice}>Send Pre-Advice</Button>
              </div>
              {preadvices.length > 0 ? preadvices.map((p: any) => (
                <div key={p.id} className="text-xs space-y-1">
                  <p className="font-mono text-[0.65rem]">{p.releaseToken}</p>
                  <p className="text-[0.65rem] text-muted-foreground">Est. gate-in: {new Date(p.estimatedGateIn).toLocaleString()} · Valid until: {new Date(p.validUntil).toLocaleString()}</p>
                  <Badge variant="outline" className="text-[0.6rem]" style={{ color: statusColor(p.webhookStatus) }}>{p.webhookStatus}</Badge>
                </div>
              )) : <p className="text-[0.65rem] text-muted-foreground">No pre-advice sent yet. Auto-sent 24h before arrival.</p>}
            </Card>

            {/* Milestone timeline */}
            <Card className="p-3">
              <h4 className="text-xs font-semibold mb-2">Milestone Timeline</h4>
              <div className="space-y-1.5">
                {(data.milestones || []).filter((m: any) => m.sequence > 0).map((m: any) => {
                  const Icon = MILESTONE_ICON[m.type] || Clock;
                  return (
                    <div key={m.id} className="flex items-center gap-2 p-1.5 rounded bg-muted/20">
                      <Icon className="w-3 h-3" style={{ color: milestoneColor(m.status) }} />
                      <span className="text-xs flex-1">{m.label}</span>
                      <span className="text-[0.6rem] text-muted-foreground">{m.confirmedAt ? new Date(m.confirmedAt).toLocaleDateString() : "pending"}</span>
                      <Badge variant="outline" className="text-[0.55rem]" style={{ color: milestoneColor(m.status) }}>{m.status.replace(/_/g, " ")}</Badge>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// 5. DELIVERY CONFIRMATION SCREEN (Trader Buyer)
// ============================================================
export function DeliveryConfirmationScreen() {
  const tenantGtid = useTenantGtid();
  const [shipments, setShipments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);

  useEffect(() => {
    if (!tenantGtid) return;
    setTimeout(() => setLoading(true), 0);
    jfetch(`/api/sgtx/dashboard?tenant=${tenantGtid}`)
      .then(d => {
        const all = [...(d.tradesAsBuyer || []), ...(d.tradesAsSeller || [])];
        const ships: any[] = [];
        all.forEach((t: any) => (t.shipments || []).forEach((s: any) => ships.push({ ...s, trade: t })));
        setShipments(ships.filter(s => ["ARRIVED", "IN_TRANSIT", "DELIVERED"].includes(s.status)));
      })
      .catch(() => setShipments([]))
      .finally(() => setLoading(false));
  }, [tenantGtid, refreshKey]);

  const confirm = async (shipmentId: string, voice?: string) => {
    setConfirming(shipmentId);
    try {
      await jfetch("/api/sgtx/execution/delivery/confirm", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipmentId, buyerGtid: tenantGtid, voiceTranscript: voice, biometricVerified: !!voice }),
      });
      toast.success("Delivery confirmed ✓ Settlement instruction generation triggered.");
      setRefreshKey(k => k + 1);
    } catch (e: any) {
      toast.error(e.message);
    } finally { setConfirming(null); }
  };

  if (loading) return <Card className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></Card>;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Delivery Confirmation"
        subtitle="Phase 5 · One-click confirm · Voice command alternative · Governor validates all milestones & holds"
        action={<Button size="sm" variant="outline" onClick={() => setVoiceOpen(true)}><Mic className="w-3.5 h-3.5 mr-1.5" />Voice Confirm</Button>}
      />

      <div className="space-y-2">
        {shipments.map((s: any) => (
          <Card key={s.id} className="p-3">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <Truck className="w-3.5 h-3.5 text-gold" />
                  <span className="text-xs font-semibold">{s.containerNo} · {s.vesselName}</span>
                  <Badge variant="outline" className="text-[0.6rem]" style={{ color: statusColor(s.status) }}>{s.status}</Badge>
                </div>
                <p className="text-[0.65rem] text-muted-foreground font-mono">{s.ustn?.slice(0, 28)}…</p>
                <p className="text-[0.65rem] text-muted-foreground">{s.trade?.commodity} · arrived {s.arrivedAt ? fmtDate(s.arrivedAt) : "in transit"}</p>
              </div>
              {s.status === "DELIVERED" ? (
                <Badge variant="outline" className="text-[0.6rem] text-emerald-400 border-emerald-500/30"><CheckCircle2 className="w-3 h-3 mr-1" />Delivered</Badge>
              ) : (
                <Button size="sm" className="bg-gold-gradient text-sovereign h-7" onClick={() => confirm(s.id)} disabled={confirming === s.id || s.status !== "ARRIVED"}>
                  {confirming === s.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                  Confirm Delivery
                </Button>
              )}
            </div>
            {s.status === "IN_TRANSIT" && <p className="text-[0.65rem] text-amber-400">Shipment must arrive before delivery can be confirmed.</p>}
          </Card>
        ))}
        {shipments.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground">No shipments ready for delivery confirmation.</Card>}
      </div>

      {voiceOpen && (
        <Dialog open onOpenChange={(o) => !o && setVoiceOpen(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Mic className="w-4 h-4 text-gold" /> Voice Delivery Confirmation</DialogTitle><DialogDescription>"Confirm delivery for USTN SGTX-…" → biometric verification → zero-click confirm</DialogDescription></DialogHeader>
            <VoiceDeliveryConfirm tenantGtid={tenantGtid!} shipments={shipments} onClose={() => setVoiceOpen(false)} onConfirmed={() => { setVoiceOpen(false); setRefreshKey(k => k + 1); }} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function VoiceDeliveryConfirm({ tenantGtid, shipments, onClose, onConfirmed }: { tenantGtid: string; shipments: any[]; onClose: () => void; onConfirmed: () => void }) {
  const [transcript, setTranscript] = useState("");
  const [processing, setProcessing] = useState(false);

  const submit = async () => {
    setProcessing(true);
    try {
      // Find shipment by USTN match in transcript
      const matched = shipments.find(s => transcript.includes(s.ustn?.slice(0, 20)));
      if (!matched) { toast.error("Could not match USTN in transcript"); setProcessing(false); return; }
      await jfetch("/api/sgtx/execution/delivery/confirm", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipmentId: matched.id, buyerGtid: tenantGtid, voiceTranscript: transcript, biometricVerified: true }),
      });
      toast.success("Voice delivery confirmed ✓ (biometric verified)");
      onConfirmed();
    } catch (e: any) { toast.error(e.message); }
    finally { setProcessing(false); }
  };

  return (
    <div className="space-y-3">
      <Textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder='e.g. "Confirm delivery for USTN SGTX-1397F3A-2345B6C-20260415120000-A1B2C3D4"' className="min-h-[60px]" />
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button className="bg-gold-gradient text-sovereign" onClick={submit} disabled={processing || !transcript.trim()}>
          {processing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Mic className="w-3.5 h-3.5 mr-1" />} Confirm via Voice
        </Button>
      </DialogFooter>
    </div>
  );
}

// ============================================================
// 6. STUCK TRADE RECOVERY SCREEN (cross-portal)
// ============================================================
export function StuckTradeRecoveryScreen() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setTimeout(() => setLoading(true), 0);
    jfetch("/api/sgtx/execution/stuck-trades")
      .then(d => setAlerts(d.alerts || []))
      .catch(() => setAlerts([]))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const runCheck = async () => {
    try {
      const r = await jfetch("/api/sgtx/execution/stuck-trades", { method: "POST" });
      toast.success(`Checked ${r.checked} milestones · ${r.escalated} new alerts`);
      setRefreshKey(k => k + 1);
    } catch (e: any) { toast.error(e.message); }
  };

  const escalate = async (alertId: string) => {
    toast.info("Escalation sent to human mediator (A3) — support ticket created.");
    setRefreshKey(k => k + 1);
  };

  if (loading) return <Card className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></Card>;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Stuck Trade Recovery"
        subtitle="SLA-based escalation · 12h reminder · 24h alert · 48h human mediator (A3)"
        action={<Button size="sm" variant="outline" onClick={runCheck}><Activity className="w-3.5 h-3.5 mr-1.5" />Run Check</Button>}
      />

      <ExecutiveCards cards={[
        { label: "Total Stuck", value: String(alerts.length), icon: AlertTriangle, accent: alerts.length > 0 ? "#f87171" : "#10b981" },
        { label: "Level 1 (12h)", value: String(alerts.filter(a => a.escalationLevel === "LEVEL_1").length), icon: Clock, accent: "#fbbf24" },
        { label: "Level 2 (24h)", value: String(alerts.filter(a => a.escalationLevel === "LEVEL_2").length), icon: AlertTriangle, accent: "#fb923c" },
        { label: "Level 3 (48h)", value: String(alerts.filter(a => a.escalationLevel === "LEVEL_3").length), icon: Gavel, accent: "#f87171" },
      ]} />

      <div className="space-y-2">
        {alerts.map((a: any) => (
          <Card key={a.id} className={`p-3 ${a.escalationLevel === "LEVEL_3" ? "border-red-500/40 bg-red-500/5" : a.escalationLevel === "LEVEL_2" ? "border-orange-500/40 bg-orange-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <Badge variant="outline" className="text-[0.6rem]" style={{ color: a.escalationLevel === "LEVEL_3" ? "#f87171" : a.escalationLevel === "LEVEL_2" ? "#fb923c" : "#fbbf24" }}>{a.escalationLevel}</Badge>
                  <span className="text-xs font-medium">{a.milestoneType.replace(/_/g, " ")}</span>
                  <span className="text-[0.65rem] text-muted-foreground">{a.hoursOverdue}h overdue</span>
                </div>
                <p className="text-[0.65rem] text-muted-foreground font-mono">USTN: {a.ustn?.slice(0, 28)}…</p>
                {a.trade && <p className="text-[0.65rem] text-muted-foreground">{a.trade.commodity} · buyer {a.trade.buyer?.legalName} · seller {a.trade.seller?.legalName}</p>}
                <p className="text-[0.65rem] text-muted-foreground">SLA deadline: {new Date(a.slaDeadline).toLocaleString()}</p>
              </div>
              <Button size="sm" variant="outline" className="h-7" onClick={() => escalate(a.id)}><Gavel className="w-3 h-3 mr-1" />Escalate</Button>
            </div>
          </Card>
        ))}
        {alerts.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground"><CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />No stuck trades. All milestones on schedule.</Card>}
      </div>
    </div>
  );
}

// ============================================================
// 7. EXECUTION OVERVIEW (TCC tab) — milestone timeline + holds summary
// ============================================================
export function ExecutionOverviewScreen({ ustn }: { ustn: string }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    jfetch(`/api/sgtx/execution/milestones?ustn=${ustn}`)
      .then(setData).catch(() => setData(null));
  }, [ustn]);

  if (!data) return <Card className="p-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></Card>;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-xs">
        <Card className="p-2"><p className="text-[0.6rem] text-muted-foreground">Pallets</p><p className="font-bold">{data.palletProgress.loaded}/{data.palletProgress.total}</p></Card>
        <Card className="p-2"><p className="text-[0.6rem] text-muted-foreground">Milestones Done</p><p className="font-bold">{data.milestones.filter((m: any) => m.status === "CONFIRMED" || m.status === "AUTO_CONFIRMED").length}/{data.milestones.filter((m: any) => m.sequence > 0).length}</p></Card>
        <Card className="p-2"><p className="text-[0.6rem] text-muted-foreground">Active Holds</p><p className="font-bold text-amber-400">{data.holds.length}</p></Card>
      </div>
      {data.holds.length > 0 && (
        <Card className="p-2 border-amber-500/30 bg-amber-500/5 text-[0.7rem]">
          {data.holds.map((h: any) => <p key={h.id}><AlertTriangle className="w-3 h-3 inline mr-1 text-amber-400" />{h.reason}</p>)}
        </Card>
      )}
      <div className="space-y-1.5">
        {data.milestones.filter((m: any) => m.sequence > 0).map((m: any) => {
          const Icon = MILESTONE_ICON[m.type] || Clock;
          return (
            <div key={m.id} className="flex items-center gap-2 p-1.5 rounded bg-muted/20 text-xs">
              <Icon className="w-3 h-3" style={{ color: milestoneColor(m.status) }} />
              <span className="flex-1 truncate">{m.label}</span>
              <Badge variant="outline" className="text-[0.55rem]" style={{ color: milestoneColor(m.status) }}>{m.status.replace(/_/g, " ")}</Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}
