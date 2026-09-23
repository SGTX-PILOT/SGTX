"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// COCKPIT-Phase 2: The Trade Workspace (/trades/[ustn])
// ═══════════════════════════════════════════════════════════════════════════════
//
// THE most important screen in the product. Layout (top to bottom):
//   HEADER       — product + route summary, status pill, USTN (T5)
//   NEXT ACTION  — single T1 thing this user must do now
//   TRADE SUMMARY — T2 one-glance facts
//   BLOCKERS     — T3 exceptions with owner + due date
//   TIMELINE     — 9-stage derived lifecycle (Request → Completed)
//   ACTIVITY     — 3-5 latest events
//   DRAWER TABS  — T4: Documents · Payments · Compliance · Messages · Details
//   EXPERT MODE  — T5 toggle: event spine, clocks, evidence chain, integrations
//
// Acceptance: any role opening this URL sees the same trade through their
// perspective; every field traces to real backend data (dashboard API).
//
// The trade data is fetched from the existing /api/sgtx/dashboard?tenant=GTID
// endpoint (returns tradesAsBuyer + tradesAsSeller + activities + invoices).
// The route is purely additive — no backend changes.

import { use, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CockpitShell, shouldShowAdmin } from "@/components/cockpit/CockpitShell";
import { useSession, fetchWithAuth } from "@/lib/cockpit/session";
import { BuyerNegotiationPanel } from "@/components/sgtx/BuyerNegotiationPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  AlertTriangle, ArrowRight, ChevronLeft, CheckCircle2, Circle, Clock,
  FileText, DollarSign, ShieldCheck, MessageSquare, Info, Eye, EyeOff,
  Truck, Package, MapPin, Calendar, Thermometer,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardData {
  tenant?: { gtid: string; legalName: string; type: string; country?: string };
  tradesAsBuyer?: any[];
  tradesAsSeller?: any[];
  activities?: any[];
  invoices?: any[];
}

interface Trade {
  id: string;
  ustn: string;
  commodity: string;
  commodityHs?: string;
  status: string;
  phase?: number;
  originCountry?: string;
  destinationCountry?: string;
  origin?: string;
  destination?: string;
  quantity?: number;
  quantityUnit?: string;
  currency?: string;
  incoterm?: string;
  totalValue?: number;
  requiredDeliveryDate?: string;
  temperatureControlled?: boolean;
  buyerGtid?: string;
  sellerGtid?: string;
  buyer?: { gtid: string; legalName: string };
  seller?: { gtid: string; legalName: string };
  shipments?: any[];
  documents?: any[];
  milestones?: any[];
}

// 9-stage lifecycle derived from existing state data. Coarse mapping stays
// under the hood — never user-facing. (Law #11.)
const STAGES = [
  { key: "REQUEST", label: "Request" },
  { key: "AGREEMENT", label: "Agreement" },
  { key: "PREPARATION", label: "Preparation" },
  { key: "LOGISTICS", label: "Logistics" },
  { key: "INSPECTION", label: "Inspection" },
  { key: "CUSTOMS", label: "Customs" },
  { key: "FINANCIAL", label: "Financial" },
  { key: "SETTLEMENT", label: "Settlement" },
  { key: "COMPLETED", label: "Completed" },
];

// Map the Trade.status string (one of 16 SGTX statuses) to a coarse
// 9-stage lifecycle position. This is the lossy UI representation; the
// authoritative state vector lives in the backend and is exposed only in
// Expert Mode.
function stageFromStatus(status: string): { current: number; completed: number } {
  const s = status || "";
  if (s === "DRAFT") return { current: 0, completed: 0 };
  if (s === "PENDING_SELLER_RESPONSE" || s === "BUYER_SUBMITTED") return { current: 1, completed: 1 };
  if (s === "QUOTE_ACCEPTED" || s === "CONTRACT_SIGNED") return { current: 2, completed: 2 };
  if (s === "IN_EXECUTION") return { current: 3, completed: 3 };
  if (s === "INSPECTION_REQUIRED" || s === "QC_PENDING") return { current: 4, completed: 4 };
  if (s === "CUSTOMS_PENDING" || s === "CUSTOMS_HOLD") return { current: 5, completed: 5 };
  if (s === "PAYMENT_DUE" || s === "FINANCING_PENDING") return { current: 6, completed: 6 };
  if (s === "SETTLED" || s === "PROVISIONAL_SETTLEMENT") return { current: 7, completed: 7 };
  if (s === "CLOSED" || s === "COMPLETED") return { current: 8, completed: 8 };
  return { current: 0, completed: 0 };
}

