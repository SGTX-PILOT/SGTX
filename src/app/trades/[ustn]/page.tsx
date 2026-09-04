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
            <Link href="/trades">
              <Button variant="outline">
                <ChevronLeft className="w-3.5 h-3.5 mr-1.5" /> Back to trades
              </Button>
            </Link>
          </div>
        </div>
      </CockpitShell>
    );
  }

  // Determine the user's role on this trade (buyer / seller / other).
  const isBuyer = trade.buyerGtid === payload.tenantGtid;
  const isSeller = trade.sellerGtid === payload.tenantGtid;
  const perspective = isBuyer ? "Buyer" : isSeller ? "Seller" : "Observer";

  // Derive the next action (T1). This is a heuristic based on status +
  // perspective; a future iteration can use the existing smart-worklist /
  // next-actions engine.
  const nextAction = deriveNextAction(trade, perspective);

  // Derive blockers (T3). For the cockpit rebuild, we surface only the
  // most actionable blockers — missing documents, customs holds,
  // inspection failures.
  const blockers = deriveBlockers(trade);

  const stage = stageFromStatus(trade.status);

  return (
    <CockpitShell
      roleLabel={payload.role}
      tenantName={data?.tenant?.legalName}
      showAdmin={shouldShowAdmin(data?.tenant?.type)}
    >
      <div className="space-y-6">
        {/* Back link */}
        <Link href="/trades" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeft className="w-3.5 h-3.5" /> All trades
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
              <Link href={nextAction.cta}>
                <Button size="sm" className="bg-primary text-primary-foreground">
                  {nextAction.ctaLabel || "Open"} <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </Link>
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
          <div className="flex items-center gap-1 border-b border-border mb-3 overflow-x-auto">
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
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition flex-shrink-0",
                  activeDrawer === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <tab.icon className="w-3.5 h-3.5" /> {tab.label}
              </button>
            ))}
          </div>
          <DrawerContent tab={activeDrawer} trade={trade} invoices={tradeInvoices} />
        </div>

        {/* ── EXPERT MODE TOGGLE (T5) ────────────────────────────── */}
        <div className="pt-2 border-t border-border">
          <button
            onClick={() => setExpertMode(o => !o)}
            className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
          >
            {expertMode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {expertMode ? "Hide expert view" : "Show expert view"}
          </button>
          {expertMode && (
            <div className="mt-4 p-4 rounded-md border border-border bg-muted/20 space-y-3">
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
              </div>
              <p className="text-[0.65rem] text-muted-foreground pt-2 border-t border-border">
                The full state vector (4 clocks: execution / financial / legal / physical)
                and the canonical event spine are available in the legacy Expert Mode
                (work in progress — will be added as a sub-route in a later PR).
              </p>
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
        <p className="text-sm text-muted-foreground">
          Compliance checks are auto-generated based on the destination jurisdiction. They will appear here once the trade moves to the preparation phase.
        </p>
      );
    case "messages":
      return (
        <p className="text-sm text-muted-foreground">
          Messages between the buyer and seller on this trade will appear here. (Phase 5 will wire the existing mediation API to this view.)
        </p>
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
        </div>
      );
  }
}

function deriveNextAction(trade: Trade, perspective: string): { label: string; detail?: string; cta?: string; ctaLabel?: string } {
  // Heuristic mapping from status + perspective to the next action.
  // The full smart-worklist engine exists in the legacy code; for the
  // cockpit rebuild we expose a single T1 action per (status, role).
  switch (trade.status) {
    case "DRAFT":
      return { label: "Review and submit your draft trade request.", detail: "This trade is a draft. Submit it to start the workflow.", cta: `/trades/${trade.ustn}/details`, ctaLabel: "Review" };
    case "PENDING_SELLER_RESPONSE":
      if (perspective === "Seller") {
        return { label: "Review the buyer's request and submit a quote.", detail: "The buyer is waiting for your response.", cta: `/trades/${trade.ustn}/documents`, ctaLabel: "Submit quote" };
      }
      return { label: "Waiting for the seller to respond.", detail: "No action needed from you right now." };
    case "QUOTE_ACCEPTED":
      if (perspective === "Buyer") {
        return { label: "Review the seller's quote and sign the contract.", cta: `/trades/${trade.ustn}/documents`, ctaLabel: "Sign contract" };
      }
      return { label: "Waiting for the buyer to sign the contract.", detail: "No action needed from you right now." };
    case "CONTRACT_SIGNED":
    case "IN_EXECUTION":
      return { label: "Trade is in execution — confirm the next milestone.", cta: `/trades/${trade.ustn}/documents`, ctaLabel: "View milestones" };
    case "CUSTOMS_HOLD":
      return { label: "Customs hold — review the reason and respond.", detail: "The customs broker has flagged this trade. Action is required.", cta: `/trades/${trade.ustn}/compliance`, ctaLabel: "Resolve" };
    case "SETTLED":
    case "CLOSED":
    case "COMPLETED":
      return { label: "No action needed — this trade is on track." };
    default:
      return { label: "Review the trade status and continue the workflow." };
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
