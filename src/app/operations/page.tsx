"use client";

// @ts-nocheck

// ═══════════════════════════════════════════════════════════════════════════════
// COCKPIT-Phase 5: /operations route — role-dependent operational queue.
// ═════════════════════════════════════════════════════════════════════════════════
//
// Law #5: THE TRADE IS THE PRIMARY OBJECT. Every operational item links to
// /trades/[ustn]. This page is the operational queue — not a dashboard.
//
// Role → content mapping:
//   TRD (Buyer/Seller)  → their shipments + milestones for their trades
//   LSP                 → RFQs + shipments + route optimisation (v18 §16.11)
//   SHIP                → booking requests + eBL + container release (v18 §16.12)
//   LAB                 → test requests + sampling queue + certificates
//   QC                  → inspection schedule + field inspections + reports
//   CBR                 → declarations + certificates + clearance status
//   GOV                 → national trade flow + customs + food safety (drill into /trades/[ustn])
//   MP                  → lead attribution (not operations-focused; redirects)
//   ADM                 → platform monitoring (not operations; hidden)
//
// The role is derived from the tenant type (JWT claim → /api/sgtx/dashboard
// returns the tenant type). Unknown types see an honest empty state.

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { CockpitShell, shouldShowAdmin } from "@/components/cockpit/CockpitShell";
import { useSession, fetchWithAuth } from "@/lib/cockpit/session";
import { useCockpitLocale } from "@/lib/cockpit/use-locale";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Activity, Briefcase, Truck, FlaskConical, ShieldCheck, Landmark,
  ChevronRight, Package, FileText, Calendar, AlertTriangle, Loader2,
  ChevronDown, MessageSquare, Navigation, Radio, Mic,
  Send, XCircle, CheckCircle2, Route as RouteIcon,
  Anchor, FileCheck, Bell,
} from "lucide-react";
import { fmtDate, fmtMoney, statusLabel } from "@/lib/cockpit/format";
import { cn } from "@/lib/utils";

interface DashboardData {
  tenant?: { gtid: string; legalName: string; type: string; country?: string };
  tradesAsBuyer?: any[];
  tradesAsSeller?: any[];
  shipmentsCarrier?: any[];
  customsDecls?: any[];
  labTests?: any[];
  qcInspections?: any[];
  inbox?: any[];
}

export default function OperationsPage() {
  const { payload, ready } = useSession();
  const { t } = useCockpitLocale();

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["cockpit-dashboard", payload?.tenantGtid],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/dashboard?tenant=${encodeURIComponent(payload!.tenantGtid!)}`);
      if (!res.ok) throw new Error(`Failed to load dashboard (${res.status})`);
      return res.json();
    },
    enabled: ready && !!payload?.tenantGtid,
  });

  if (!ready) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">{t("common.loadingSession")}</div>;
  if (!payload) return null;

  const tenantType = data?.tenant?.type || "";
  const tenantName = data?.tenant?.legalName;

  return (
    <CockpitShell
      roleLabel={payload.role}
      tenantName={tenantName}
      showAdmin={shouldShowAdmin(tenantType)}
    >
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">{t("ops.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("ops.subtitle")}
          </p>
        </header>

        {isLoading ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2 py-10">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <RoleContent tenantType={tenantType} data={data} />
        )}
      </div>
    </CockpitShell>
  );
}

function RoleContent({ tenantType, data }: { tenantType: string; data?: DashboardData }) {
  switch (tenantType) {
    case "TRD":
      return <TraderOperations data={data} />;
    case "LSP":
      return <LspOperations data={data} />;
    case "SHIP":
      return <ShipOperations data={data} />;
    case "LAB":
      return <LabOperations data={data} />;
    case "QC":
      return <QcOperations data={data} />;
    case "CBR":
      return <CbrOperations data={data} />;
    case "GOV":
      return <GovOperations data={data} />;
    case "MP":
      return (
        <EmptyState
          icon={Briefcase}
          title="Operations for Marketplace Partners"
          desc="Marketplace partners don't have an operations queue. Visit the Trades section to see lead-attributed trades, or the Network section to manage your marketplace integration."
        />
      );
    default:
      return (
        <EmptyState
          icon={Activity}
          title="No operations queue for your role"
          desc={`Your tenant type (${tenantType || "unknown"}) doesn't have a specific operations queue. Visit the Trades section to see your trades.`}
        />
      );
  }
}

// ── Trader operations: shipments + milestones for their trades ────────────────
function TraderOperations({ data }: { data?: DashboardData }) {
  const trades = [...(data?.tradesAsBuyer || []), ...(data?.tradesAsSeller || [])];
  const activeTrades = trades.filter((t) => ["CONTRACT_SIGNED", "IN_EXECUTION", "CUSTOMS_PENDING"].includes(t.status));
  const shipments = trades.flatMap((t) => t.shipments || []);

  return (
    <div className="space-y-6">
      <Section title="Your active trades" count={activeTrades.length} icon={Briefcase}>
        <TradeList trades={activeTrades} empty="No active trades in execution." />
      </Section>
      <Section title="Shipments" count={shipments.length} icon={Package}>
        <ShipmentList shipments={shipments} empty="No shipments yet." />
      </Section>
    </div>
  );
}

