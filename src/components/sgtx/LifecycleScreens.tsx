// @ts-nocheck
"use client";
// SGTX Lifecycle Stage Screens — REC-P1 #4
// Portal UI for the 5 new lifecycle stages: Negotiation, PO/SO, Proforma, Regulatory Snapshot
// Plus Competitor Benchmark screen (REC-Strategic #10)
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { SectionHeader } from "@/components/portals/PortalContent";

type Data = any;

function normalizeArray(data: any): any[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.negotiations)) return data.negotiations;
  if (Array.isArray(data?.quotes)) return data.quotes;
  if (Array.isArray(data?.purchaseOrders)) return data.purchaseOrders;
  if (Array.isArray(data?.salesOrders)) return data.salesOrders;
  if (Array.isArray(data?.proformas)) return data.proformas;
  if (Array.isArray(data?.snapshots)) return data.snapshots;
  return [];
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-5 h-5 animate-spin text-gold" />
      <span className="ml-2 text-sm text-muted-foreground">Loading…</span>
    </div>
  );
}

function EmptyState({ msg }: { msg: string }) {
  return <div className="text-center py-12"><p className="text-sm text-muted-foreground">{msg}</p></div>;
}

// ── Negotiations Screen ──
export function NegotiationsScreen({ data }: { data: Data }) {
  const tenantGtid = data?.tenant?.gtid;
  const { data: resp, isLoading } = useQuery({
    queryKey: ["negotiations", tenantGtid],
    queryFn: async () => {
      try { return await (await fetch(`/api/sgtx/negotiation${tenantGtid ? `?ustn=` + tenantGtid : ""}`)).json(); }
      catch { return { negotiations: [] }; }
    },
    staleTime: 30_000,
  });
  const items = normalizeArray(resp);
  return (
    <div className="space-y-4 w-full max-w-7xl mx-auto">
      <SectionHeader title="Negotiations" subtitle="Buyer-seller back-and-forth on quote terms · Article 129 lifecycle stage" />
      <Card className="p-4 min-w-0 overflow-hidden">
        {isLoading ? <LoadingState /> : items.length === 0 ? <EmptyState msg="No negotiations yet. Negotiations start when a counterparty proposes changes to a quote." /> : (
          <div className="overflow-x-auto scroll-gold">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 text-muted-foreground"><tr><th className="text-left font-semibold p-2.5">USTN</th><th className="text-left font-semibold p-2.5">Round</th><th className="text-left font-semibold p-2.5">Proposed By</th><th className="text-left font-semibold p-2.5">Type</th><th className="text-left font-semibold p-2.5">Status</th><th className="text-left font-semibold p-2.5">Created</th></tr></thead>
              <tbody>{items.map((n: any) => (<tr key={n.id} className="border-t border-border hover:bg-muted/20"><td className="p-2.5 font-mono text-[0.65rem]">{n.ustn}</td><td className="p-2.5">{n.round}</td><td className="p-2.5 truncate max-w-[120px]">{n.proposedBy}</td><td className="p-2.5">{n.proposalType}</td><td className="p-2.5"><Badge variant={n.status === "ACCEPTED" ? "default" : n.status === "REJECTED" ? "destructive" : "secondary"}>{n.status}</Badge></td><td className="p-2.5 text-[0.65rem] text-muted-foreground">{n.createdAt ? new Date(n.createdAt).toLocaleDateString() : "—"}</td></tr>))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Purchase Orders Screen ──
export function PurchaseOrdersScreen({ data }: { data: Data }) {
  const tenantGtid = data?.tenant?.gtid;
  const { data: resp, isLoading } = useQuery({
    queryKey: ["purchase-orders", tenantGtid],
    queryFn: async () => {
      try { return await (await fetch(`/api/sgtx/orders/purchase-order${tenantGtid ? `?buyerGtid=` + tenantGtid : ""}`)).json(); }
      catch { return { purchaseOrders: [] }; }
    },
    staleTime: 30_000,
  });
  const items = normalizeArray(resp);
  return (
    <div className="space-y-4 w-full max-w-7xl mx-auto">
      <SectionHeader title="Purchase Orders" subtitle="Formal buyer→seller order documents · Article 129 lifecycle stage" />
      <Card className="p-4 min-w-0 overflow-hidden">
        {isLoading ? <LoadingState /> : items.length === 0 ? <EmptyState msg="No purchase orders yet. Create a PO from a quoted trade." /> : (
          <div className="overflow-x-auto scroll-gold">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 text-muted-foreground"><tr><th className="text-left font-semibold p-2.5">PO Number</th><th className="text-left font-semibold p-2.5">USTN</th><th className="text-left font-semibold p-2.5">Seller</th><th className="text-right font-semibold p-2.5">Value</th><th className="text-left font-semibold p-2.5">Status</th><th className="text-left font-semibold p-2.5">Date</th></tr></thead>
              <tbody>{items.map((p: any) => (<tr key={p.id} className="border-t border-border hover:bg-muted/20"><td className="p-2.5 font-mono text-[0.65rem]">{p.poNumber}</td><td className="p-2.5 font-mono text-[0.65rem]">{p.ustn}</td><td className="p-2.5 truncate max-w-[120px]">{p.sellerGtid}</td><td className="p-2.5 text-right font-medium">${(p.totalValue || 0).toLocaleString()}</td><td className="p-2.5"><Badge variant={p.status === "ACCEPTED" ? "default" : p.status === "REJECTED" ? "destructive" : "secondary"}>{p.status}</Badge></td><td className="p-2.5 text-[0.65rem] text-muted-foreground">{p.orderDate ? new Date(p.orderDate).toLocaleDateString() : "—"}</td></tr>))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Sales Orders Screen ──
export function SalesOrdersScreen({ data }: { data: Data }) {
  const tenantGtid = data?.tenant?.gtid;
  const { data: resp, isLoading } = useQuery({
    queryKey: ["sales-orders", tenantGtid],
    queryFn: async () => {
      try { return await (await fetch(`/api/sgtx/orders/sales-order${tenantGtid ? `?sellerGtid=` + tenantGtid : ""}`)).json(); }
      catch { return { salesOrders: [] }; }
    },
    staleTime: 30_000,
  });
  const items = normalizeArray(resp);
  return (
    <div className="space-y-4 w-full max-w-7xl mx-auto">
      <SectionHeader title="Sales Orders" subtitle="Seller's matching acceptance of a purchase order · Article 129 lifecycle stage" />
      <Card className="p-4 min-w-0 overflow-hidden">
        {isLoading ? <LoadingState /> : items.length === 0 ? <EmptyState msg="No sales orders yet. SOs are created when a seller accepts a PO." /> : (
          <div className="overflow-x-auto scroll-gold">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 text-muted-foreground"><tr><th className="text-left font-semibold p-2.5">SO Number</th><th className="text-left font-semibold p-2.5">USTN</th><th className="text-left font-semibold p-2.5">Buyer</th><th className="text-right font-semibold p-2.5">Value</th><th className="text-left font-semibold p-2.5">Status</th><th className="text-left font-semibold p-2.5">Date</th></tr></thead>
              <tbody>{items.map((s: any) => (<tr key={s.id} className="border-t border-border hover:bg-muted/20"><td className="p-2.5 font-mono text-[0.65rem]">{s.soNumber}</td><td className="p-2.5 font-mono text-[0.65rem]">{s.ustn}</td><td className="p-2.5 truncate max-w-[120px]">{s.buyerGtid}</td><td className="p-2.5 text-right font-medium">${(s.totalValue || 0).toLocaleString()}</td><td className="p-2.5"><Badge variant={s.status === "FULFILLED" ? "default" : s.status === "REJECTED" ? "destructive" : "secondary"}>{s.status}</Badge></td><td className="p-2.5 text-[0.65rem] text-muted-foreground">{s.orderDate ? new Date(s.orderDate).toLocaleDateString() : "—"}</td></tr>))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Proforma Invoices Screen ──
export function ProformaInvoicesScreen({ data }: { data: Data }) {
  const tenantGtid = data?.tenant?.gtid;
  const { data: resp, isLoading } = useQuery({
    queryKey: ["proforma-invoices", tenantGtid],
    queryFn: async () => {
      try { return await (await fetch(`/api/sgtx/proforma${tenantGtid ? `?sellerGtid=` + tenantGtid : ""}`)).json(); }
      catch { return { proformas: [] }; }
    },
    staleTime: 30_000,
  });
  const items = normalizeArray(resp);
  return (
    <div className="space-y-4 w-full max-w-7xl mx-auto">
      <SectionHeader title="Proforma Invoices" subtitle="Pre-contract seller→buyer invoices · Article 129 lifecycle stage" />
      <Card className="p-4 min-w-0 overflow-hidden">
        {isLoading ? <LoadingState /> : items.length === 0 ? <EmptyState msg="No proforma invoices yet. PIs are created before contract signing." /> : (
          <div className="overflow-x-auto scroll-gold">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 text-muted-foreground"><tr><th className="text-left font-semibold p-2.5">PI Number</th><th className="text-left font-semibold p-2.5">USTN</th><th className="text-left font-semibold p-2.5">Buyer</th><th className="text-right font-semibold p-2.5">Amount</th><th className="text-left font-semibold p-2.5">Status</th><th className="text-left font-semibold p-2.5">Valid Until</th></tr></thead>
              <tbody>{items.map((p: any) => (<tr key={p.id} className="border-t border-border hover:bg-muted/20"><td className="p-2.5 font-mono text-[0.65rem]">{p.proformaNumber}</td><td className="p-2.5 font-mono text-[0.65rem]">{p.ustn}</td><td className="p-2.5 truncate max-w-[120px]">{p.buyerGtid}</td><td className="p-2.5 text-right font-medium">${(p.totalAmount || 0).toLocaleString()}</td><td className="p-2.5"><Badge variant={p.status === "ACCEPTED" ? "default" : p.status === "REJECTED" || p.status === "EXPIRED" ? "destructive" : "secondary"}>{p.status}</Badge></td><td className="p-2.5 text-[0.65rem] text-muted-foreground">{p.validUntil ? new Date(p.validUntil).toLocaleDateString() : "—"}</td></tr>))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Regulatory Snapshots Screen ──
export function RegulatorySnapshotsScreen({ data }: { data: Data }) {
  const { data: resp, isLoading } = useQuery({
    queryKey: ["regulatory-snapshots"],
    queryFn: async () => {
      try { return await (await fetch("/api/sgtx/regulatory-snapshot")).json(); }
      catch { return { snapshots: [] }; }
    },
    staleTime: 60_000,
  });
  const items = normalizeArray(resp);
  return (
    <div className="space-y-4 w-full max-w-7xl mx-auto">
      <SectionHeader title="Regulatory Snapshots" subtitle="Immutable per-trade regulatory captures (SHA-256 hashed) · Article 129 lifecycle stage" />
      <Card className="p-4 min-w-0 overflow-hidden">
        {isLoading ? <LoadingState /> : items.length === 0 ? <EmptyState msg="No regulatory snapshots yet. Snapshots are captured automatically when a trade is locked." /> : (
          <div className="overflow-x-auto scroll-gold">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 text-muted-foreground"><tr><th className="text-left font-semibold p-2.5">USTN</th><th className="text-left font-semibold p-2.5">Route</th><th className="text-left font-semibold p-2.5">HS Code</th><th className="text-left font-semibold p-2.5">Tariff</th><th className="text-left font-semibold p-2.5">Sanctions</th><th className="text-left font-semibold p-2.5">Hash</th><th className="text-left font-semibold p-2.5">Captured</th></tr></thead>
              <tbody>{items.map((s: any) => (<tr key={s.id} className="border-t border-border hover:bg-muted/20"><td className="p-2.5 font-mono text-[0.65rem]">{s.ustn}</td><td className="p-2.5 text-[0.65rem]">{s.originCountry} → {s.destinationCountry}</td><td className="p-2.5 font-mono text-[0.65rem]">{s.hsCode}</td><td className="p-2.5">{s.tariffRate ? `${s.tariffRate}%` : "—"}</td><td className="p-2.5"><Badge variant={s.sanctionsStatus === "CLEAR" ? "default" : "destructive"}>{s.sanctionsStatus || "—"}</Badge></td><td className="p-2.5 font-mono text-[0.55rem] truncate max-w-[100px]">{s.snapshotHash?.slice(0, 16)}…</td><td className="p-2.5 text-[0.65rem] text-muted-foreground">{s.capturedAt ? new Date(s.capturedAt).toLocaleDateString() : "—"}</td></tr>))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Competitor Benchmark Screen ──
export function CompetitorBenchmarkScreen() {
  const { data, isLoading } = useQuery({
    queryKey: ["competitor-benchmark"],
    queryFn: async () => {
      try { return await (await fetch("/api/sgtx/competitor-benchmark")).json(); }
      catch { return { sgtx: {}, competitors: [], sgtxAdvantages: [] }; }
    },
    staleTime: 300_000,
  });
  if (isLoading) return <LoadingState />;
  const comps = data?.competitors || [];
  const sgtx = data?.sgtx || {};
  const advantages = data?.sgtxAdvantages || [];
  const dimensions = [
    { key: "tradeExecutionTime", label: "Execution Time" },
    { key: "costPerTrade", label: "Cost/Trade" },
    { key: "coverage", label: "Coverage" },
    { key: "aiCapabilities", label: "AI Capabilities" },
    { key: "nonCustodial", label: "Non-Custodial" },
    { key: "ustnTracking", label: "USTN Tracking" },
    { key: "regulatorySnapshots", label: "Reg. Snapshots" },
    { key: "evidencePackages", label: "Evidence Packages" },
  ];
  return (
    <div className="space-y-4 w-full max-w-7xl mx-auto">
      <SectionHeader title="Competitor Benchmark" subtitle="SGTX vs leading trade platforms · 2026 state-of-art comparison" />
      <Card className="p-4 min-w-0 overflow-hidden">
        <div className="overflow-x-auto scroll-gold">
          <table className="w-full text-xs">
            <thead className="bg-muted/30 text-muted-foreground">
              <tr><th className="text-left font-semibold p-2.5">Dimension</th><th className="text-left font-semibold p-2.5 bg-gold/10 text-gold">SGTX</th>{comps.map((c: any) => (<th key={c.name} className="text-left font-semibold p-2.5">{c.name}</th>))}</tr>
            </thead>
            <tbody>
              {dimensions.map((d) => (
                <tr key={d.key} className="border-t border-border">
                  <td className="p-2.5 font-medium">{d.label}</td>
                  <td className="p-2.5 bg-gold/5 font-semibold text-foreground">{typeof (sgtx as any)[d.key] === "boolean" ? ((sgtx as any)[d.key] ? "Yes" : "No") : (sgtx as any)[d.key] || "—"}</td>
                  {comps.map((c: any) => (<td key={c.name + d.key} className="p-2.5">{typeof c[d.key] === "boolean" ? (c[d.key] ? "Yes" : "No") : c[d.key] || "—"}</td>))}
                </tr>
              ))}
              <tr className="border-t border-border"><td className="p-2.5 font-medium">Status</td><td className="p-2.5 bg-gold/5 font-bold text-gold">v13.1 FINAL</td>{comps.map((c: any) => (<td key={c.name + "status"} className="p-2.5 text-[0.65rem]">{c.status}</td>))}</tr>
            </tbody>
          </table>
        </div>
      </Card>
      <Card className="p-4 border-gold/20 bg-gold/5">
        <h3 className="text-sm font-semibold text-gold mb-3 flex items-center gap-2">Why SGTX Wins</h3>
        <ul className="space-y-1.5">
          {advantages.map((a: string, i: number) => (
            <li key={i} className="text-xs text-foreground/90 flex items-start gap-2"><span className="text-gold flex-shrink-0">▸</span>{a}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
