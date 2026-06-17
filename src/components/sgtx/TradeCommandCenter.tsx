"use client";

import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/store/app-store";
import { SgtxLogo } from "@/components/sgtx/SgtxLogo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fmtUsd, fmtDate, fmtDateTime, fmtKg, statusColor, healthComponents } from "@/lib/sgtx/format";
import { HealthBadge, HealthBreakdown, PhaseTimeline, PendingActionPanel, DocumentsList, ActivityFeed } from "@/components/sgtx/widgets";
import { X, Copy, Share2, FileDown, MapPin, Thermometer, Ship, Container, Building2, ArrowLeft, MessageSquare, Send, Sparkles, FileText, Banknote, AlertTriangle, ShieldCheck } from "lucide-react";
import { useState } from "react";

export function TradeCommandCenter() {
  const ustn = useAppStore((s) => s.activeUstn);
  const closeTcc = useAppStore((s) => s.closeTcc);
  const activeTenantGtid = useAppStore((s) => s.activeTenantGtid);
  const [copied, setCopied] = useState(false);
  const [activeSummary, setActiveSummary] = useState<"all" | "commercial" | "parties" | "shipment" | "documents" | "finances" | "risk">("all");

  const { data: trade, isLoading } = useQuery({
    queryKey: ["tcc", ustn],
    queryFn: async () => (await fetch(`/api/sgtx/trade?ustn=${ustn}`)).json(),
    enabled: !!ustn,
  });

  const copyUstn = () => { navigator.clipboard.writeText(ustn || ""); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  if (!ustn) return null;

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      {/* TCC Header */}
      <header className="border-b border-border/50 bg-sidebar/50 backdrop-blur px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={closeTcc} className="h-9 w-9 flex-shrink-0"><ArrowLeft className="w-4 h-4" /></Button>
          <SgtxLogo size={32} animated={false} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">Trade Command Center</p>
              {trade && <HealthBadge score={trade.healthScore} />}
            </div>
            <button onClick={copyUstn} className="font-mono text-xs sm:text-sm text-foreground hover:text-gold transition-colors flex items-center gap-1.5 truncate">
              {ustn} <Copy className="w-3 h-3" />{copied && <span className="text-emerald-400 text-[0.6rem]">copied!</span>}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Button variant="outline" size="sm" className="h-8 hidden sm:flex"><Share2 className="w-3.5 h-3.5 mr-1.5" />Share Room</Button>
          <Button variant="outline" size="sm" className="h-8 hidden sm:flex"><FileDown className="w-3.5 h-3.5 mr-1.5" />Export</Button>
          <Button variant="ghost" size="icon" onClick={closeTcc} className="h-9 w-9 sm:hidden"><X className="w-4 h-4" /></Button>
        </div>
      </header>

      {isLoading || !trade ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3"><SgtxLogo size={56} animated /><p className="text-xs text-muted-foreground tracking-widest uppercase">Loading TCC…</p></div>
        </div>
      ) : (
        <ScrollArea className="flex-1 scroll-gold">
          <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4">
            {/* Status bar */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline" className="text-[0.65rem]" style={{ color: statusColor(trade.status), borderColor: `${statusColor(trade.status)}55` }}>{trade.status.replace(/_/g, " ")}</Badge>
              <span className="text-muted-foreground">Phase {trade.phase}/8 · {["Foundation","Initiation","Quote","Contracting","Financing","Execution","Settlement","Distressed","Dispute"][trade.phase]}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{trade.incoterm} · {trade.commodity}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">Created {fmtDate(trade.createdAt)}</span>
            </div>

            {/* Pending action */}
            <PendingActionPanel trade={trade} perspective={trade.buyerGtid === activeTenantGtid ? "Buyer" : trade.sellerGtid === activeTenantGtid ? "Seller" : "Observer"} />

            {/* Timeline */}
            <PhaseTimeline trade={trade} />

            {/* Health breakdown */}
            <HealthBreakdown trade={trade} />

            {/* Summary cards grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Parties */}
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-3"><Building2 className="w-4 h-4 text-gold" /><h3 className="font-semibold text-sm">Parties</h3></div>
                <div className="space-y-3">
                  {[{ role: "Buyer", t: trade.buyer }, { role: "Seller", t: trade.seller }].map(({ role, t }) => (
                    <div key={role} className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-bold" style={{ background: t.logoColor }}>{t.legalName.charAt(0)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{t.legalName}</p>
                        <p className="text-[0.6rem] text-muted-foreground font-mono truncate">{t.gtid}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[0.6rem] text-muted-foreground">Trust</p>
                        <p className="text-xs font-semibold" style={{ color: statusColor("VERIFIED") }}>{t.trustScore}</p>
                      </div>
                      <Badge variant="outline" className="text-[0.6rem]">KYB {t.kybTier}</Badge>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Commercial terms */}
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-3"><Banknote className="w-4 h-4 text-gold" /><h3 className="font-semibold text-sm">Commercial Terms</h3></div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div><p className="text-muted-foreground text-[0.65rem]">Incoterm</p><p className="font-semibold">{trade.incoterm}</p></div>
                  <div><p className="text-muted-foreground text-[0.65rem]">Trade Value</p><p className="font-semibold">{fmtUsd(trade.tradeValueUsd)}</p></div>
                  <div><p className="text-muted-foreground text-[0.65rem]">Net Weight</p><p className="font-semibold">{fmtKg(trade.netWeightKg)}</p></div>
                  <div><p className="text-muted-foreground text-[0.65rem]">Gross Weight</p><p className="font-semibold">{fmtKg(trade.grossWeightKg)}</p></div>
                  <div><p className="text-muted-foreground text-[0.65rem]">SGTX Fee (1.5%)</p><p className="font-semibold text-gold">{fmtUsd(trade.sgtxFeeUsd)}</p></div>
                  <div><p className="text-muted-foreground text-[0.65rem]">HS Code</p><p className="font-mono">{trade.commodityHs}</p></div>
                  <div className="col-span-2"><p className="text-muted-foreground text-[0.65rem]">Route</p><p className="font-semibold">{trade.originPort} → {trade.destPort}</p></div>
                </div>
              </Card>

              {/* Shipment status */}
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-3"><Ship className="w-4 h-4 text-gold" /><h3 className="font-semibold text-sm">Shipment Status {trade.multiShipment && <Badge variant="outline" className="text-[0.55rem] ml-1">Multi · {trade.shipments.length}</Badge>}</h3></div>
                <div className="space-y-2.5">
                  {trade.shipments.map((s: any) => (
                    <div key={s.id} className="p-2.5 rounded-lg bg-muted/30 border border-border/40">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-semibold">Shipment {s.sequence} · {s.vesselName || "TBD"}</p>
                        <span className="px-2 py-0.5 rounded-full text-[0.55rem] font-semibold" style={{ color: statusColor(s.status), background: `${statusColor(s.status)}1a` }}>{s.status.replace(/_/g, " ")}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[0.65rem] text-muted-foreground">
                        <span className="flex items-center gap-1"><Container className="w-3 h-3" /> {s.containerNo}</span>
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {s.lat?.toFixed(1)}, {s.lng?.toFixed(1)}</span>
                        {trade.coldChain && <span className="flex items-center gap-1"><Thermometer className="w-3 h-3" /> {s.coldChainTemp}°C</span>}
                        <span>ETA {fmtDate(s.eta)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Risk & compliance */}
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-3"><ShieldCheck className="w-4 h-4 text-gold" /><h3 className="font-semibold text-sm">Risk & Compliance</h3></div>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">Sanctions (Buyer)</span><span className="text-emerald-400 flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Cleared</span></div>
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">Sanctions (Seller)</span><span className="text-emerald-400 flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Cleared</span></div>
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">GNN Proximity</span><span className="text-emerald-400">&gt; 2 hops</span></div>
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">Dual-use screening</span><span className="text-emerald-400">Not flagged</span></div>
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">Cold chain</span><span className={trade.coldChain ? "text-emerald-400" : "text-muted-foreground"}>{trade.coldChain ? "Required · −18°C" : "N/A"}</span></div>
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">Disputes</span><span className={trade.disputes?.length ? "text-red-400" : "text-emerald-400"}>{trade.disputes?.length || 0} open</span></div>
                </div>
              </Card>
            </div>

            {/* Documents + Finances */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <DocumentsList documents={trade.documents} />
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-3"><Banknote className="w-4 h-4 text-gold" /><h3 className="font-semibold text-sm">Finances & Settlement</h3></div>
                <div className="space-y-2">
                  {trade.invoices.map((inv: any) => (
                    <div key={inv.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/20 text-xs">
                      <span className="flex-1 truncate"><span className="font-medium">{inv.number}</span> <span className="text-muted-foreground">· {inv.type.replace(/_/g, " ")}</span></span>
                      <span className="font-semibold">{fmtUsd(inv.amountUsd)}</span>
                      <span className="px-1.5 py-0.5 rounded text-[0.55rem] font-semibold" style={{ color: statusColor(inv.status), background: `${statusColor(inv.status)}1a` }}>{inv.status}</span>
                    </div>
                  ))}
                  {trade.financing?.length > 0 && (
                    <div className="mt-2 p-2.5 rounded-lg bg-gold/5 border border-gold/20">
                      <p className="text-[0.65rem] text-gold font-semibold uppercase tracking-wider">Financing Active</p>
                      <p className="text-xs mt-0.5">{trade.financing[0].purpose} · {fmtUsd(trade.financing[0].amountUsd)} · {trade.financing[0].status}</p>
                      <p className="text-[0.6rem] text-muted-foreground mt-0.5">{trade.financing[0].bids?.length} bids received</p>
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* Lab / QC / Customs */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {trade.labTests?.length > 0 && (
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-2"><span className="text-base">🧪</span><h3 className="font-semibold text-sm">Lab Tests</h3></div>
                  {trade.labTests.map((lt: any) => (
                    <div key={lt.id} className="text-xs">
                      <div className="flex items-center justify-between"><span className="text-muted-foreground">{lt.testType.replace(/_/g, " ")}</span><span className="font-semibold" style={{ color: statusColor(lt.passFail) }}>{lt.passFail}</span></div>
                      <p className="text-[0.65rem] text-muted-foreground mt-0.5">{lt.result}</p>
                      {lt.parameters && <pre className="text-[0.6rem] text-muted-foreground mt-1 whitespace-pre-wrap">{JSON.parse(lt.parameters) && Object.entries(JSON.parse(lt.parameters)).map(([k, v]) => `${k}: ${v}`).join("\n")}</pre>}
                    </div>
                  ))}
                </Card>
              )}
              {trade.qcInspections?.length > 0 && (
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-2"><span className="text-base">✓</span><h3 className="font-semibold text-sm">QC Inspection</h3></div>
                  {trade.qcInspections.map((qc: any) => (
                    <div key={qc.id} className="text-xs">
                      <div className="flex items-center justify-between"><span className="text-muted-foreground">{qc.inspectionType.replace(/_/g, " ")}</span><span className="font-semibold" style={{ color: statusColor(qc.result) }}>{qc.result?.replace(/_/g, " ")}</span></div>
                      <p className="text-[0.65rem] text-muted-foreground mt-0.5">{qc.notes}</p>
                      <p className="text-[0.6rem] text-muted-foreground mt-0.5">Defects: {qc.defectCount} · Inspector: {qc.inspectorName}</p>
                    </div>
                  ))}
                </Card>
              )}
              {trade.customsDecls?.length > 0 && (
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-2"><span className="text-base">🏛</span><h3 className="font-semibold text-sm">Customs</h3></div>
                  {trade.customsDecls.map((cd: any) => (
                    <div key={cd.id} className="text-xs">
                      <div className="flex items-center justify-between"><span className="text-muted-foreground">{cd.regime} · {cd.declarationNo}</span><span className="font-semibold" style={{ color: statusColor(cd.status) }}>{cd.status}</span></div>
                      <p className="text-[0.65rem] text-muted-foreground mt-0.5">Nafeza: {cd.nafezaStatus}</p>
                      {cd.clearedAt && <p className="text-[0.6rem] text-muted-foreground mt-0.5">Cleared {fmtDate(cd.clearedAt)}</p>}
                    </div>
                  ))}
                </Card>
              )}
            </div>

            {/* Activity + Chat */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ActivityFeed activities={trade.activities} max={15} />
              <CollaborativeTradeRoom trade={trade} />
            </div>

            {/* Services (quotations) */}
            {trade.quotations?.length > 0 && (
              <Card className="p-4">
                <h3 className="font-semibold text-sm mb-3">Optional Services (Quotation-Driven, Non-Marketplace)</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {trade.quotations.map((q: any) => (
                    <div key={q.id} className="p-3 rounded-lg bg-muted/30 border border-border/40">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold">{q.serviceType}</span>
                        <span className="text-[0.6rem] px-1.5 py-0.5 rounded" style={{ color: statusColor(q.status), background: `${statusColor(q.status)}1a` }}>{q.status}</span>
                      </div>
                      <p className="text-[0.65rem] text-muted-foreground">{q.provider?.legalName}</p>
                      <p className="text-sm font-semibold mt-1">{fmtUsd(q.feeUsd)}</p>
                      <p className="text-[0.6rem] text-muted-foreground mt-1">{q.description}</p>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <div className="text-center py-4">
              <p className="text-[0.6rem] text-muted-foreground tracking-wider">🔐 USTN embedded in every document, API call & payment reference · Governor-gated · Loom audit trail</p>
            </div>
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

function CollaborativeTradeRoom({ trade }: { trade: any }) {
  const [msg, setMsg] = useState("");
  const messages = trade.chatMessages || [];
  return (
    <Card className="p-4 flex flex-col h-[320px]">
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <MessageSquare className="w-4 h-4 text-gold" />
        <h3 className="font-semibold text-sm">Collaborative Trade Room</h3>
        <span className="text-[0.6rem] text-muted-foreground ml-auto">🔄 NATS live</span>
      </div>
      <ScrollArea className="flex-1 scroll-gold pr-2">
        <div className="space-y-2.5">
          {messages.map((m: any) => (
            <div key={m.id} className={`flex gap-2 ${m.isAi ? "" : ""}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[0.65rem] font-bold ${m.isAi ? "bg-gold-gradient text-sovereign" : "bg-muted text-foreground"}`}>
                {m.isAi ? <Sparkles className="w-3.5 h-3.5" /> : m.senderName.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[0.6rem] text-muted-foreground">{m.senderName} · {fmtDateTime(m.createdAt)}</p>
                <p className={`text-xs leading-snug mt-0.5 ${m.isAi ? "text-gold/90 italic" : "text-foreground"}`}>{m.message}</p>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
      <div className="flex items-center gap-2 mt-2 flex-shrink-0">
        <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Message the trade room…" className="flex-1 bg-muted/50 rounded-full px-3 py-1.5 text-xs outline-none" />
        <Button size="icon" className="h-8 w-8 bg-gold-gradient text-sovereign"><Send className="w-3.5 h-3.5" /></Button>
      </div>
    </Card>
  );
}