// ── LSP operations (v18 §16.11): RFQs + Shipments + Route Optimisation ──────
function LspOperations({ data }: { data?: DashboardData }) {
  const { payload } = useSession();
  const gtid = payload?.tenantGtid;
  const jobs = data?.shipmentsCarrier || [];

  // Fetch the LSP's incoming RFQs (ServiceQuotation rows where this LSP is the provider)
  const { data: rfqData, isLoading: rfqsLoading, error: rfqsError } = useQuery({
    queryKey: ["lsp-rfqs", gtid],
    queryFn: async () => {
      const res = await fetchWithAuth(
        `/api/sgtx/providers/quotations?providerGtid=${encodeURIComponent(gtid!)}`,
      );
      if (res.status === 404 || res.status === 500) return { quotes: [], total: 0 };
      if (!res.ok) return { quotes: [], total: 0 };
      return res.json();
    },
    enabled: !!gtid,
    retry: false,
  });

  const rfqs: any[] = rfqData?.quotes || [];

  return (
    <div className="space-y-6">
      <Section title="RFQ Management" count={rfqs.length} icon={FileText}>
        {rfqsLoading ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2 py-3">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading RFQs…
          </div>
        ) : rfqsError ? (
          <p className="text-sm text-muted-foreground">
            Unable to load RFQs. Try again later.
          </p>
        ) : rfqs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No RFQs pending your response. New requests appear here.
          </p>
        ) : (
          <div className="space-y-2">
            {rfqs.map((rfq) => (
              <LspRfqCard key={rfq.id || rfq.quoteId} rfq={rfq} gtid={gtid!} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Assigned Shipments" count={jobs.length} icon={Truck}>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No jobs assigned to your fleet.
          </p>
        ) : (
          <div className="space-y-2">
            {jobs.map((s: any, i: number) => (
              <LspShipmentCard key={s.id || i} shipment={s} gtid={gtid!} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Route Optimisation" count={0} icon={Navigation}>
        <LspRouteOptimisation gtid={gtid!} />
      </Section>
    </div>
  );
}

// ── SHIP operations (v18 §16.12): Booking Requests + Confirmed Bookings + Container Release ─
function ShipOperations({ data }: { data?: DashboardData }) {
  const { payload } = useSession();
  const gtid = payload?.tenantGtid;
  const jobs = data?.shipmentsCarrier || [];

  // Fetch the SHIP line's incoming booking requests (ShipQuoteRequest rows
  // where this line is in the targetLines array).
  const { data: bookingData, isLoading: bookingsLoading, error: bookingsError } = useQuery({
    queryKey: ["ship-bookings", gtid],
    queryFn: async () => {
      const res = await fetchWithAuth(
        `/api/sgtx/ship-quote/list?shipper=${encodeURIComponent(gtid!)}`,
      );
      if (res.status === 404 || res.status === 500) return { requests: [], quotes: [] };
      if (!res.ok) return { requests: [], quotes: [] };
      return res.json();
    },
    enabled: !!gtid,
    retry: false,
  });

  const requests: any[] = bookingData?.requests || [];

  return (
    <div className="space-y-6">
      <Section title="Booking Requests" count={requests.length} icon={FileText}>
        {bookingsLoading ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2 py-3">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading booking requests…
          </div>
        ) : bookingsError ? (
          <p className="text-sm text-muted-foreground">
            Unable to load booking requests. Try again later.
          </p>
        ) : requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No booking requests pending your response.
          </p>
        ) : (
          <div className="space-y-2">
            {requests.map((req) => (
              <ShipBookingRequestCard key={req.id} request={req} gtid={gtid!} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Confirmed Bookings" count={jobs.length} icon={Anchor}>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No confirmed bookings assigned to your shipping line.
          </p>
        ) : (
          <div className="space-y-2">
            {jobs.map((s: any, i: number) => (
              <ShipConfirmedBookingCard key={s.id || i} shipment={s} gtid={gtid!} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Container Release" count={0} icon={ShieldCheck}>
        <ShipContainerRelease gtid={gtid!} jobs={jobs} />
      </Section>
    </div>
  );
}

// ── LAB operations: test requests + sampling + certificates ──────────────────
function LabOperations({ data }: { data?: DashboardData }) {
  const tests = data?.labTests || [];
  return (
    <div className="space-y-6">
      <Section title="Test requests" count={tests.length} icon={FlaskConical}>
        {tests.length > 0 ? (
          <ul className="divide-y divide-border border border-border rounded-md bg-card/40">
            {tests.map((t: any, i: number) => (
              <li key={t.id || i}>
                <Link href={t.trade?.ustn ? `/trades/${t.trade.ustn}` : "/trades"} className="flex items-center justify-between gap-3 p-3 hover:bg-muted/40 transition group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.trade?.commodity || "Test request"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t.status || "PENDING"} · {t.testType || "Sample"} · {fmtDate(t.createdAt)}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No test requests queued.</p>
        )}
      </Section>
    </div>
  );
}

// ── QC operations: inspection schedule + field + reports ─────────────────────
function QcOperations({ data }: { data?: DashboardData }) {
  const inspections = data?.qcInspections || [];
  return (
    <div className="space-y-6">
      <Section title="Inspections" count={inspections.length} icon={ShieldCheck}>
        {inspections.length > 0 ? (
          <ul className="divide-y divide-border border border-border rounded-md bg-card/40">
            {inspections.map((q: any, i: number) => (
              <li key={q.id || i}>
                <Link href={q.trade?.ustn ? `/trades/${q.trade.ustn}` : "/trades"} className="flex items-center justify-between gap-3 p-3 hover:bg-muted/40 transition group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{q.trade?.commodity || "Inspection"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {q.status || "SCHEDULED"} · {q.inspectionType || "Pre-shipment"} · {fmtDate(q.scheduledAt || q.createdAt)}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No inspections scheduled.</p>
        )}
      </Section>
    </div>
  );
}

// ── CBR operations: declarations + certificates + clearance ───────────────────
function CbrOperations({ data }: { data?: DashboardData }) {
  const decls = data?.customsDecls || [];
  return (
    <div className="space-y-6">
      <Section title="Customs declarations" count={decls.length} icon={Landmark}>
        {decls.length > 0 ? (
          <ul className="divide-y divide-border border border-border rounded-md bg-card/40">
            {decls.map((d: any, i: number) => (
              <li key={d.id || i}>
                <Link href={d.trade?.ustn ? `/trades/${d.trade.ustn}` : "/trades"} className="flex items-center justify-between gap-3 p-3 hover:bg-muted/40 transition group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{d.declarationNo || d.trade?.commodity || "Declaration"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {d.status || "PENDING"} · {d.regime || "Import"} · {fmtDate(d.createdAt)}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No declarations filed.</p>
        )}
      </Section>
    </div>
  );
}

// ── GOV operations: national overview + drill into trades ─────────────────────
function GovOperations({ data }: { data?: DashboardData }) {
  // Government sees ALL trades (the dashboard API returns cross-tenant data for GOV).
  const allTrades = [...(data?.tradesAsBuyer || []), ...(data?.tradesAsSeller || [])];
  const pendingClearances = (data?.inbox || []).filter((i) => i.category === "CUSTOMS_PENDING" || i.category === "NEEDS_APPROVAL");

  return (
    <div className="space-y-6">
      <Section title="National trade flow" count={allTrades.length} icon={Activity}>
        <TradeList trades={allTrades} empty="No trades visible to your authority." />
      </Section>
      <Section title="Pending clearances" count={pendingClearances.length} icon={AlertTriangle}>
        {pendingClearances.length > 0 ? (
          <ul className="divide-y divide-border border border-border rounded-md bg-card/40">
            {pendingClearances.map((p: any, i: number) => (
              <li key={p.id || i}>
                <Link href={p.trade?.ustn ? `/trades/${p.trade.ustn}` : "/trades"} className="flex items-center justify-between gap-3 p-3 hover:bg-muted/40 transition group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.title || p.message}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{p.category} · {fmtDate(p.createdAt)}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No pending clearances.</p>
        )}
      </Section>
    </div>
  );
}

// ── LSP portal helpers (v18 §16.11) ─────────────────────────────────────────

function LspRfqCard({ rfq, gtid }: { rfq: any; gtid: string }) {
  const [open, setOpen] = useState(false);
  const [showQuote, setShowQuote] = useState(false);
  const [showDecline, setShowDecline] = useState(false);
  const [showClarify, setShowClarify] = useState(false);

  return (
    <Card className="p-0 overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center justify-between gap-3 p-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">
                {rfq.quoteId || rfq.id || "RFQ"}
              </span>
              <Badge variant="outline" className="text-[0.6rem]">
                {rfq.status || "PENDING"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {rfq.serviceType || "—"} · USTN {rfq.ustn || "—"} · valid until {fmtDate(rfq.validUntil || rfq.createdAt)}
            </p>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button size="sm" variant="outline" onClick={() => setShowQuote(true)}>
              <Send className="w-3 h-3 mr-1" /> Quote
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowDecline(true)}>
              <XCircle className="w-3 h-3 mr-1" /> Decline
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowClarify(true)}>
              <MessageSquare className="w-3 h-3 mr-1" /> Clarify
            </Button>
            <CollapsibleTrigger asChild>
              <Button size="sm" variant="ghost" aria-label="View RFQ details">
                <ChevronDown className={cn("w-4 h-4 transition-transform", open && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>
        <CollapsibleContent>
          <div className="border-t border-border p-3 bg-muted/30 text-xs space-y-1.5">
            <div>
              <span className="text-muted-foreground">Provider Type:</span>{" "}
              {rfq.providerType || "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Fee:</span>{" "}
              {fmtMoney(rfq.feeUsd, rfq.currency)}
            </div>
            <div>
              <span className="text-muted-foreground">Validity:</span>{" "}
              {rfq.validityDays ? `${rfq.validityDays} days` : "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Description:</span>{" "}
              {rfq.description || "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Notes:</span>{" "}
              {rfq.notes || "—"}
            </div>
            {rfq.vessel && (
              <div>
                <span className="text-muted-foreground">Vessel:</span> {rfq.vessel}
              </div>
            )}
            {rfq.voyage && (
              <div>
                <span className="text-muted-foreground">Voyage:</span> {rfq.voyage}
              </div>
            )}
            {rfq.trade?.ustn && (
              <div className="pt-1">
                <Link
                  href={`/trades/${rfq.trade.ustn}`}
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  Open trade <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <LspQuoteDialog open={showQuote} onOpenChange={setShowQuote} rfq={rfq} gtid={gtid} />
      <LspDeclineDialog open={showDecline} onOpenChange={setShowDecline} rfq={rfq} gtid={gtid} />
      <LspClarifyDialog open={showClarify} onOpenChange={setShowClarify} rfq={rfq} gtid={gtid} />
    </Card>
  );
}

function LspQuoteDialog({
  open, onOpenChange, rfq, gtid,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rfq: any;
  gtid: string;
}) {
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [transitDays, setTransitDays] = useState("");
  const [terms, setTerms] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ustn: rfq.ustn,
        tradeId: rfq.tradeId,
        providerGtid: gtid,
        providerType: "LSP",
        serviceType: rfq.serviceType,
        feeUsd: Number(amount),
        currency,
        validityDays: 7,
        notes: terms,
        description: `LSP quote — transit ${transitDays || "—"} days`,
      };
      const res = await fetchWithAuth(`/api/sgtx/providers/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      onOpenChange(false);
      setAmount(""); setTransitDays(""); setTerms("");
      setError(null);
    },
    onError: (e: any) => setError(e?.message || "Submission failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit Quote — {rfq.quoteId || "RFQ"}</DialogTitle>
          <DialogDescription>
            Provide your commercial response to this RFQ. The buyer will be notified.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="lsp-amt">Amount *</Label>
              <Input
                id="lsp-amt"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EGP">EGP</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="lsp-transit">Transit Time (days)</Label>
            <Input
              id="lsp-transit"
              type="number"
              value={transitDays}
              onChange={(e) => setTransitDays(e.target.value)}
              placeholder="e.g. 14"
            />
          </div>
          <div>
            <Label htmlFor="lsp-terms">Terms & Notes</Label>
            <Textarea
              id="lsp-terms"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              placeholder="Payment terms, inclusions, exclusions…"
              rows={3}
            />
          </div>
          {error && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !amount}
          >
            {mutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Submitting…</>
            ) : (
              <><Send className="w-4 h-4 mr-1" /> Submit Quote</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LspDeclineDialog({
  open, onOpenChange, rfq, gtid,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rfq: any;
  gtid: string;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const tooShort = reason.trim().length < 10;

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/providers/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId: rfq.quoteId || rfq.id, declinedByGtid: gtid, reason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      onOpenChange(false);
      setReason(""); setError(null);
    },
    onError: (e: any) => setError(e?.message || "Decline failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Decline RFQ — {rfq.quoteId || "RFQ"}</DialogTitle>
          <DialogDescription>
            A reason is mandatory and must be at least 10 characters.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="lsp-decline-reason">Reason for declining *</Label>
            <Textarea
              id="lsp-decline-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this RFQ is being declined (min. 10 chars)…"
              rows={4}
            />
            <p className={cn("text-xs mt-1", tooShort ? "text-muted-foreground" : "text-emerald-600")}>
              {reason.trim().length} / 10 characters minimum
            </p>
          </div>
          {error && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || tooShort}
          >
            {mutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Declining…</>
            ) : (
              <><XCircle className="w-4 h-4 mr-1" /> Decline RFQ</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LspClarifyDialog({
  open, onOpenChange, rfq, gtid,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rfq: any;
  gtid: string;
}) {
  const [questions, setQuestions] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const qList = questions.split(/\n+/).map((q) => q.trim()).filter(Boolean);
      const res = await fetchWithAuth(`/api/sgtx/providers/clarify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          quotationId: rfq.quoteId || rfq.id,
          requestedByGtid: gtid,
          questions: qList,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      onOpenChange(false);
      setQuestions(""); setError(null);
    },
    onError: (e: any) => setError(e?.message || "Clarification failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request Clarification — {rfq.quoteId || "RFQ"}</DialogTitle>
          <DialogDescription>
            Ask structured questions about this RFQ. One question per line.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="lsp-clarify-q">Questions *</Label>
            <Textarea
              id="lsp-clarify-q"
              value={questions}
              onChange={(e) => setQuestions(e.target.value)}
              placeholder={"What is the exact container size?\nIs there a temperature requirement?\nWhich terminal should we use?"}
              rows={5}
            />
          </div>
          {error && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !questions.trim()}
          >
            {mutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Sending…</>
            ) : (
              <><MessageSquare className="w-4 h-4 mr-1" /> Request Clarification</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LspShipmentCard({ shipment, gtid }: { shipment: any; gtid: string }) {
  const [showMilestone, setShowMilestone] = useState(false);
  const [showRelease, setShowRelease] = useState(false);
  const ustn = shipment.ustn || shipment.trade?.ustn;
  const containerNo = shipment.containerNo;

  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">
              {shipment.containerNo || shipment.vesselName || `Shipment ${shipment.sequence || ""}`}
            </span>
            <Badge variant="outline" className="text-[0.6rem]">
              {statusLabel(shipment.status || "PLANNED")}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            USTN {ustn || "—"} · {shipment.originPort || "—"} → {shipment.destPort || "—"}
            {shipment.eta && ` · ETA ${fmtDate(shipment.eta)}`}
          </p>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button size="sm" variant="outline" onClick={() => setShowMilestone(true)}>
            <CheckCircle2 className="w-3 h-3 mr-1" /> Milestone
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowRelease(true)}
            disabled={!containerNo}
            title={!containerNo ? "Container number required" : "Acknowledge release"}
          >
            <FileCheck className="w-3 h-3 mr-1" /> Release
          </Button>
        </div>
      </div>
      <LspMilestoneDialog
        open={showMilestone}
        onOpenChange={setShowMilestone}
        ustn={ustn}
        shipmentId={shipment.id}
        gtid={gtid}
      />
      <LspContainerReleaseDialog
        open={showRelease}
        onOpenChange={setShowRelease}
        ustn={ustn}
        containerNo={containerNo}
      />
    </Card>
  );
}

function LspMilestoneDialog({
  open, onOpenChange, ustn, shipmentId, gtid,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ustn: string;
  shipmentId?: string;
  gtid: string;
}) {
  const [milestone, setMilestone] = useState("DEPARTED");
  const [voiceFeedback, setVoiceFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const milestones = [
    "CONTAINER_LOADED", "DEPARTED", "IN_TRANSIT", "ARRIVED",
    "CUSTOMS_CLEARED", "DELIVERED",
  ];

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/milestone/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ustn,
          milestone,
          confirmedByGtid: gtid,
          metadata: { shipmentId: shipmentId || null, source: "lsp-cockpit" },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      onOpenChange(false);
      setError(null);
    },
    onError: (e: any) => setError(e?.message || "Milestone confirmation failed"),
  });

  const voiceMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/voice/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "confirm_milestone",
          entities: { ustn, milestone },
          userGtid: gtid,
          biometric: { verified: true, confidence: 0.9 },
          transcript: `Confirm ${milestone} for ${ustn}`,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Voice failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      setVoiceFeedback(data?.execution?.feedback || "Voice command processed");
    },
    onError: (e: any) => setError(e?.message || "Voice execution failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm Milestone — {ustn}</DialogTitle>
          <DialogDescription>
            Select the milestone to confirm. The voice button triggers the
            voice pipeline for hands-free confirmation.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Milestone *</Label>
            <Select value={milestone} onValueChange={setMilestone}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {milestones.map((m) => (
                  <SelectItem key={m} value={m}>{statusLabel(m)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {voiceFeedback && (
            <div className="text-xs p-2 rounded bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 flex items-start gap-1">
              <Radio className="w-3 h-3 mt-0.5 shrink-0" />
              <span>{voiceFeedback}</span>
            </div>
          )}
          {error && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {error}
            </p>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={() => voiceMutation.mutate()}
            disabled={voiceMutation.isPending || mutation.isPending}
          >
            {voiceMutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Listening…</>
            ) : (
              <><Mic className="w-4 h-4 mr-1" /> Voice</>
            )}
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Confirming…</>
            ) : (
              <><CheckCircle2 className="w-4 h-4 mr-1" /> Confirm</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LspContainerReleaseDialog({
  open, onOpenChange, ustn, containerNo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ustn: string;
  containerNo?: string | null;
}) {
  const [release, setRelease] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["lsp-release", ustn, containerNo],
    queryFn: async () => {
      const res = await fetchWithAuth(
        `/api/sgtx/release/authorization?ustn=${encodeURIComponent(ustn)}&container=${encodeURIComponent(containerNo || "")}`,
      );
      if (res.status === 404 || res.status === 500) return null;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      return res.json();
    },
    enabled: open && !!ustn && !!containerNo,
    retry: false,
  });

  const ackMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/release/signed-authorization`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ustn, container: containerNo }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      setRelease(data);
    },
    onError: (e: any) => setError(e?.message || "Acknowledgement failed"),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setRelease(null); setError(null); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Container Release — {containerNo || "—"}</DialogTitle>
          <DialogDescription>
            Acknowledge the release token. Tokens are valid for 72 hours from
            issuance.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {query.isLoading ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading release status…
            </div>
          ) : query.error ? (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {String(query.error).replace("Error: ", "")}
            </p>
          ) : query.data ? (
            <div className="text-xs space-y-1.5 p-2 rounded bg-muted/40">
              <div><span className="text-muted-foreground">Release Status:</span> {query.data.release_status || "—"}</div>
              <div><span className="text-muted-foreground">Authorisation ID:</span> {query.data.authorisation_id || query.data.authorisationId || "—"}</div>
              <div><span className="text-muted-foreground">Valid Until:</span> {fmtDate(query.data.valid_until || query.data.validUntil)}</div>
              {query.data.hold_reason && (
                <div className="text-amber-600">
                  <span className="text-muted-foreground">Hold Reason:</span> {query.data.hold_reason}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No release data available.</p>
          )}

          {release && (
            <div className="text-xs space-y-1.5 p-2 rounded bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
              <div className="font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Acknowledged
              </div>
              <div><span className="text-muted-foreground">Signature ID:</span> {release.signatureId || "—"}</div>
              <div><span className="text-muted-foreground">Signed At:</span> {fmtDate(release.signedAt)}</div>
            </div>
          )}

          {error && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            onClick={() => ackMutation.mutate()}
            disabled={ackMutation.isPending}
          >
            {ackMutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Acknowledging…</>
            ) : (
              <><FileCheck className="w-4 h-4 mr-1" /> Acknowledge</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LspRouteOptimisation({ gtid }: { gtid: string }) {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [route, setRoute] = useState<any>(null);
  const [driverId, setDriverId] = useState("");
  const [driverResult, setDriverResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const optimiseMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(
        `/api/sgtx/trade-route?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`,
      );
      if (res.status === 404 || res.status === 500) return null;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      setRoute(data);
      setError(null);
    },
    onError: (e: any) => setError(e?.message || "Optimisation failed"),
  });

  const driverMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/road/drivers/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId, country: "EG" }),
      });
      if (res.status === 404 || res.status === 500) return null;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      setDriverResult(data);
      setError(null);
    },
    onError: (e: any) => setError(e?.message || "Driver validation failed"),
  });

  return (
    <div className="space-y-3 border border-border rounded-md bg-card/40 p-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="lsp-origin">Origin</Label>
          <Input
            id="lsp-origin"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            placeholder="Alexandria"
          />
        </div>
        <div>
          <Label htmlFor="lsp-dest">Destination</Label>
          <Input
            id="lsp-dest"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Cairo"
          />
        </div>
      </div>
      <Button
        onClick={() => optimiseMutation.mutate()}
        disabled={optimiseMutation.isPending || !origin || !destination}
        size="sm"
      >
        {optimiseMutation.isPending ? (
          <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Optimising…</>
        ) : (
          <><Navigation className="w-4 h-4 mr-1" /> Optimise Route</>
        )}
      </Button>

      {route && (
        <div className="text-xs space-y-1.5 p-2 rounded bg-muted/40">
          <div className="flex items-center gap-1 font-medium">
            <RouteIcon className="w-3 h-3" /> Optimised Route
          </div>
          <div><span className="text-muted-foreground">Distance:</span> {route.distanceKm ? `${route.distanceKm.toFixed(0)} km` : "—"}</div>
          <div><span className="text-muted-foreground">Est. Transit:</span> {route.estimatedTransitDays ? `${route.estimatedTransitDays} days` : "—"}</div>
          {route.originCoords && (
            <div><span className="text-muted-foreground">Origin Coords:</span> {route.originCoords.lat?.toFixed?.(2) || route.originCoords[0]}, {route.originCoords.lng?.toFixed?.(2) || route.originCoords[1]}</div>
          )}
        </div>
      )}

      <div className="border-t border-border pt-3 mt-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Driver Assignment</Label>
        <div className="flex gap-2 mt-1">
          <Input
            value={driverId}
            onChange={(e) => setDriverId(e.target.value)}
            placeholder="Driver ID / License #"
            className="flex-1"
          />
          <Button
            onClick={() => driverMutation.mutate()}
            disabled={driverMutation.isPending || !driverId}
            size="sm"
            variant="outline"
          >
            {driverMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Validate"}
          </Button>
        </div>
        {driverResult && (
          <div className="text-xs space-y-1 p-2 rounded bg-muted/40 mt-2">
            <div><span className="text-muted-foreground">Driver:</span> {driverResult.name || driverResult.driverName || "Verified"}</div>
            <div><span className="text-muted-foreground">License Valid:</span> {driverResult.licenseValid === false ? "No" : "Yes"}</div>
            {driverResult.dangerousGoods && (
              <div><span className="text-muted-foreground">DG Endorsed:</span> Yes</div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border pt-3 mt-2">
        <div className="flex items-center gap-2 mb-1">
          <Bell className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Geofence Alerts</span>
        </div>
        <p className="text-xs text-muted-foreground">
          No active geofence alerts. Trucks entering or exiting geofences will be reported here.
        </p>
      </div>

      <div className="border-t border-border pt-3 mt-2">
        <div className="flex items-center gap-2 mb-1">
          <Radio className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Voice Navigation</span>
        </div>
        <p className="text-xs text-muted-foreground">
          OSRM turn-by-turn + WebRTC push-to-talk available in the in-cab driver app.
        </p>
      </div>

      {error && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> {error}
        </p>
      )}
    </div>
  );
}

// ── SHIP portal helpers (v18 §16.12) ────────────────────────────────────────

function ShipBookingRequestCard({ request, gtid }: { request: any; gtid: string }) {
  const [open, setOpen] = useState(false);
  const [showQuote, setShowQuote] = useState(false);
  const [showDecline, setShowDecline] = useState(false);
  const [showAddons, setShowAddons] = useState(false);

  let containerDetails: any = {};
  try {
    containerDetails = typeof request.containerDetails === "string"
      ? JSON.parse(request.containerDetails) : (request.containerDetails || {});
  } catch { /* ignore */ }
  let addOns: string[] = [];
  try {
    addOns = typeof request.addOnServices === "string"
      ? JSON.parse(request.addOnServices) : (request.addOnServices || []);
  } catch { /* ignore */ }

  return (
    <Card className="p-0 overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center justify-between gap-3 p-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">
                {request.id.slice(-12)} · {request.baseServiceType || "Booking"}
              </span>
              <Badge variant="outline" className="text-[0.6rem]">
                {request.status || "PENDING"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {request.originPort || "—"} → {request.destinationPort || "—"} ·{" "}
              {containerDetails.type || "Container"} × {containerDetails.count || 1} ·{" "}
              {fmtDate(request.createdAt)}
            </p>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button size="sm" variant="outline" onClick={() => setShowQuote(true)}>
              <Send className="w-3 h-3 mr-1" /> Quote
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowDecline(true)}>
              <XCircle className="w-3 h-3 mr-1" /> Decline
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowAddons(true)}>
              <Package className="w-3 h-3 mr-1" /> Add-ons
            </Button>
            <CollapsibleTrigger asChild>
              <Button size="sm" variant="ghost" aria-label="View request details">
                <ChevronDown className={cn("w-4 h-4 transition-transform", open && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>
        <CollapsibleContent>
          <div className="border-t border-border p-3 bg-muted/30 text-xs space-y-1.5">
            <div>
              <span className="text-muted-foreground">USTN:</span> {request.ustn || "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Seller GTID:</span> {request.sellerGtid || "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Container Details:</span>{" "}
              {containerDetails.type || "—"} × {containerDetails.count || 1}
              {containerDetails.weight && ` · ${containerDetails.weight} kg`}
            </div>
            <div>
              <span className="text-muted-foreground">Add-on Services:</span>{" "}
              {addOns.length > 0 ? addOns.join(", ") : "none"}
            </div>
            <div>
              <span className="text-muted-foreground">Target Lines:</span>{" "}
              {(() => {
                try {
                  const lines = typeof request.targetLines === "string"
                    ? JSON.parse(request.targetLines) : (request.targetLines || []);
                  return Array.isArray(lines) ? lines.join(", ") : "—";
                } catch { return "—"; }
              })()}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <ShipQuoteDialog
        open={showQuote}
        onOpenChange={setShowQuote}
        request={request}
        addOns={addOns}
        gtid={gtid}
      />
      <ShipDeclineDialog
        open={showDecline}
        onOpenChange={setShowDecline}
        request={request}
        gtid={gtid}
      />
      <ShipAddonsDialog
        open={showAddons}
        onOpenChange={setShowAddons}
        request={request}
        addOns={addOns}
      />
    </Card>
  );
}

function ShipQuoteDialog({
  open, onOpenChange, request, addOns, gtid,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  request: any;
  addOns: string[];
  gtid: string;
}) {
  const [rate, setRate] = useState("");
  const [transitDays, setTransitDays] = useState("");
  const [validity, setValidity] = useState("48");
  const [vessel, setVessel] = useState("");
  const [voyage, setVoyage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const thc = addOns.includes("THC") ? 250 : 0;
      const payload = {
        ustn: request.ustn,
        providerGtid: gtid,
        providerType: "SHIP",
        serviceType: request.baseServiceType,
        feeUsd: Number(rate),
        currency: "USD",
        validityDays: Number(validity) / 24 || 2,
        vessel, voyage,
        shipQuoteRequestId: request.id,
        thcUsd: thc,
        freeDays: 7,
        notes: `Transit ${transitDays || "—"} days · add-ons: ${addOns.join(", ") || "none"}`,
      };
      const res = await fetchWithAuth(`/api/sgtx/providers/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      onOpenChange(false);
      setRate(""); setTransitDays(""); setVessel(""); setVoyage("");
      setError(null);
    },
    onError: (e: any) => setError(e?.message || "Quote submission failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit Quote — {request.baseServiceType || "Booking"}</DialogTitle>
          <DialogDescription>
            Provide your ocean freight rate and transit details. Add-on services
            will be itemised in the booking response.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ship-rate">Rate (USD) *</Label>
              <Input id="ship-rate" type="number" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label htmlFor="ship-transit">Transit (days)</Label>
              <Input id="ship-transit" type="number" value={transitDays} onChange={(e) => setTransitDays(e.target.value)} placeholder="e.g. 21" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ship-vessel">Vessel</Label>
              <Input id="ship-vessel" value={vessel} onChange={(e) => setVessel(e.target.value)} placeholder="MV Alexandria" />
            </div>
            <div>
              <Label htmlFor="ship-voyage">Voyage</Label>
              <Input id="ship-voyage" value={voyage} onChange={(e) => setVoyage(e.target.value)} placeholder="V.1234A" />
            </div>
          </div>
          <div>
            <Label htmlFor="ship-validity">Validity (hours)</Label>
            <Input id="ship-validity" type="number" value={validity} onChange={(e) => setValidity(e.target.value)} placeholder="48" />
          </div>
          {addOns.length > 0 && (
            <div className="text-xs text-muted-foreground p-2 rounded bg-muted/40">
              <span className="font-medium">Add-ons in this request:</span> {addOns.join(", ")}
            </div>
          )}
          {error && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !rate}>
            {mutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Submitting…</>
            ) : (
              <><Send className="w-4 h-4 mr-1" /> Submit Quote</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShipDeclineDialog({
  open, onOpenChange, request, gtid,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  request: any;
  gtid: string;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const tooShort = reason.trim().length < 10;

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/providers/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId: request.id,
          declinedByGtid: gtid,
          reason,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      onOpenChange(false);
      setReason(""); setError(null);
    },
    onError: (e: any) => setError(e?.message || "Decline failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Decline Booking Request</DialogTitle>
          <DialogDescription>
            A reason is mandatory and must be at least 10 characters.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="ship-decline-reason">Reason *</Label>
            <Textarea
              id="ship-decline-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why the booking is being declined (min. 10 chars)…"
              rows={4}
            />
            <p className={cn("text-xs mt-1", tooShort ? "text-muted-foreground" : "text-emerald-600")}>
              {reason.trim().length} / 10 characters minimum
            </p>
          </div>
          {error && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || tooShort}
          >
            {mutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Declining…</>
            ) : (
              <><XCircle className="w-4 h-4 mr-1" /> Decline Request</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShipAddonsDialog({
  open, onOpenChange, request, addOns,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  request: any;
  addOns: string[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add-on Services — {request.baseServiceType}</DialogTitle>
          <DialogDescription>
            Review the add-on services attached to this booking request.
            Rates are itemised when you submit your quote.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {addOns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No add-on services requested.</p>
          ) : (
            <ul className="text-sm space-y-1.5">
              {addOns.map((a) => (
                <li key={a} className="flex items-center gap-2 p-2 rounded bg-muted/40">
                  <Package className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground pt-2">
            Available add-on types: reefer (temperature-controlled), DG (dangerous goods),
            special handling, oversized cargo, and THC.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShipConfirmedBookingCard({ shipment, gtid }: { shipment: any; gtid: string }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [showEbl, setShowEbl] = useState(false);
  const [showMilestone, setShowMilestone] = useState(false);
  const ustn = shipment.ustn || shipment.trade?.ustn;
  const containerNo = shipment.containerNo;

  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">
              {shipment.vesselName || shipment.containerNo || `Shipment ${shipment.sequence || ""}`}
            </span>
            <Badge variant="outline" className="text-[0.6rem]">
              {statusLabel(shipment.status || "PLANNED")}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            USTN {ustn || "—"} · {shipment.originPort || "—"} → {shipment.destPort || "—"}
            {shipment.voyageNumber && ` · Voyage ${shipment.voyageNumber}`}
          </p>
        </div>
        <div className="flex gap-1 shrink-0 flex-wrap justify-end">
          <Button size="sm" variant="outline" onClick={() => setShowConfirm(true)}>
            <CheckCircle2 className="w-3 h-3 mr-1" /> Confirm
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowEbl(true)}>
            <FileText className="w-3 h-3 mr-1" /> eBL
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowMilestone(true)}>
            <Calendar className="w-3 h-3 mr-1" /> Milestone
          </Button>
        </div>
      </div>

      <ShipConfirmBookingDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        shipment={shipment}
        gtid={gtid}
      />
      <ShipIssueEblDialog
        open={showEbl}
        onOpenChange={setShowEbl}
        shipment={shipment}
        gtid={gtid}
      />
      <ShipMilestoneDialog
        open={showMilestone}
        onOpenChange={setShowMilestone}
        ustn={ustn}
        shipmentId={shipment.id}
        gtid={gtid}
      />
    </Card>
  );
}

function ShipConfirmBookingDialog({
  open, onOpenChange, shipment, gtid,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shipment: any;
  gtid: string;
}) {
  const [bookingRef, setBookingRef] = useState("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const ustn = shipment.ustn || shipment.trade?.ustn;

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/release/signed-authorization`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ustn,
          container: shipment.containerNo,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      setResult(data);
      setBookingRef(data.bookingId || data.signatureId || `BK-${Date.now().toString(36).toUpperCase()}`);
    },
    onError: (e: any) => setError(e?.message || "Booking confirmation failed"),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setResult(null); setError(null); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm Booking — {ustn}</DialogTitle>
          <DialogDescription>
            Generates a signed booking confirmation. The booking reference will
            be returned for downstream tracking.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-xs p-2 rounded bg-muted/40 space-y-1">
            <div><span className="text-muted-foreground">Vessel:</span> {shipment.vesselName || "—"}</div>
            <div><span className="text-muted-foreground">Container:</span> {shipment.containerNo || "—"}</div>
            <div><span className="text-muted-foreground">Route:</span> {shipment.originPort || "—"} → {shipment.destPort || "—"}</div>
          </div>
          {result && (
            <div className="text-xs p-2 rounded bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 space-y-1">
              <div className="font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Booking Confirmed
              </div>
              <div><span className="text-muted-foreground">Booking Ref:</span> {bookingRef}</div>
              {result.signatureId && (
                <div><span className="text-muted-foreground">Signature:</span> {result.signatureId}</div>
              )}
            </div>
          )}
          {error && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {result ? "Close" : "Cancel"}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !!result}>
            {mutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Confirming…</>
            ) : (
              <><CheckCircle2 className="w-4 h-4 mr-1" /> Confirm Booking</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShipIssueEblDialog({
  open, onOpenChange, shipment, gtid,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shipment: any;
  gtid: string;
}) {
  const [blType, setBlType] = useState("ORIGINAL");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const ustn = shipment.ustn || shipment.trade?.ustn;

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/dcsa/ebl`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          ustn,
          shipmentId: shipment.id,
          tradeId: shipment.tradeId,
          carrierGtid: gtid,
          shipperGtid: shipment.trade?.sellerGtid || gtid,
          consigneeGtid: shipment.trade?.buyerGtid,
          blType,
          pol: shipment.originPort,
          pod: shipment.destPort,
          vesselName: shipment.vesselName,
          vesselImo: shipment.vesselImo,
          voyageNumber: shipment.voyageNumber,
          cargoDescription: shipment.trade?.commodity,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      setResult(data?.ebl || data);
    },
    onError: (e: any) => setError(e?.message || "eBL issuance failed"),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setResult(null); setError(null); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Issue eBL — {ustn}</DialogTitle>
          <DialogDescription>
            Generates an electronic Bill of Lading via the DCSA eBL pipeline.
            The SI / TD / surrender flow follows after issuance.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>B/L Type</Label>
            <Select value={blType} onValueChange={setBlType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ORIGINAL">Original</SelectItem>
                <SelectItem value="SEAWAY">Sea Waybill</SelectItem>
                <SelectItem value="ELECTRONIC">Electronic</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {result && (
            <div className="text-xs p-2 rounded bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 space-y-1">
              <div className="font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                <FileText className="w-3 h-3" /> eBL Issued
              </div>
              <div><span className="text-muted-foreground">eBL ID:</span> {result.eblId || "—"}</div>
              <div><span className="text-muted-foreground">SI Status:</span> {result.siStatus || "DRAFT"}</div>
              <div><span className="text-muted-foreground">TD Status:</span> {result.tdStatus || "NOT_ISSUED"}</div>
              <div><span className="text-muted-foreground">B/L Type:</span> {result.blType || blType}</div>
            </div>
          )}
          {error && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {result ? "Close" : "Cancel"}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !!result}>
            {mutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Issuing…</>
            ) : (
              <><FileText className="w-4 h-4 mr-1" /> Issue eBL</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShipMilestoneDialog({
  open, onOpenChange, ustn, shipmentId, gtid,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ustn: string;
  shipmentId?: string;
  gtid: string;
}) {
  const [milestone, setMilestone] = useState("IN_TRANSIT");
  const [error, setError] = useState<string | null>(null);

  // Vessel milestones — slightly different set from LSP
  const milestones = [
    "CONTAINER_LOADED", "DEPARTED", "IN_TRANSIT", "ARRIVED",
    "CUSTOMS_CLEARED", "DELIVERED",
  ];

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/milestone/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ustn,
          milestone,
          confirmedByGtid: gtid,
          metadata: { shipmentId: shipmentId || null, source: "ship-cockpit" },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      onOpenChange(false);
      setError(null);
    },
    onError: (e: any) => setError(e?.message || "Milestone update failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Vessel Milestone — {ustn}</DialogTitle>
          <DialogDescription>
            Update the vessel milestone. Timeline + counterparty notifications
            will be triggered automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Milestone *</Label>
            <Select value={milestone} onValueChange={setMilestone}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {milestones.map((m) => (
                  <SelectItem key={m} value={m}>{statusLabel(m)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Updating…</>
            ) : (
              <><Calendar className="w-4 h-4 mr-1" /> Update</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShipContainerRelease({ gtid, jobs }: { gtid: string; jobs: any[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [releaseData, setReleaseData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchRelease = async (ustn: string, containerNo: string) => {
    try {
      const res = await fetchWithAuth(
        `/api/sgtx/release/authorization?ustn=${encodeURIComponent(ustn)}&container=${encodeURIComponent(containerNo)}`,
      );
      if (res.status === 404 || res.status === 500) {
        setErrors((e) => ({ ...e, [containerNo]: "No release authorisation found" }));
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setErrors((e) => ({ ...e, [containerNo]: err.error || `Failed (${res.status})` }));
        return;
      }
      const data = await res.json();
      setReleaseData((r) => ({ ...r, [containerNo]: data }));
    } catch (e: any) {
      setErrors((er) => ({ ...er, [containerNo]: e?.message || "Fetch failed" }));
    }
  };

  const ackMutation = useMutation({
    mutationFn: async ({ ustn, containerNo }: { ustn: string; containerNo: string }) => {
      const res = await fetchWithAuth(`/api/sgtx/release/signed-authorization`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ustn, container: containerNo }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: (data, vars) => {
      setReleaseData((r) => ({ ...r, [vars.containerNo]: { ...(r[vars.containerNo] || {}), ack: data } }));
    },
    onError: (e: any, vars) => {
      setErrors((er) => ({ ...er, [vars.containerNo]: e?.message || "Ack failed" }));
    },
  });

  const releases = jobs.filter((s: any) => s.containerNo && (s.status === "ARRIVED" || s.status === "CUSTOMS_CLEARED" || s.status === "RELEASED"));

  return (
    <div className="space-y-2">
      {releases.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No pending container releases. Releases for arrived shipments appear here.
        </p>
      ) : (
        releases.map((s: any, i: number) => {
          const ustn = s.ustn || s.trade?.ustn;
          const cn = s.containerNo;
          const isOpen = expanded === cn;
          const rd = releaseData[cn];
          const err = errors[cn];
          return (
            <Card key={s.id || i} className="p-3">
              <button
                type="button"
                className="w-full text-left"
                onClick={() => {
                  if (!isOpen && !rd && !err) fetchRelease(ustn, cn);
                  setExpanded(isOpen ? null : cn);
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{cn}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      USTN {ustn} · {statusLabel(s.status)}
                    </p>
                  </div>
                  <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                </div>
              </button>
              {isOpen && (
                <div className="mt-3 pt-3 border-t border-border space-y-2">
                  {err ? (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> {err}
                    </p>
                  ) : !rd ? (
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <Loader2 className="w-3 h-3 animate-spin" /> Loading release status…
                    </div>
                  ) : (
                    <>
                      <div className="text-xs space-y-1 p-2 rounded bg-muted/40">
                        <div><span className="text-muted-foreground">Release Status:</span> {rd.release_status || "—"}</div>
                        <div><span className="text-muted-foreground">Authorisation ID:</span> {rd.authorisation_id || rd.authorisationId || "—"}</div>
                        <div><span className="text-muted-foreground">Valid Until:</span> {fmtDate(rd.valid_until || rd.validUntil)}</div>
                        {rd.hold_reason && (
                          <div className="text-amber-600"><span className="text-muted-foreground">Hold Reason:</span> {rd.hold_reason}</div>
                        )}
                      </div>
                      {rd.ack && (
                        <div className="text-xs p-2 rounded bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                          <div className="font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Release Acknowledged
                          </div>
                          <div className="mt-1"><span className="text-muted-foreground">Signature ID:</span> {rd.ack.signatureId || "—"}</div>
                        </div>
                      )}
                    </>
                  )}
                  <Button
                    size="sm"
                    onClick={() => ackMutation.mutate({ ustn, containerNo: cn })}
                    disabled={ackMutation.isPending || !rd || rd.ack}
                  >
                    {ackMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Acknowledging…</>
                    ) : (
                      <><FileCheck className="w-4 h-4 mr-1" /> Acknowledge Release</>
                    )}
                  </Button>
                </div>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}

// ── Shared components ─────────────────────────────────────────────────────────

function Section({ title, count, icon: Icon, children }: { title: string; count: number; icon: any; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</h2>
        <span className="text-xs text-muted-foreground/70">({count})</span>
      </div>
      {children}
    </section>
  );
}

function TradeList({ trades, empty }: { trades: any[]; empty: string }) {
  if (trades.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y divide-border border border-border rounded-md bg-card/40">
      {trades.map((t) => (
        <li key={t.ustn}>
          <Link href={`/trades/${t.ustn}`} className="flex items-center justify-between gap-3 p-3 hover:bg-muted/40 transition group">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{t.commodity || "Untitled trade"}</span>
                <Badge variant="outline" className="text-[0.6rem]">{statusLabel(t.status)}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {t.originCountry || "—"} → {t.destinationCountry || "—"}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ShipmentList({ shipments, empty }: { shipments: any[]; empty: string }) {
  if (shipments.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y divide-border border border-border rounded-md bg-card/40">
      {shipments.map((s, i) => (
        <li key={s.id || i}>
          <Link href={s.trade?.ustn ? `/trades/${s.trade.ustn}` : "/trades"} className="flex items-center justify-between gap-3 p-3 hover:bg-muted/40 transition group">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {s.containerNo || s.vesselName || `Shipment ${s.sequence || i + 1}`}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {s.status || "PENDING"} · {s.trade?.commodity || "Trade"}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="py-12 text-center">
      <Icon className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">{desc}</p>
    </div>
  );
}
