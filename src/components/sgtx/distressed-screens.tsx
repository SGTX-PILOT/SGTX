"use client";

// SGTX Phase 7 — Distressed Cargo Resolution screens (Blueprint 3B.8)
// - DistressedCargoScreen (seller: declare, triage, check buyers, outreach, microcontract)
// - DistressedOffersScreen (buyer: view distressed lots, submit offers)

import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { SectionHeader, ExecutiveCards } from "@/components/sgtx/widgets";
import { fmtUsd, fmtDate, fmtKg, statusColor } from "@/lib/sgtx/format";
import { useAppStore } from "@/store/app-store";
import { toast } from "sonner";
import {
  AlertTriangle, Zap, ShieldCheck, Loader2, Send, CheckCircle2, Users, Sparkles,
  Coins, FileText, Activity, RefreshCw, Eye, Gavel, Lock, Mic,
} from "lucide-react";

function useTenantGtid(): string | null { return useAppStore((s) => s.activeTenantGtid); }
async function jfetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, opts);
  if (!r.ok) { let msg = `HTTP ${r.status}`; try { const j = await r.json(); msg = j.error || msg; } catch { /* ignore */ } throw new Error(msg); }
  return r.json();
}

// ============================================================
// 1. DISTRESSED CARGO SCREEN (Seller: declare + triage + outreach + microcontract)
// ============================================================
export function DistressedCargoScreen() {
  const tenantGtid = useTenantGtid();
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [declareModal, setDeclareModal] = useState(false);
  const [triageModal, setTriageModal] = useState<any | null>(null);
  const [buyersModal, setBuyersModal] = useState<any | null>(null);
  const [outreachModal, setOutreachModal] = useState<any | null>(null);
  const [microcontractModal, setMicrocontractModal] = useState<any | null>(null);

  const reload = useCallback(() => setRefreshKey(k => k + 1), []);

  useEffect(() => {
    if (!tenantGtid) return;
    setTimeout(() => setLoading(true), 0);
    jfetch(`/api/sgtx/distressed/listings?declarerGtid=${tenantGtid}`)
      .then(d => setListings(d.listings || []))
      .catch(() => setListings([]))
      .finally(() => setLoading(false));
  }, [tenantGtid, refreshKey]);

  if (loading) return <Card className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></Card>;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Distressed Cargo Resolution"
        subtitle="Phase 7 · AI condition assessment (ViT) · Dynamic pricing (XGBoost) · Triage dashboard · Check Buyers · Accelerated Outreach · Microcontract"
        action={<Button size="sm" className="bg-gold-gradient text-sovereign" onClick={() => setDeclareModal(true)}><AlertTriangle className="w-3.5 h-3.5 mr-1.5" />Declare Distressed</Button>}
      />

      <ExecutiveCards cards={[
        { label: "Active Listings", value: String(listings.filter(l => l.status !== "LOCKED" && l.status !== "RESOLVED").length), icon: AlertTriangle, accent: "#fb923c" },
        { label: "In Outreach", value: String(listings.filter(l => l.outreachActive).length), icon: Zap, accent: "#fbbf24" },
        { label: "Offers Received", value: String(listings.reduce((s, l) => s + (l.offers?.filter((o: any) => o.status === "SUBMITTED").length || 0), 0)), icon: Coins, accent: "#10b981" },
        { label: "Microcontracts Locked", value: String(listings.filter(l => l.status === "LOCKED").length), icon: Lock, accent: "#a78bfa" },
      ]} />

      <div className="space-y-3">
        {listings.length === 0 ? (
          <Card className="p-8 text-center"><p className="text-sm text-muted-foreground">No distressed cargo listings. Click "Declare Distressed" to start.</p></Card>
        ) : listings.map((l) => (
          <Card key={l.id} className="p-4 border-l-4 border-l-orange-500">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-xs font-mono font-semibold">{l.listingId}</span>
                  <Badge variant="outline" className="text-[0.6rem]" style={{ color: statusColor(l.status) }}>{l.status.replace(/_/g, " ")}</Badge>
                  {l.conditionScore != null && <Badge variant="outline" className="text-[0.6rem]" style={{ color: l.conditionScore >= 60 ? "#10b981" : l.conditionScore >= 30 ? "#fbbf24" : "#f87171" }}>Score {l.conditionScore}</Badge>}
                  {l.microUstn && <Badge variant="outline" className="text-[0.55rem] text-purple-400 border-purple-500/30">microUSTN</Badge>}
                </div>
                <p className="text-sm font-semibold">{l.commodity}</p>
                <p className="text-[0.65rem] text-muted-foreground font-mono">{l.ustn.slice(0, 32)}…</p>
                <div className="grid grid-cols-4 gap-2 mt-2 text-xs">
                  <div><p className="text-[0.6rem] text-muted-foreground">Weight</p><p className="font-semibold">{fmtKg(l.affectedWeightKg)}</p></div>
                  <div><p className="text-[0.6rem] text-muted-foreground">Reason</p><p className="font-medium text-[0.7rem]">{l.reason.replace(/_/g, " ")}</p></div>
                  <div><p className="text-[0.6rem] text-muted-foreground">Shelf Life</p><p className="font-semibold text-orange-400">{l.remainingShelfLifeDays || "?"}d</p></div>
                  <div><p className="text-[0.6rem] text-muted-foreground">Listing Price</p><p className="font-semibold">{l.listingPrice ? fmtUsd(l.listingPrice) : "—"}</p></div>
                </div>
                {l.pricingExplanation && <p className="text-[0.65rem] text-muted-foreground italic mt-1.5">{l.pricingExplanation.slice(0, 120)}…</p>}
                {l.offers?.length > 0 && (
                  <div className="mt-2 p-2 rounded bg-gold/5 border border-gold/20">
                    <p className="text-xs font-semibold text-gold">{l.offers.length} offer(s):</p>
                    {l.offers.map((o: any) => (
                      <div key={o.id} className="text-[0.65rem] text-muted-foreground flex justify-between mt-0.5">
                        <span>{o.buyerName}: {fmtUsd(o.amountUsd)}</span>
                        <Badge variant="outline" className="text-[0.55rem]" style={{ color: statusColor(o.status) }}>{o.status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1.5 w-36">
                {l.status === "PENDING_ASSESSMENT" && <Button size="sm" className="bg-gold-gradient text-sovereign h-7" onClick={async () => { try { await jfetch("/api/sgtx/distressed/assess", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId: l.id }) }); toast.success("AI condition assessment complete"); reload(); } catch (e: any) { toast.error(e.message); } }}><Sparkles className="w-3 h-3 mr-1" />Assess</Button>}
                {l.status === "ASSESSED" && <Button size="sm" className="bg-gold-gradient text-sovereign h-7" onClick={async () => { try { await jfetch("/api/sgtx/distressed/price", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId: l.id }) }); toast.success("Dynamic pricing computed"); reload(); } catch (e: any) { toast.error(e.message); } }}><Coins className="w-3 h-3 mr-1" />Price</Button>}
                {l.status === "PRICED" && <Button size="sm" className="bg-gold-gradient text-sovereign h-7" onClick={() => setTriageModal(l)}><Zap className="w-3 h-3 mr-1" />Triage</Button>}
                {l.status === "LISTED" && <Button size="sm" variant="outline" className="h-7" onClick={() => setBuyersModal(l)}><Users className="w-3 h-3 mr-1" />Check Buyers</Button>}
                {l.status === "LISTED" && <Button size="sm" className="bg-gold-gradient text-sovereign h-7" onClick={() => setOutreachModal(l)}><Send className="w-3 h-3 mr-1" />Outreach</Button>}
                {l.offers?.some((o: any) => o.status === "SUBMITTED") && l.status === "OUTREACH_ACTIVE" && <Button size="sm" className="bg-gold-gradient text-sovereign h-7" onClick={() => setMicrocontractModal(l)}><CheckCircle2 className="w-3 h-3 mr-1" />Accept Offer</Button>}
                {l.triagePath === "INSURANCE_CLAIM" && <Button size="sm" variant="outline" className="h-7" onClick={async () => { try { await jfetch("/api/sgtx/distressed/insurance-claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId: l.id }) }); toast.success("Insurance claim evidence compiled"); reload(); } catch (e: any) { toast.error(e.message); } }}><FileText className="w-3 h-3 mr-1" />Insurance</Button>}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {declareModal && <DeclareModal onClose={() => setDeclareModal(false)} onSubmitted={() => { setDeclareModal(false); reload(); toast.success("Distressed cargo declared — AI assessment triggered."); }} />}
      {triageModal && <TriageModal listing={triageModal} onClose={() => setTriageModal(null)} onSelected={() => { setTriageModal(null); reload(); }} />}
      {buyersModal && <CheckBuyersModal listing={buyersModal} sellerGtid={tenantGtid!} onClose={() => setBuyersModal(null)} onContinue={(gtids) => { setBuyersModal(null); setOutreachModal({ ...buyersModal, selectedBuyers: gtids }); }} />}
      {outreachModal && <OutreachModal listing={outreachModal} sellerGtid={tenantGtid!} onClose={() => setOutreachModal(null)} onSent={() => { setOutreachModal(null); reload(); toast.success("Accelerated outreach sent to selected buyers."); }} />}
      {microcontractModal && <MicrocontractModal listing={microcontractModal} sellerGtid={tenantGtid!} onClose={() => setMicrocontractModal(null)} onLocked={() => { setMicrocontractModal(null); reload(); toast.success("Microcontract locked ✓"); }} />}
    </div>
  );
}

function DeclareModal({ onClose, onSubmitted }: { onClose: () => void; onSubmitted: () => void }) {
  const tenantGtid = useTenantGtid();
  const [ustn, setUstn] = useState("");
  const [reason, setReason] = useState("QUALITY_DETERIORATION");
  const [description, setDescription] = useState("");
  const [affectedPallets, setAffectedPallets] = useState("");
  const [affectedWeight, setAffectedWeight] = useState(0);
  const [commodity, setCommodity] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (description.trim().length < 10) { toast.error("Description must be ≥10 chars"); return; }
    setSubmitting(true);
    try {
      await jfetch("/api/sgtx/distressed/declare", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ustn, declarerGtid: tenantGtid, affectedPallets: affectedPallets.split(",").map(s => s.trim()).filter(Boolean), affectedWeightKg: affectedWeight, reason, description, commodity }),
      });
      onSubmitted();
    } catch (e: any) { toast.error(e.message); }
    finally { setSubmitting(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-orange-400" /> Declare Distressed Cargo</DialogTitle><DialogDescription>Phase 7 · G7U1: Only parties to the trade can declare · AI condition assessment runs automatically</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">USTN of affected trade</Label><Input value={ustn} onChange={(e) => setUstn(e.target.value)} placeholder="SGTX-..." className="font-mono text-xs h-9" /></div>
          <div><Label className="text-xs">Commodity</Label><Input value={commodity} onChange={(e) => setCommodity(e.target.value)} placeholder="e.g. Fresh Lemons" className="h-9" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Reason</Label><Select value={reason} onValueChange={setReason}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="DAMAGE">Damage</SelectItem><SelectItem value="QUALITY_DETERIORATION">Quality Deterioration</SelectItem><SelectItem value="SHELF_LIFE_EXPIRED">Shelf Life Expired</SelectItem><SelectItem value="ABANDONMENT">Abandonment</SelectItem><SelectItem value="DEMURRAGE">Demurrage</SelectItem><SelectItem value="OTHER">Other</SelectItem></SelectContent></Select></div>
            <div><Label className="text-xs">Affected Weight (kg)</Label><Input type="number" value={affectedWeight} onChange={(e) => setAffectedWeight(+e.target.value)} className="h-9" /></div>
          </div>
          <div><Label className="text-xs">Affected Pallets (comma-separated)</Label><Input value={affectedPallets} onChange={(e) => setAffectedPallets(e.target.value)} placeholder="LEM001, LEM002, LEM003" className="h-9" /></div>
          <div><Label className="text-xs">Description (min 10 chars)</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Lemons arrived with shrivelled peel and early signs of mould. 5 days shelf life remaining." className="min-h-[70px]" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-gold-gradient text-sovereign" onClick={submit} disabled={submitting || !ustn || description.trim().length < 10}>
            {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />} Submit Declaration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TriageModal({ listing, onClose, onSelected }: { listing: any; onClose: () => void; onSelected: () => void }) {
  const [selecting, setSelecting] = useState<string | null>(null);
  const select = async (path: string) => {
    setSelecting(path);
    try {
      await jfetch("/api/sgtx/distressed/triage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId: listing.id, path }) });
      toast.success(`Triage path selected: ${path.replace(/_/g, " ")}`);
      onSelected();
    } catch (e: any) { toast.error(e.message); }
    finally { setSelecting(null); }
  };
  const paths = [
    { id: "SELL_QUICKLY", label: "Sell Quickly", icon: Zap, desc: "Maximise speed of recovery. AI quick-sale price. Accelerated outreach ready.", color: "#10b981" },
    { id: "COMPLY_LOCAL_LAW", label: "Comply with Local Law", icon: ShieldCheck, desc: "Jurisdiction compliance assistant. Scans distressed sale rules, generates reports.", color: "#fbbf24" },
    { id: "INSURANCE_CLAIM", label: "File Insurance Claim", icon: FileText, desc: "Evidence package compiler with sensor logs, photos, AI claim narrative. Downloadable PDF.", color: "#60a5fa" },
  ];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Distressed Cargo Triage Dashboard</DialogTitle><DialogDescription>Three paths — each one click. Select the resolution strategy.</DialogDescription></DialogHeader>
        <div className="space-y-2">
          {paths.map(p => {
            const Icon = p.icon;
            return (
              <Card key={p.id} className="p-3 cursor-pointer hover:border-gold/40 transition-colors" >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${p.color}20`, color: p.color }}><Icon className="w-5 h-5" /></div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{p.label}</p>
                    <p className="text-[0.65rem] text-muted-foreground">{p.desc}</p>
                  </div>
                  <Button size="sm" className="bg-gold-gradient text-sovereign h-7" disabled={selecting === p.id} onClick={() => select(p.id)}>
                    {selecting === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Select"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CheckBuyersModal({ listing, sellerGtid, onClose, onContinue }: { listing: any; sellerGtid: string; onClose: () => void; onContinue: (gtids: string[]) => void }) {
  const [buyers, setBuyers] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    jfetch(`/api/sgtx/distressed/check-buyers?listingId=${listing.id}&sellerGtid=${sellerGtid}`)
      .then(d => setBuyers(d.buyers || []))
      .catch(() => setBuyers([]))
      .finally(() => setLoading(false));
  }, [listing.id, sellerGtid]);

  const toggle = (gtid: string) => setSelected(s => s.includes(gtid) ? s.filter(x => x !== gtid) : [...s, gtid]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Users className="w-4 h-4 text-gold" /> Check Buyers (Advisory)</DialogTitle><DialogDescription>G7U4: Shows existing saved contacts only · No notifications sent · LightGBM ranking</DialogDescription></DialogHeader>
        {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : buyers.length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">No eligible saved contacts.</p> : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {buyers.map((b) => (
              <div key={b.gtid} className={`flex items-center gap-3 p-2 rounded border ${selected.includes(b.gtid) ? "border-emerald-500/50 bg-emerald-500/5" : "border-border bg-muted/20"}`}>
                <Checkbox checked={selected.includes(b.gtid)} onCheckedChange={() => toggle(b.gtid)} />
                <div className="flex-1">
                  <p className="text-xs font-medium">{b.name}</p>
                  <p className="text-[0.6rem] text-muted-foreground font-mono">{b.gtid}</p>
                </div>
                <div className="text-right text-[0.65rem]">
                  <p>Trust: <span className="font-semibold">{b.trustScore}</span></p>
                  <p>Past: {b.pastDistressedPurchases} ({Math.round(b.completionRate * 100)}%)</p>
                </div>
                <Badge variant="outline" className="text-[0.6rem]" style={{ color: b.matchScore >= 80 ? "#10b981" : b.matchScore >= 60 ? "#fbbf24" : "#f87171" }}>{b.matchScore}</Badge>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-gold-gradient text-sovereign" disabled={selected.length === 0} onClick={() => onContinue(selected)}>
            Continue to Outreach ({selected.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OutreachModal({ listing, sellerGtid, onClose, onSent }: { listing: any; sellerGtid: string; onClose: () => void; onSent: () => void }) {
  const [window, setWindow] = useState(6);
  const [floorRatio, setFloorRatio] = useState(0.70);
  const [privacyAcked, setPrivacyAcked] = useState(false);
  const [sending, setSending] = useState(false);
  const buyers = listing.selectedBuyers || [];

  const send = async () => {
    if (!privacyAcked) { toast.error("Privacy notice opt-in required (G7U7)"); return; }
    setSending(true);
    try {
      await jfetch("/api/sgtx/distressed/outreach", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: listing.id, sellerGtid, selectedBuyerGtids: buyers, outreachWindowHours: window, floorPriceRatio: floorRatio, privacyOptIn: true }),
      });
      onSent();
    } catch (e: any) { toast.error(e.message); }
    finally { setSending(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Send className="w-4 h-4 text-gold" /> Accelerated Outreach</DialogTitle><DialogDescription>G7U7: Privacy notice opt-in mandatory · Cobranded "Seller via SGTX"</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <Card className="p-3 bg-amber-500/5 border-amber-500/30">
            <p className="text-xs font-semibold mb-1">⚠ Privacy Notice (mandatory)</p>
            <p className="text-[0.7rem] text-muted-foreground">You are about to initiate Accelerated Outreach for the distressed lot. {buyers.length} contacts will be notified simultaneously. The notification includes: product, quantity, condition score, asking price, and your company name. Recipients will know your identity.</p>
            <div className="flex items-center gap-2 mt-2"><Checkbox checked={privacyAcked} onCheckedChange={(c) => setPrivacyAcked(!!c)} /><Label className="text-xs">Yes, I want to proceed</Label></div>
          </Card>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Outreach Window (hours)</Label><Input type="number" value={window} onChange={(e) => setWindow(+e.target.value)} min={2} max={24} className="h-9" /></div>
            <div><Label className="text-xs">Floor Price Ratio</Label><Input type="number" step="0.05" value={floorRatio} onChange={(e) => setFloorRatio(+e.target.value)} className="h-9" /></div>
          </div>
          <p className="text-[0.65rem] text-muted-foreground">Floor price (never disclosed to recipients): {fmtUsd((listing.listingPrice || 0) * floorRatio)}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-gold-gradient text-sovereign" onClick={send} disabled={sending || !privacyAcked || buyers.length === 0}>
            {sending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />} Start Outreach ({buyers.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MicrocontractModal({ listing, sellerGtid, onClose, onLocked }: { listing: any; sellerGtid: string; onClose: () => void; onLocked: () => void }) {
  const acceptedOffer = listing.offers?.find((o: any) => o.status === "SUBMITTED");
  const [step, setStep] = useState<"accept" | "lock">("accept");
  const [mc, setMc] = useState<any>(null);
  const [processing, setProcessing] = useState(false);

  const accept = async () => {
    if (!acceptedOffer) { toast.error("No submitted offer to accept"); return; }
    setProcessing(true);
    try {
      const r = await jfetch("/api/sgtx/distressed/microcontract", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept", listingId: listing.id, offerId: acceptedOffer.id, sellerGtid }),
      });
      setMc(r); setStep("lock"); toast.success("Microcontract created — pay distressed fee to lock.");
    } catch (e: any) { toast.error(e.message); }
    finally { setProcessing(false); }
  };
  const lock = async () => {
    setProcessing(true);
    try {
      await jfetch("/api/sgtx/distressed/microcontract", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "lock", microContractId: mc.microContractId, sellerGtid }),
      });
      onLocked();
    } catch (e: any) { toast.error(e.message); }
    finally { setProcessing(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Lock className="w-4 h-4 text-gold" /> Microcontract & Distressed Fee</DialogTitle><DialogDescription>1.5% × country factor · Separate FeeLock · G7U6: fee must be paid before lock</DialogDescription></DialogHeader>
        {step === "accept" && acceptedOffer && (
          <div className="space-y-2">
            <div className="p-2 rounded bg-muted/30 text-xs">
              <p>Offer from <span className="font-semibold">{acceptedOffer.buyerName}</span></p>
              <p>Amount: <span className="font-semibold">{fmtUsd(acceptedOffer.amountUsd)}</span></p>
              {acceptedOffer.message && <p className="text-[0.65rem] text-muted-foreground italic">"{acceptedOffer.message}"</p>}
            </div>
            <Button className="bg-gold-gradient text-sovereign w-full" onClick={accept} disabled={processing}>
              {processing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />} Accept Offer & Create Microcontract
            </Button>
          </div>
        )}
        {step === "lock" && mc && (
          <div className="space-y-2">
            <div className="p-2 rounded bg-muted/30 text-xs space-y-1">
              <p>Microcontract: <span className="font-mono font-semibold">{mc.microContractId}</span></p>
              <p>microUSTN: <span className="font-mono text-[0.6rem]">{mc.microUstn.slice(0, 32)}…</span></p>
              <p>Agreed price: <span className="font-semibold">{fmtUsd(acceptedOffer.amountUsd)}</span></p>
              <p>Distressed fee ({mc.distressedFeeUsd ? "1.275%" : "1.5%"}): <span className="font-semibold text-amber-400">{fmtUsd(mc.distressedFeeUsd || 0)}</span></p>
              <p className="text-[0.6rem] text-muted-foreground">Seller pays fee upfront (PSP split). Microcontract locks after payment.</p>
            </div>
            <Button className="bg-gold-gradient text-sovereign w-full" onClick={lock} disabled={processing}>
              {processing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Coins className="w-3.5 h-3.5 mr-1" />} Pay Distressed Fee & Lock
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// 2. DISTRESSED OFFERS SCREEN (Buyer: view lots + submit offers)
// ============================================================
export function DistressedOffersScreen() {
  const tenantGtid = useTenantGtid();
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [offerModal, setOfferModal] = useState<any | null>(null);

  useEffect(() => {
    setTimeout(() => setLoading(true), 0);
    // Buyers see all distressed listings with active outreach (from Smart Inbox)
    jfetch(`/api/sgtx/distressed/listings?status=OUTREACH_ACTIVE`)
      .then(d => setListings(d.listings || []))
      .catch(() => setListings([]))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  if (loading) return <Card className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></Card>;

  return (
    <div className="space-y-4">
      <SectionHeader title="Distressed Cargo Offers" subtitle="Available distressed lots from your saved contacts · Submit offers · Express negotiation" action={<Button size="sm" variant="outline" onClick={() => setRefreshKey(k => k + 1)}><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh</Button>} />
      <div className="space-y-2">
        {listings.length === 0 ? <Card className="p-8 text-center text-sm text-muted-foreground">No distressed lots available. You'll be notified via Smart Inbox when a seller initiates outreach.</Card> : listings.map((l) => (
          <Card key={l.id} className="p-4 border-l-4 border-l-amber-500">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono font-semibold">{l.listingId}</span>
                  <Badge variant="outline" className="text-[0.6rem]" style={{ color: l.conditionScore >= 60 ? "#10b981" : l.conditionScore >= 30 ? "#fbbf24" : "#f87171" }}>Score {l.conditionScore}</Badge>
                  {l.remainingShelfLifeDays && <Badge variant="outline" className="text-[0.6rem] text-orange-400 border-orange-500/30">{l.remainingShelfLifeDays}d shelf life</Badge>}
                </div>
                <p className="text-sm font-semibold">{l.commodity}</p>
                <p className="text-[0.65rem] text-muted-foreground">{fmtKg(l.affectedWeightKg)} · asking {fmtUsd(l.listingPrice)} · {l.reason.replace(/_/g, " ")}</p>
                {l.outreachWindowEndsAt && <p className="text-[0.6rem] text-amber-400 mt-0.5">⏱ Outreach window closes: {fmtDate(l.outreachWindowEndsAt)}</p>}
              </div>
              <Button size="sm" className="bg-gold-gradient text-sovereign h-7" onClick={() => setOfferModal(l)}><Coins className="w-3 h-3 mr-1" />Submit Offer</Button>
            </div>
          </Card>
        ))}
      </div>
      {offerModal && <SubmitOfferModal listing={offerModal} buyerGtid={tenantGtid!} onClose={() => setOfferModal(null)} onSubmitted={() => { setOfferModal(null); setRefreshKey(k => k + 1); toast.success("Offer submitted ✓"); }} />}
    </div>
  );
}

function SubmitOfferModal({ listing, buyerGtid, onClose, onSubmitted }: { listing: any; buyerGtid: string; onClose: () => void; onSubmitted: () => void }) {
  const [amount, setAmount] = useState(listing.listingPrice || 0);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    setSubmitting(true);
    try {
      const tenant = await jfetch(`/api/sgtx/tenants?gtid=${buyerGtid}`);
      await jfetch("/api/sgtx/distressed/offer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: listing.id, buyerGtid, buyerName: tenant.tenant?.legalName || "Buyer", amountUsd: amount, message }),
      });
      onSubmitted();
    } catch (e: any) { toast.error(e.message); }
    finally { setSubmitting(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Submit Offer — {listing.listingId}</DialogTitle><DialogDescription>{listing.commodity} · {fmtKg(listing.affectedWeightKg)} · Score {listing.conditionScore}</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Offer Amount (USD)</Label><Input type="number" value={amount} onChange={(e) => setAmount(+e.target.value)} className="h-9" /><p className="text-[0.6rem] text-muted-foreground mt-0.5">Asking: {fmtUsd(listing.listingPrice)}. You don't see the floor price.</p></div>
          <div><Label className="text-xs">Message (optional)</Label><Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. We can take the lot for juice processing. Pickup within 24h." className="min-h-[50px]" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-gold-gradient text-sovereign" onClick={submit} disabled={submitting || amount <= 0}>
            {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />} Submit Offer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