function statusLabel(status: string): string {
  // Human-readable status pill. The raw status string is technical; the
  // user sees the cleaned label.
  return status
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtMoney(value: number | undefined, currency: string | undefined): string {
  if (value === undefined || value === null) return "—";
  const cur = currency || "USD";
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${cur} ${value.toLocaleString()}`;
  }
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

export default function TradeWorkspacePage({ params }: { params: Promise<{ ustn: string }> }) {
  const { ustn } = use(params);
  const { payload, ready } = useSession();
  const [expertMode, setExpertMode] = useState(false);
  const [activeDrawer, setActiveDrawer] = useState<"documents" | "payments" | "compliance" | "messages" | "details">("documents");

  // Fetch the dashboard data for this tenant (returns tradesAsBuyer +
  // tradesAsSeller + activities + invoices). The trade is then filtered by
  // USTN. This reuses the existing /api/sgtx/dashboard endpoint — no
  // backend changes.
  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ["cockpit-dashboard", payload?.tenantGtid],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/dashboard?tenant=${encodeURIComponent(payload!.tenantGtid!)}`);
      if (!res.ok) throw new Error(`Failed to load dashboard (${res.status})`);
      return res.json();
    },
    enabled: ready && !!payload?.tenantGtid,
  });

  // Find the trade with this USTN across both buyer and seller lists.
  const trade: Trade | undefined = useMemo(() => {
    if (!data) return undefined;
    const all = [...(data.tradesAsBuyer || []), ...(data.tradesAsSeller || [])];
    return all.find((t) => t.ustn === ustn);
  }, [data, ustn]);

  // Filter activities for this trade.
  const tradeActivities = useMemo(() => {
    if (!data?.activities) return [];
    return data.activities.filter((a: any) => a.trade?.ustn === ustn || a.tradeUstn === ustn).slice(0, 5);
  }, [data, ustn]);

  // Filter invoices for this trade.
  const tradeInvoices = useMemo(() => {
    if (!data?.invoices) return [];
    return data.invoices.filter((i: any) => i.trade?.ustn === ustn);
  }, [data, ustn]);

  if (!ready) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading session…</div>;
  }

  if (!payload) {
    // The useRequireAuth hook in CockpitShell will redirect; render nothing.
    return null;
  }

  if (isLoading) {
    return (
      <CockpitShell roleLabel={payload.role} tenantName={data?.tenant?.legalName} showAdmin={shouldShowAdmin(data?.tenant?.type)}>
        <div className="text-sm text-muted-foreground">Loading trade {ustn}…</div>
      </CockpitShell>
    );
  }

  if (error || !trade) {
    // Deterministic 404. Unknown USTN = explicit "not found" — never a
    // fallback to a different screen (Law #5).
    return (
      <CockpitShell roleLabel={payload.role} tenantName={data?.tenant?.legalName} showAdmin={shouldShowAdmin(data?.tenant?.type)}>
        <div className="max-w-xl mx-auto py-10 text-center">
          <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold mb-2">Trade not found</h1>
          <p className="text-sm text-muted-foreground mb-6">
            No trade with USTN <code className="font-mono">{ustn}</code> is visible to your
            tenant. This may be because the trade belongs to a different tenant, or the
            USTN is incorrect.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button asChild variant="outline">
              <Link href="/trades" className="focus-visible:outline-none">
                <ChevronLeft className="w-3.5 h-3.5 me-1.5" aria-hidden="true" /> Back to trades
              </Link>
            </Button>
          </div>
        </div>
      </CockpitShell>
    );
  }

  // Determine the user's role on this trade (buyer / seller / other).
  const isBuyer = trade.buyerGtid === payload.tenantGtid;
  const isSeller = trade.sellerGtid === payload.tenantGtid;
  const perspective = isBuyer ? "Buyer" : isSeller ? "Seller" : "Observer";

  // Derive blockers (T3). For the cockpit rebuild, we surface only the
  // most actionable blockers — missing documents, customs holds,
  // inspection failures.
  const blockers = deriveBlockers(trade);

  const stage = stageFromStatus(trade.status);

  // Derive the next action (T1) with a drawer-tab target so the CTA
  // switches the active drawer instead of navigating to a non-existent
  // sub-route.
  const nextAction = deriveNextAction(trade, perspective);

  return (
    <CockpitShell
      roleLabel={payload.role}
      tenantName={data?.tenant?.legalName}
      showAdmin={shouldShowAdmin(data?.tenant?.type)}
    >
      <div className="space-y-6">
        {/* Back link */}
        <Link href="/trades" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
          <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" /> All trades
        </Link>

        {/* ── HEADER (T1) ──────────────────────────────────────────── */}
        <header className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight truncate">
                {trade.commodity || "Untitled trade"}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {trade.origin || trade.originCountry || "—"} → {trade.destination || trade.destinationCountry || "—"}
                <span className="mx-2 text-muted-foreground/40">·</span>
                <span className="text-xs">{perspective}</span>
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <Badge variant="outline" className="text-xs">
                {statusLabel(trade.status)}
              </Badge>
              {/* USTN — T5 styling (small, muted, monospaced). Visible only
                  to make the trade shareable; not a primary element. */}
              <code className="text-[0.65rem] text-muted-foreground/70 font-mono">{ustn}</code>
            </div>
          </div>
        </header>

        {/* ── NEXT ACTION CARD (T1) ──────────────────────────────── */}
        <Card className="p-5 border-primary/30 bg-primary/5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">
                Next action
              </p>
              <p className="text-base font-medium">{nextAction.label}</p>
              {nextAction.detail && (
                <p className="text-xs text-muted-foreground mt-1">{nextAction.detail}</p>
              )}
            </div>
            {nextAction.cta && (
              <button
                onClick={() => nextAction.drawer && setActiveDrawer(nextAction.drawer)}
                aria-label={nextAction.ctaLabel || "Open"}
                className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background min-h-[36px]"
              >
                {nextAction.ctaLabel || "Open"} <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </Card>

        {/* ── TRADE SUMMARY (T2) ──────────────────────────────────── */}
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Summary</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <SummaryCell icon={Package} label="Quantity" value={trade.quantity ? `${trade.quantity} ${trade.quantityUnit || ""}` : "—"} />
            <SummaryCell icon={DollarSign} label="Value" value={fmtMoney(trade.totalValue, trade.currency)} />
            <SummaryCell icon={Calendar} label="Delivery" value={fmtDate(trade.requiredDeliveryDate)} />
            <SummaryCell icon={ShieldCheck} label="Incoterm" value={trade.incoterm || "—"} />
            <SummaryCell
              icon={Thermometer}
              label="Cold chain"
              value={trade.temperatureControlled ? "Yes" : "No"}
              highlight={trade.temperatureControlled}
            />
          </div>
        </div>

        {/* ── BLOCKERS (T3) ───────────────────────────────────────── */}
        {blockers.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Blockers ({blockers.length})
            </h2>
            <div className="space-y-2">
              {blockers.map((b, i) => (
                <Card key={i} className="p-3 border-red-500/30 bg-red-50/30 dark:bg-red-950/10">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{b.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Owner: {b.owner} {b.due && `· Due ${b.due}`}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* ── TIMELINE ────────────────────────────────────────────── */}
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Timeline</h2>
          <ol className="flex items-center gap-1 overflow-x-auto pb-2">
            {STAGES.map((s, idx) => {
              const completed = idx < stage.completed;
              const current = idx === stage.current;
              return (
                <li key={s.key} className="flex items-center gap-1 flex-shrink-0">
                  <div
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border",
                      completed && "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
                      current && !completed && "bg-amber-50 dark:bg-amber-950/30 border-amber-500/40 text-amber-700 dark:text-amber-300",
                      !completed && !current && "bg-muted/30 border-border text-muted-foreground/70",
                    )}
                  >
                    {completed ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : current ? (
                      <Circle className="w-3 h-3 fill-current" />
                    ) : (
                      <Circle className="w-3 h-3" />
                    )}
                    <span>{s.label}</span>
                  </div>
                  {idx < STAGES.length - 1 && (
                    <div className={cn("w-3 h-px", completed ? "bg-emerald-500/40" : "bg-border")} />
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        {/* ── ACTIVITY ────────────────────────────────────────────── */}
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recent activity</h2>
          {tradeActivities.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet for this trade.</p>
          ) : (
            <ol className="space-y-2">
              {tradeActivities.map((a: any, i: number) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 mt-1.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground truncate">{a.description || a.action}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {a.actor?.legalName || a.actorGtid || "System"} · {a.createdAt ? fmtDate(a.createdAt) : "—"}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* ── DRAWER TABS (T4) ────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-1 border-b border-border mb-3 overflow-x-auto" role="tablist" aria-label="Trade drawer sections">
            {([
              { id: "documents", label: "Documents", icon: FileText },
              { id: "payments", label: "Payments", icon: DollarSign },
              { id: "compliance", label: "Compliance", icon: ShieldCheck },
              { id: "messages", label: "Messages", icon: MessageSquare },
              { id: "details", label: "Details", icon: Info },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveDrawer(tab.id)}
                role="tab"
                aria-selected={activeDrawer === tab.id}
                aria-controls={`drawer-panel-${tab.id}`}
                id={`drawer-tab-${tab.id}`}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-t-sm min-h-[36px]",
                  activeDrawer === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <tab.icon className="w-3.5 h-3.5" aria-hidden="true" /> {tab.label}
              </button>
            ))}
          </div>
          <DrawerContent tab={activeDrawer} trade={trade} invoices={tradeInvoices} />
        </div>

        {/* ── COMMAND CENTER (cross-portal wiring — AUD-4) ─────────── */}
        {/* Aggregates 11 cross-portal views in parallel: FeeLock, Payment
            Manifest, Fee Decision, Milestone Payments, Payment Health, SLA,
            Provider Quotations, Lab/QC, Incoterm Responsibilities, Governor
            Decisions, State Vector. Every card traces to a real lib file. */}
        <CommandCenterSection ustn={trade.ustn} trade={trade} />

        {/* ── BUYER NEGOTIATION PANEL (GAP-1, v18 §16.9.3) ─────────────── */}
        {/* 7 features: Comparison Table, 3-col Negotiation Panel, Partial
            Acceptance, Counter-Offer w/ reason, Deadline Extension, Visual
            Diff, Mutual Confirmation. Surgical add — only visible when the
            viewer is the buyer on this trade. */}
        {isBuyer && (
          <BuyerNegotiationPanel ustn={trade.ustn} tradeId={trade.id} trade={trade} />
        )}

        {/* ── EXPERT MODE TOGGLE (T5) ────────────────────────────── */}
        <div className="pt-2 border-t border-border">
          <button
            onClick={() => setExpertMode(o => !o)}
            aria-expanded={expertMode}
            aria-controls="expert-view-panel"
            className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm min-h-[36px] px-1"
          >
            {expertMode ? <EyeOff className="w-3.5 h-3.5" aria-hidden="true" /> : <Eye className="w-3.5 h-3.5" aria-hidden="true" />}
            {expertMode ? "Hide expert view" : "Show expert view"}
          </button>
          {expertMode && (
            <div id="expert-view-panel" className="mt-4 p-4 rounded-md border border-border bg-muted/20 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Expert view · USTN internals
              </p>
              <div className="grid sm:grid-cols-2 gap-3 text-xs">
                <ExpertRow label="USTN" value={trade.ustn} mono />
                <ExpertRow label="Trade ID" value={trade.id} mono />
                <ExpertRow label="Status (raw)" value={trade.status} mono />
                <ExpertRow label="Phase" value={trade.phase !== undefined ? String(trade.phase) : "—"} mono />
                <ExpertRow label="Buyer GTID" value={trade.buyer?.gtid || trade.buyerGtid || "—"} mono />
                <ExpertRow label="Seller GTID" value={trade.seller?.gtid || trade.sellerGtid || "—"} mono />
                <ExpertRow label="HS code" value={trade.commodityHs || "—"} mono />
                <ExpertRow label="Shipments" value={String(trade.shipments?.length || 0)} />
                <ExpertRow label="Buyer Financing" value={(trade as any).buyerFinancingRequired ? "Required" : "Not required"} />
                <ExpertRow label="Service Capabilities" value={(trade as any).seller?.serviceCapabilities ? JSON.parse((trade as any).seller.serviceCapabilities || "[]").join(", ") || "—" : "—"} />
              </div>
              {/* v16.1: State Vector (4 clocks) + Loom hash placeholder */}
              <div className="grid sm:grid-cols-2 gap-3 text-xs pt-3 border-t border-border">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-muted-foreground">Execution Clock:</span>
                  <span className="text-foreground/80 text-right">{trade.status || "—"}</span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-muted-foreground">Financial Clock:</span>
                  <span className="text-foreground/80 text-right">{(trade as any).settlementStructure || "—"}</span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-muted-foreground">Legal Clock:</span>
                  <span className="text-foreground/80 text-right">{(trade as any).contractSignedAt ? "SIGNED" : "OPEN"}</span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-muted-foreground">Physical Clock:</span>
                  <span className="text-foreground/80 text-right">{(trade as any).transportMode || "—"}</span>
                </div>
                <div className="flex items-start justify-between gap-2 col-span-2">
                  <span className="text-muted-foreground">Loom Hash:</span>
                  <span className="font-mono text-right text-[0.6rem]">{trade.id ? trade.id.substring(0, 16) + "…" : "—"}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </CockpitShell>
  );
}

function SummaryCell({
  icon: Icon, label, value, highlight,
}: { icon: any; label: string; value: string; highlight?: boolean }) {
  return (
    <div className="p-3 rounded-md border border-border bg-card/40">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        <Icon className="w-3 h-3" />
        <span>{label}</span>
      </div>
      <p className={cn("text-sm font-medium", highlight && "text-amber-700 dark:text-amber-300")}>
        {value}
      </p>
    </div>
  );
}

function ExpertRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-muted-foreground">{label}:</span>
      <span className={cn("text-foreground/80 text-right break-all", mono && "font-mono")}>{value}</span>
    </div>
  );
}

function DrawerContent({
  tab, trade, invoices,
}: { tab: "documents" | "payments" | "compliance" | "messages" | "details"; trade: Trade; invoices: any[] }) {
  // Fetch compliance requirements for this trade (from the existing
  // documentation-requirements endpoint).
  const complianceQuery = useQuery({
    queryKey: ["trade-compliance", trade.ustn, trade.commodityHs, trade.originCountry, trade.destinationCountry, trade.incoterm, trade.transportMode, trade.temperatureControlled],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/sgtx/trade-request/documentation-requirements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hsCode: trade.commodityHs || undefined,
          originCountry: trade.originCountry,
          destCountry: trade.destinationCountry,
          incoterm: trade.incoterm,
          transportMode: (trade as any).transportMode || "SEA",
          coldChain: trade.temperatureControlled,
        }),
      });
      if (!res.ok) return { requirements: [] };
      return res.json();
    },
    enabled: tab === "compliance",
  });

  // Fetch messages / mediation for this trade (from the existing disputes
  // mediation endpoint).
  const messagesQuery = useQuery({
    queryKey: ["trade-messages", trade.id],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/disputes/mediation?disputeId=${encodeURIComponent(trade.id)}`);
      if (!res.ok) return { messages: [] };
      return res.json();
    },
    enabled: tab === "messages",
  });

  switch (tab) {
    case "documents":
      return (
        <div>
          {trade.documents?.length ? (
            <ul className="space-y-1">
              {trade.documents.map((d: any, i: number) => (
                <li key={i} className="text-sm flex items-center justify-between p-2 rounded border border-border">
                  <span>{d.name || d.type || `Document ${i + 1}`}</span>
                  <Badge variant="outline" className="text-[0.6rem]">{d.status || "—"}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No documents uploaded for this trade yet.</p>
          )}
        </div>
      );
    case "payments":
      return (
        <div>
          {invoices.length > 0 ? (
            <ul className="space-y-1">
              {invoices.map((inv: any, i: number) => (
                <li key={i} className="text-sm flex items-center justify-between p-2 rounded border border-border">
                  <span>{inv.number || inv.id}</span>
                  <span className="font-medium">{fmtMoney(inv.amount, inv.currency)}</span>
                  <Badge variant="outline" className="text-[0.6rem]">{inv.status || "—"}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No invoices issued for this trade yet.</p>
          )}
        </div>
      );
    case "compliance":
      return (
        <div>
          {complianceQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading compliance requirements…</p>
          ) : (complianceQuery.data?.requirements || []).length > 0 ? (
            <ul className="space-y-2">
              {(complianceQuery.data!.requirements as any[]).map((r: any, i: number) => (
                <li key={i} className="p-2.5 rounded border border-border bg-card/40">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{r.docName || r.docType}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{r.trigger || "Required by destination jurisdiction"}</p>
                    </div>
                    {r.mandatory && (
                      <Badge variant="outline" className="text-[0.6rem] text-amber-700 dark:text-amber-300 border-amber-500/40">
                        Mandatory
                      </Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No specific compliance requirements detected for this route. Baseline checks (sanctions, KYB) always apply.</p>
          )}
        </div>
      );
    case "messages":
      return (
        <div>
          {messagesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading messages…</p>
          ) : (messagesQuery.data?.messages || []).length > 0 ? (
            <ul className="space-y-2">
              {(messagesQuery.data!.messages as any[]).map((m: any, i: number) => (
                <li key={i} className="p-2.5 rounded border border-border bg-card/40">
                  <p className="text-sm">{m.message || m.content}</p>
                  <p className="text-xs text-muted-foreground mt-1">{m.author || m.fromGtid || "System"} · {fmtDate(m.createdAt)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No messages yet. Messages between the buyer and seller on this trade will appear here.</p>
          )}
        </div>
      );
    case "details":
      return (
        <div className="text-xs space-y-2">
          <div><span className="text-muted-foreground">Buyer:</span> {trade.buyer?.legalName || trade.buyerGtid || "—"}</div>
          <div><span className="text-muted-foreground">Seller:</span> {trade.seller?.legalName || trade.sellerGtid || "—"}</div>
          <div><span className="text-muted-foreground">Origin country:</span> {trade.originCountry || "—"}</div>
          <div><span className="text-muted-foreground">Destination country:</span> {trade.destinationCountry || "—"}</div>
          <div><span className="text-muted-foreground">HS code:</span> <span className="font-mono">{trade.commodityHs || "—"}</span></div>
          <div><span className="text-muted-foreground">Incoterm:</span> {trade.incoterm || "—"}</div>
          <div><span className="text-muted-foreground">Currency:</span> {trade.currency || "—"}</div>
          <div><span className="text-muted-foreground">Quantity:</span> {trade.quantity || "—"} {trade.quantityUnit || ""}</div>
          <div><span className="text-muted-foreground">Total value:</span> {fmtMoney(trade.totalValue, trade.currency)}</div>
          <div><span className="text-muted-foreground">Delivery date:</span> {fmtDate(trade.requiredDeliveryDate)}</div>
          <div><span className="text-muted-foreground">Cold chain:</span> {trade.temperatureControlled ? "Yes" : "No"}</div>
          <div><span className="text-muted-foreground">Shipments:</span> {trade.shipments?.length || 0}</div>
        </div>
      );
  }
}

function deriveNextAction(trade: Trade, perspective: string): { label: string; detail?: string; cta?: string; ctaLabel?: string; drawer?: "documents" | "payments" | "compliance" | "messages" | "details" } {
  // Heuristic mapping from status + perspective to the next action.
  // The full smart-worklist engine exists in the legacy code; for the
  // cockpit rebuild we expose a single T1 action per (status, role).
  // The `drawer` field tells the CTA button which drawer tab to open.
  switch (trade.status) {
    case "DRAFT":
      return { label: "Review and submit your draft trade request.", detail: "This trade is a draft. Submit it to start the workflow.", cta: "review", ctaLabel: "Review", drawer: "details" };
    case "PENDING_SELLER_RESPONSE":
      if (perspective === "Seller") {
        return { label: "Review the buyer's request and submit a quote.", detail: "The buyer is waiting for your response.", cta: "quote", ctaLabel: "Submit quote", drawer: "documents" };
      }
      return { label: "Waiting for the seller to respond.", detail: "No action needed from you right now." };
    case "QUOTE_ACCEPTED":
      if (perspective === "Buyer") {
        return { label: "Review the seller's quote and sign the contract.", cta: "sign", ctaLabel: "Sign contract", drawer: "documents" };
      }
      return { label: "Waiting for the buyer to sign the contract.", detail: "No action needed from you right now." };
    case "CONTRACT_SIGNED":
    case "IN_EXECUTION":
      return { label: "Trade is in execution — confirm the next milestone.", cta: "milestones", ctaLabel: "View milestones", drawer: "documents" };
    case "CUSTOMS_HOLD":
      return { label: "Customs hold — review the reason and respond.", detail: "The customs broker has flagged this trade. Action is required.", cta: "resolve", ctaLabel: "Resolve", drawer: "compliance" };
    case "SETTLED":
    case "CLOSED":
    case "COMPLETED":
      return { label: "No action needed — this trade is on track." };
    default:
      return { label: "Review the trade status and continue the workflow.", cta: "details", ctaLabel: "Details", drawer: "details" };
  }
}

function deriveBlockers(trade: Trade): { label: string; owner: string; due?: string }[] {
  const out: { label: string; owner: string; due?: string }[] = [];
  if (trade.status === "CUSTOMS_HOLD") {
    out.push({ label: "Customs hold — declaration under review", owner: "Customs broker", due: fmtDate(trade.requiredDeliveryDate) });
  }
  // Phase 5 will add document-missing + inspection-failed blockers based on
  // the existing documentation-requirements + lab-test + qc-inspection data.
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUD-4 — Command Center Section (cross-portal wiring)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Renders 11 compact cards, each backed by a real SGTX lib + API route.
// Every card fetches its data in parallel via TanStack Query. Cards fail
// gracefully — a 404 / 500 shows a muted "—" with a small red dot; the
// user can still see the rest of the trade state.
//
// The 11 views are the cross-portal wiring surface required by the
// AUD-4 audit:
//   1. FeeLock status           — /api/sgtx/feelock/[ustn]                    (feelock-nats lib)
//   2. Payment Manifest          — /api/sgtx/payment-manifest/[ustn]          (payment-manifest lib)
//   3. Fee Decision Object       — /api/sgtx/fees/[ustn]/decision             (fee-engine lib)
//   4. Milestone→Payment         — /api/sgtx/milestone-payments/[ustn]/mappings (milestone-payments lib)
//   5. Payment Health Score      — /api/sgtx/payment/[ustn]/health           (payment-health lib)
//   6. SLA Status                — /api/sgtx/payment/sla/[ustn]/status       (payment-sla lib)
//   7. Provider Quotations       — /api/sgtx/quotations?ustn=X               (provider-quotations lib)
//   8. Lab/QC Status             — /api/sgtx/lab-tests?ustn=X + /api/sgtx/qc-inspections?ustn=X (lab-qc lib)
//   9. Incoterm Responsibilities — /api/sgtx/incoterm-engine?incoterm=X      (incoterm-engine lib)
//  10. Governor Decisions        — /api/sgtx/governor/decisions?ustn=X       (governor lib)
//  11. State Vector              — /api/sgtx/constitutional/state-vector?ustn=X (state-vector lib)

interface CommandCenterCardProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  isLoading: boolean;
  hasError: boolean;
  isEmpty: boolean;
  statusLabel?: string;
  statusTone?: "active" | "pending" | "warning" | "critical" | "neutral";
  metric?: string;
  detail?: string;
}

function CommandCenterCard({
  title, icon: Icon, isLoading, hasError, isEmpty,
  statusLabel, statusTone = "neutral", metric, detail,
}: CommandCenterCardProps) {
  const toneClasses: Record<string, string> = {
    active: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
    pending: "bg-amber-50 dark:bg-amber-950/30 border-amber-500/40 text-amber-700 dark:text-amber-300",
    warning: "bg-orange-50 dark:bg-orange-950/30 border-orange-500/40 text-orange-700 dark:text-orange-300",
    critical: "bg-red-50 dark:bg-red-950/30 border-red-500/40 text-red-700 dark:text-red-300",
    neutral: "bg-muted/40 border-border text-muted-foreground",
  };
  const dotColor: Record<string, string> = {
    active: "bg-emerald-500",
    pending: "bg-amber-500",
    warning: "bg-orange-500",
    critical: "bg-red-500",
    neutral: "bg-muted-foreground/40",
  };
  return (
    <Card className="p-3 flex flex-col gap-1.5 min-h-[88px]">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
        <span className="font-medium truncate">{title}</span>
      </div>
      {isLoading ? (
        <div className="space-y-1 mt-0.5">
          <div className="h-3 rounded bg-muted/40 animate-pulse" />
          <div className="h-2 w-2/3 rounded bg-muted/30 animate-pulse" />
        </div>
      ) : hasError ? (
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={cn("w-1.5 h-1.5 rounded-full", dotColor.critical)} aria-hidden="true" />
          <span className="text-xs text-muted-foreground/70 italic">Unavailable</span>
        </div>
      ) : isEmpty ? (
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={cn("w-1.5 h-1.5 rounded-full", dotColor.neutral)} aria-hidden="true" />
          <span className="text-xs text-muted-foreground/70 italic">Not yet</span>
        </div>
      ) : (
        <>
          {statusLabel && (
            <span className={cn("inline-flex items-center w-fit gap-1 px-1.5 py-0.5 rounded text-[0.65rem] font-medium border", toneClasses[statusTone])}>
              <span className={cn("w-1 h-1 rounded-full", dotColor[statusTone])} aria-hidden="true" />
              {statusLabel}
            </span>
          )}
          {metric && <p className="text-sm font-semibold truncate">{metric}</p>}
          {detail && <p className="text-[0.7rem] text-muted-foreground truncate">{detail}</p>}
        </>
      )}
    </Card>
  );
}

function CommandCenterSection({ ustn, trade }: { ustn: string; trade: Trade }) {
  // 1. FeeLock status (feelock-nats lib)
  const feelockQ = useQuery({
    queryKey: ["cmd-feelock", ustn],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/feelock/${encodeURIComponent(ustn)}`);
      if (!res.ok) throw new Error(`feelock ${res.status}`);
      return res.json() as Promise<any>;
    },
    retry: false,
  });

  // 2. Payment Manifest (payment-manifest lib)
  const manifestQ = useQuery({
    queryKey: ["cmd-manifest", ustn],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/payment-manifest/${encodeURIComponent(ustn)}`);
      if (!res.ok) throw new Error(`manifest ${res.status}`);
      return res.json() as Promise<any>;
    },
    retry: false,
  });

  // 3. Fee Decision Object (fee-engine lib)
  const feeDecisionQ = useQuery({
    queryKey: ["cmd-fee-decision", ustn],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/fees/${encodeURIComponent(ustn)}/decision`);
      if (!res.ok) throw new Error(`fee-decision ${res.status}`);
      return res.json() as Promise<any>;
    },
    retry: false,
  });

  // 4. Milestone→Payment mappings (milestone-payments lib)
  const milestoneQ = useQuery({
    queryKey: ["cmd-milestone", ustn],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/milestone-payments/${encodeURIComponent(ustn)}/mappings`);
      if (!res.ok) throw new Error(`milestone ${res.status}`);
      return res.json() as Promise<any>;
    },
    retry: false,
  });

  // 5. Payment Health Score (payment-health lib)
  const healthQ = useQuery({
    queryKey: ["cmd-health", ustn],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/payment/${encodeURIComponent(ustn)}/health`);
      if (!res.ok) throw new Error(`health ${res.status}`);
      return res.json() as Promise<any>;
    },
    retry: false,
  });

  // 6. SLA status (payment-sla lib)
  const slaQ = useQuery({
    queryKey: ["cmd-sla", ustn],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/payment/sla/${encodeURIComponent(ustn)}/status`);
      if (!res.ok) throw new Error(`sla ${res.status}`);
      return res.json() as Promise<any>;
    },
    retry: false,
  });

  // 7. Provider Quotations (provider-quotations lib)
  const quotationsQ = useQuery({
    queryKey: ["cmd-quotations", ustn],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/quotations?ustn=${encodeURIComponent(ustn)}`);
      if (!res.ok) throw new Error(`quotations ${res.status}`);
      return res.json() as Promise<any>;
    },
    retry: false,
  });

  // 8a. Lab tests (lab-qc lib — lab portion)
  const labQ = useQuery({
    queryKey: ["cmd-lab", ustn],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/lab-tests?ustn=${encodeURIComponent(ustn)}`);
      if (!res.ok) throw new Error(`lab ${res.status}`);
      return res.json() as Promise<any>;
    },
    retry: false,
  });

  // 8b. QC inspections (lab-qc lib — qc portion)
  const qcQ = useQuery({
    queryKey: ["cmd-qc", ustn],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/qc-inspections?ustn=${encodeURIComponent(ustn)}`);
      if (!res.ok) throw new Error(`qc ${res.status}`);
      return res.json() as Promise<any>;
    },
    retry: false,
  });

  // 9. Incoterm responsibilities (incoterm-engine lib)
  const incotermQ = useQuery({
    queryKey: ["cmd-incoterm", ustn, trade.incoterm],
    queryFn: async () => {
      if (!trade.incoterm) return { ok: false, responsibilities: null };
      const res = await fetchWithAuth(`/api/sgtx/incoterm-engine?incoterm=${encodeURIComponent(trade.incoterm)}`);
      if (!res.ok) throw new Error(`incoterm ${res.status}`);
      return res.json() as Promise<any>;
    },
    enabled: !!trade.incoterm,
    retry: false,
  });

  // 10. Governor decisions for this USTN (governor lib)
  const govQ = useQuery({
    queryKey: ["cmd-governor", ustn],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/governor/decisions?ustn=${encodeURIComponent(ustn)}&limit=10`);
      if (!res.ok) throw new Error(`governor ${res.status}`);
      return res.json() as Promise<any>;
    },
    retry: false,
  });

  // 11. State vector (state-vector lib)
  const stateVectorQ = useQuery({
    queryKey: ["cmd-state-vector", ustn],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/constitutional/state-vector?ustn=${encodeURIComponent(ustn)}`);
      if (!res.ok) throw new Error(`state-vector ${res.status}`);
      return res.json() as Promise<any>;
    },
    retry: false,
  });

  // ── Derive compact card payloads ─────────────────────────────────────
  // 1. FeeLock
  const feelock = feelockQ.data;
  const feelockEmpty = !feelock;
  const feelockStatus = feelock?.status || "—";
  const feelockTone =
    feelockStatus === "ACTIVE" ? "active"
    : feelockStatus === "PENDING" ? "pending"
    : feelockStatus === "CANCELLED" ? "critical"
    : feelockStatus === "DISPUTED" ? "warning"
    : "neutral";

  // 2. Payment Manifest
  const manifest = manifestQ.data?.manifest;
  const manifestEmpty = !manifest;
  const manifestVersion = manifest?.version;
  const manifestLegs = manifest?.legs?.length ?? 0;
  const manifestHash = manifest?.manifest_hash || manifest?.manifestHash;

  // 3. Fee Decision
  const feeDecision = feeDecisionQ.data;
  const feeDecisionEmpty = !feeDecision || feeDecision.error;
  const feeAmount = feeDecision?.feeUsd ?? feeDecision?.fee_usd;
  const fairnessScore = feeDecision?.fairnessScore ?? feeDecision?.fairness_score;

  // 4. Milestone→Payment
  const mappings = milestoneQ.data?.mappings || [];
  const milestoneEmpty = mappings.length === 0;
  const settled = mappings.filter((m: any) => m.status === "SETTLED").length;
  const planned = mappings.filter((m: any) => m.status === "PLANNED").length;
  const submitted = mappings.filter((m: any) => m.status === "SUBMITTED" || m.status === "BANK_ACCEPTED").length;

  // 5. Payment Health
  const health = healthQ.data;
  const healthEmpty = !health || health.error;
  const healthScore = health?.score;
  const healthBand = health?.band;

  // 6. SLA
  const sla = slaQ.data;
  const slaBreaches = sla?.breaches?.length ?? sla?.breachCount ?? 0;
  const slaCredits = sla?.total_credits ?? sla?.totalCredits ?? 0;

  // 7. Quotations
  const quotations = quotationsQ.data?.quotations || [];
  const quotationsEmpty = quotations.length === 0;
  const acceptedQuotes = quotations.filter((q: any) => q.status === "ACCEPTED").length;

  // 8. Lab + QC
  const labTests = labQ.data?.labTests || [];
  const qcInspections = qcQ.data?.inspections || [];
  const labQcEmpty = labTests.length === 0 && qcInspections.length === 0;

  // 9. Incoterm
  const resp = incotermQ.data?.responsibilities;
  const incotermEmpty = !resp;
  const respCount = resp ? Object.keys(resp).length : 0;

  // 10. Governor
  const govDecisions = govQ.data?.decisions || [];
  const govEmpty = govDecisions.length === 0;
  const lastVerdict = govDecisions[0]?.verdict;

  // 11. State vector
  const sv = stateVectorQ.data?.stateVector;
  const svEmpty = !sv;
  const finalityClass = sv?.finalityClass ?? sv?.finality_class;
  const divergence = sv?.divergenceIndex ?? sv?.divergence_index;
  const txHealth = sv?.transactionHealth ?? sv?.transaction_health;

  return (
    <section aria-labelledby="cmd-center-heading" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 id="cmd-center-heading" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Command Center · 11 cross-portal views
        </h2>
        <span className="text-[0.65rem] text-muted-foreground/70">
          AUD-4 wiring audit
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {/* 1. FeeLock */}
        <CommandCenterCard
          title="FeeLock"
          icon={ShieldCheck}
          isLoading={feelockQ.isLoading}
          hasError={feelockQ.isError}
          isEmpty={feelockEmpty}
          statusLabel={feelockStatus}
          statusTone={feelockTone}
          metric={feelock?.feeUsd ? fmtMoney(feelock.feeUsd, "USD") : undefined}
          detail={feelock?.lockId ? `Lock ${String(feelock.lockId).slice(0, 16)}…` : undefined}
        />
        {/* 2. Payment Manifest */}
        <CommandCenterCard
          title="Payment Manifest"
          icon={FileText}
          isLoading={manifestQ.isLoading}
          hasError={manifestQ.isError}
          isEmpty={manifestEmpty}
          statusLabel={manifestVersion ? `v${manifestVersion}` : undefined}
          statusTone={manifestVersion ? "active" : "neutral"}
          metric={manifestLegs > 0 ? `${manifestLegs} leg${manifestLegs === 1 ? "" : "s"}` : undefined}
          detail={manifestHash ? `hash ${String(manifestHash).slice(0, 12)}…` : undefined}
        />
        {/* 3. Fee Decision */}
        <CommandCenterCard
          title="Fee Decision"
          icon={DollarSign}
          isLoading={feeDecisionQ.isLoading}
          hasError={feeDecisionQ.isError}
          isEmpty={feeDecisionEmpty}
          statusLabel={fairnessScore !== undefined ? `fairness ${fairnessScore}` : undefined}
          statusTone="active"
          metric={feeAmount !== undefined ? fmtMoney(feeAmount, "USD") : undefined}
          detail={feeDecision?.loomHash ? `loom ${String(feeDecision.loomHash).slice(0, 12)}…` : undefined}
        />
        {/* 4. Milestone→Payment */}
        <CommandCenterCard
          title="Milestone Payments"
          icon={Calendar}
          isLoading={milestoneQ.isLoading}
          hasError={milestoneQ.isError}
          isEmpty={milestoneEmpty}
          statusLabel={mappings.length > 0 ? `${settled}/${mappings.length} settled` : undefined}
          statusTone={settled === mappings.length && mappings.length > 0 ? "active" : submitted > 0 ? "pending" : "neutral"}
          metric={mappings.length > 0 ? `${mappings.length} mapping${mappings.length === 1 ? "" : "s"}` : undefined}
          detail={planned > 0 ? `${planned} planned` : undefined}
        />
        {/* 5. Payment Health */}
        <CommandCenterCard
          title="Payment Health"
          icon={CheckCircle2}
          isLoading={healthQ.isLoading}
          hasError={healthQ.isError}
          isEmpty={healthEmpty}
          statusLabel={healthBand}
          statusTone={healthBand === "HEALTHY" ? "active" : healthBand === "WARNING" ? "warning" : healthBand === "CRITICAL" ? "critical" : "neutral"}
          metric={healthScore !== undefined ? `${healthScore}/100` : undefined}
          detail={health?.breakdown ? "4-component weighted" : undefined}
        />
        {/* 6. SLA Status */}
        <CommandCenterCard
          title="Payment SLA"
          icon={Clock}
          isLoading={slaQ.isLoading}
          hasError={slaQ.isError}
          isEmpty={false}
          statusLabel={slaBreaches > 0 ? `${slaBreaches} breach${slaBreaches === 1 ? "" : "es"}` : "On track"}
          statusTone={slaBreaches > 0 ? "warning" : "active"}
          metric={slaCredits > 0 ? `${slaCredits} credit${slaCredits === 1 ? "" : "s"}` : "No credits"}
          detail="5 SLA targets"
        />
        {/* 7. Provider Quotations */}
        <CommandCenterCard
          title="Provider Quotations"
          icon={Package}
          isLoading={quotationsQ.isLoading}
          hasError={quotationsQ.isError}
          isEmpty={quotationsEmpty}
          statusLabel={acceptedQuotes > 0 ? `${acceptedQuotes} accepted` : quotations.length > 0 ? `${quotations.length} pending` : undefined}
          statusTone={acceptedQuotes > 0 ? "active" : quotations.length > 0 ? "pending" : "neutral"}
          metric={quotations.length > 0 ? `${quotations.length} quote${quotations.length === 1 ? "" : "s"}` : undefined}
        />
        {/* 8. Lab / QC */}
        <CommandCenterCard
          title="Lab / QC"
          icon={Thermometer}
          isLoading={labQ.isLoading || qcQ.isLoading}
          hasError={labQ.isError || qcQ.isError}
          isEmpty={labQcEmpty}
          statusLabel={labQcEmpty ? undefined : `${labTests.length + qcInspections.length} test${labTests.length + qcInspections.length === 1 ? "" : "s"}`}
          statusTone={labQcEmpty ? "neutral" : "active"}
          metric={labTests.length > 0 ? `${labTests.length} lab` : undefined}
          detail={qcInspections.length > 0 ? `${qcInspections.length} QC inspection${qcInspections.length === 1 ? "" : "s"}` : undefined}
        />
        {/* 9. Incoterm Responsibilities */}
        <CommandCenterCard
          title={`Incoterm · ${trade.incoterm || "—"}`}
          icon={MapPin}
          isLoading={incotermQ.isLoading}
          hasError={incotermQ.isError}
          isEmpty={incotermEmpty}
          statusLabel={resp ? `${respCount} parties` : undefined}
          statusTone="active"
          metric={trade.incoterm || "—"}
          detail={resp ? "Responsibilities loaded" : undefined}
        />
        {/* 10. Governor Decisions */}
        <CommandCenterCard
          title="Governor Decisions"
          icon={Info}
          isLoading={govQ.isLoading}
          hasError={govQ.isError}
          isEmpty={govEmpty}
          statusLabel={lastVerdict}
          statusTone={lastVerdict === "APPROVED" ? "active" : lastVerdict === "DENIED" ? "critical" : lastVerdict === "ESCALATED" ? "warning" : "neutral"}
          metric={govDecisions.length > 0 ? `${govDecisions.length} decision${govDecisions.length === 1 ? "" : "s"}` : undefined}
          detail={govDecisions[0]?.action ? String(govDecisions[0].action) : undefined}
        />
        {/* 11. State Vector */}
        <CommandCenterCard
          title="State Vector"
          icon={ShieldCheck}
          isLoading={stateVectorQ.isLoading}
          hasError={stateVectorQ.isError}
          isEmpty={svEmpty}
          statusLabel={finalityClass}
          statusTone={finalityClass === "F4" || finalityClass === "F3" ? "active" : finalityClass === "F0" ? "pending" : "neutral"}
          metric={divergence ? `div ${divergence}` : undefined}
          detail={txHealth ? `health ${txHealth}` : undefined}
        />
      </div>
    </section>
  );
}
