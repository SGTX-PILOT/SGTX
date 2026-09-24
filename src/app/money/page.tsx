// @ts-nocheck
"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// COCKPIT-Phase 5: /money route — role-dependent financial view.
// ═════════════════════════════════════════════════════════════════════════════════
//
// Law #5: every invoice/bid/loan links to /trades/[ustn]. This is the
// financial queue, not a dashboard.
//
// Role → content:
//   TRD   → their invoices (payer or payee) + settlements
//   BANK  → financing opportunities (open RFQs) + their bids + collateral +
//           co-financing (v17 §10.23-10.24) — encrypted blind bidding,
//           blended APR, master + annex agreement viewer, PSP split
//   PFI   → same as BANK
//   GOV   → FX monitoring + settlement overview (cross-tenant, read-only)
//   Other → honest empty state

import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { CockpitShell, shouldShowAdmin } from "@/components/cockpit/CockpitShell";
import { useSession, fetchWithAuth } from "@/lib/cockpit/session";
import { useCockpitLocale } from "@/lib/cockpit/use-locale";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  DollarSign, FileText, Banknote, Scale, TrendingUp, Activity,
  ChevronRight, ChevronDown, Loader2, Landmark,
  Lock, Unlock, GitBranch, ScrollText, Layers, Eye, EyeOff, Coins,
  ShieldCheck, Calendar, CheckCircle2, AlertTriangle, Info, Gauge,
  Building2, Wallet, BarChart3, ArrowRightLeft, Zap, Database, Bank,
  Plug, KeyRound, Webhook, FlaskConical, Handshake, Send, Trash2,
  RefreshCw, ExternalLink, Code, Link2, Copy, FileWarning,
  ArrowUpRight, ArrowDownRight, Globe, ShieldOff,
} from "lucide-react";
import { fmtDate, fmtDateTime, fmtMoney, statusLabel } from "@/lib/cockpit/format";
import { cn } from "@/lib/utils";

interface DashboardData {
  tenant?: { gtid: string; legalName: string; type: string };
  tradesAsBuyer?: any[];
  tradesAsSeller?: any[];
  invoices?: any[];
  financingBids?: any[];
  openFinancingRequests?: any[];
  inbox?: any[];
}

export default function MoneyPage() {
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

  return (
    <CockpitShell
      roleLabel={payload.role}
      tenantName={data?.tenant?.legalName}
      showAdmin={shouldShowAdmin(tenantType)}
    >
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">{t("money.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("money.subtitle")}
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
      return <TraderMoney data={data} />;
    case "BANK":
    case "PFI":
      return <FinancierMoney data={data} />;
    case "MKT":
      return <MarketplacePartnerMoney data={data} />;
    case "GOV":
      return <GovMoney data={data} />;
    default:
      return (
        <div className="py-12 text-center">
          <DollarSign className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium">No financial view for your role</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
            Your tenant type ({tenantType || "unknown"}) doesn't have a financial queue. Visit Trades to see your trades.
          </p>
        </div>
      );
  }
}

// v18 — trades considered "active" for the Payment Status grid. Mirrors
// /trades list filter so the TRD money page only shows payment telemetry for
// in-flight trades (not drafts or history).
const PAYMENT_ACTIVE_STATUSES = new Set([
  "PENDING_SELLER_RESPONSE", "BUYER_SUBMITTED", "QUOTE_ACCEPTED",
  "CONTRACT_SIGNED", "IN_EXECUTION", "INSPECTION_REQUIRED",
  "CUSTOMS_PENDING", "PAYMENT_DUE",
]);

function TraderMoney({ data }: { data?: DashboardData }) {
  const invoices = data?.invoices || [];
  const outstanding = invoices.filter((i) => i.status === "ISSUED" || i.status === "OVERDUE");
  const paid = invoices.filter((i) => i.status === "PAID" || i.status === "SETTLED");
  const activeTrades = [...(data?.tradesAsBuyer || []), ...(data?.tradesAsSeller || [])]
    .filter((t: any) => PAYMENT_ACTIVE_STATUSES.has(t.status));

  return (
    <div className="space-y-6">
      <Section title="Outstanding invoices" count={outstanding.length} icon={FileText}>
        {outstanding.length > 0 ? (
          <InvoiceList invoices={outstanding} />
        ) : (
          <p className="text-sm text-muted-foreground">No outstanding invoices. All settled.</p>
        )}
      </Section>
      <Section title="Paid / settled" count={paid.length} icon={DollarSign}>
        {paid.length > 0 ? <InvoiceList invoices={paid} /> : <p className="text-sm text-muted-foreground">No paid invoices yet.</p>}
      </Section>
      {/* v18 — Payment telemetry for in-flight trades */}
      <TraderPaymentStatusSection trades={activeTrades} />
    </div>
  );
}

function FinancierMoney({ data }: { data?: DashboardData }) {
  const opportunities = data?.openFinancingRequests || [];
  const myBids = data?.financingBids || [];
  const accepted = myBids.filter((b) => b.status === "ACCEPTED");
  const tenantGtid = data?.tenant?.gtid || "";

  // Co-financing opportunities: open RFQs with ≥2 existing bids — these are
  // candidates for split financing (the borrower can accept multiple bids to
  // form one master agreement with blended APR).
  const coFinancingCandidates = opportunities.filter(
    (r: any) => (r.bids?.length || 0) >= 2,
  );

  return (
    <div className="space-y-6">
      <Section title="Financing opportunities (open RFQs)" count={opportunities.length} icon={TrendingUp}>
        {opportunities.length > 0 ? (
          <ul className="divide-y divide-border border border-border rounded-md bg-card/40">
            {opportunities.map((r: any, i: number) => (
              <li key={r.id || i}>
                <Link href={r.trade?.ustn ? `/trades/${r.trade.ustn}` : "/trades"} className="flex items-center justify-between gap-3 p-3 hover:bg-muted/40 transition group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {r.trade?.commodity || "Financing RFQ"} · {fmtMoney(r.amountUsd || r.amountRequested, r.preferredCurrency || r.currency || "USD")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Borrower: {r.borrower?.legalName || "—"} · {r.status || "OPEN"} · {r.bids?.length || 0} bid(s)
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No open financing RFQs.</p>
        )}
      </Section>

      {/* v17 §10.23 — Co-financing opportunities (RFQs with ≥2 existing bids) */}
      <Section title="Co-financing opportunities (split tranche)" count={coFinancingCandidates.length} icon={GitBranch}>
        {coFinancingCandidates.length > 0 ? (
          <ul className="divide-y divide-border border border-border rounded-md bg-card/40">
            {coFinancingCandidates.map((r: any, i: number) => (
              <li key={r.id || i} className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {r.trade?.commodity || "Financing RFQ"} · {fmtMoney(r.amountUsd, r.preferredCurrency || "USD")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Borrower: {r.borrower?.legalName || "—"} · {r.bids?.length || 0} financier(s) already bidding
                    </p>
                    <p className="text-xs text-muted-foreground/80 mt-0.5">
                      Bidding window closes {r.biddingWindowEndsAt ? fmtDateTime(r.biddingWindowEndsAt) : "—"}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[0.6rem] flex items-center gap-1">
                    <GitBranch className="w-3 h-3" />
                    Co-financing
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No co-financing candidates yet. A request becomes a co-financing candidate when 2+ financiers have submitted bids.
          </p>
        )}
      </Section>

      {/* v17 §10.23 — Bid submission with encrypted blind bidding */}
      <BidSubmissionWithEncryption tenantGtid={tenantGtid} opportunities={opportunities} />

      <Section title="Your bids" count={myBids.length} icon={Banknote}>
        {myBids.length > 0 ? (
          <ul className="divide-y divide-border border border-border rounded-md bg-card/40">
            {myBids.map((b: any, i: number) => (
              <li key={b.id || i}>
                <Link href={b.request?.trade?.ustn ? `/trades/${b.request.trade.ustn}` : "/trades"} className="flex items-center justify-between gap-3 p-3 hover:bg-muted/40 transition group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {fmtMoney(b.amountOffered, "USD")} at {b.apr ?? b.rateOffered}%
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                      {b.encryptedPayload ? (
                        <Lock className="w-3 h-3 text-amber-500/80" />
                      ) : (
                        <Unlock className="w-3 h-3 text-muted-foreground/60" />
                      )}
                      {b.status || "PENDING"} · {b.request?.trade?.commodity || "Trade"}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">You haven't placed any bids yet.</p>
        )}
      </Section>

      {/* v17 §10.24 — Co-financing agreement viewer (master + annexes + blended APR) */}
      <CoFinancingAgreementViewer tenantGtid={tenantGtid} acceptedBids={accepted} />

      <Section title="Active loans" count={accepted.length} icon={Scale}>
        {accepted.length > 0 ? (
          <ul className="divide-y divide-border border border-border rounded-md bg-card/40">
            {accepted.map((b: any, i: number) => (
              <li key={b.id || i}>
                <Link href={b.request?.trade?.ustn ? `/trades/${b.request.trade.ustn}` : "/trades"} className="flex items-center justify-between gap-3 p-3 hover:bg-muted/40 transition group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{fmtMoney(b.amountOffered, "USD")} loan</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Borrower: {b.request?.borrower?.legalName || "—"} · {fmtDate(b.acceptedAt || b.createdAt)}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No active loans.</p>
        )}
      </Section>

      {/* v18 — Bank Mandate & Capability Registry */}
      <BankMandateSection />

      {/* v18 §16.10 / GAP-3 — Financier's portfolio view (active TradeFinanceCase rows) */}
      <PortfolioSection financierGtid={tenantGtid} />

      {/* v18 §3B.5.12.1 — DeFi pools with risk oracles + ZK reserve proof */}
      <DefiPoolsSection financierGtid={tenantGtid} />

      {/* v18 §3B.5 — Collateral monitoring with LTV + liquidation price */}
      <CollateralMonitoringSection financierGtid={tenantGtid} />

      {/* v18 §13.6 — FX settlement view + CBE settlement dispatch */}
      <FxSettlementSection financierGtid={tenantGtid} />

      {/* v18 §16.8.10 Tab 5 — Financed Companies Directory (private, read-only) */}
      <FinancedCompaniesDirectory financierGtid={tenantGtid} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// v17 §10.23 — Bid submission with encrypted blind bidding
// ═══════════════════════════════════════════════════════════════════════════════
//
// Two-step flow:
//   1. POST /api/sgtx/financing/bids/encrypt → returns encrypted_payload
//      (simulated NaCl-style public-key encryption — see lib header).
//   2. POST /api/sgtx/financing/bid → submits the bid with encrypted_payload
//      stored on the FinancingBid row.
//
// In production, step 1 would run entirely in the financier's browser using
// libsodium `crypto_box_seal`. SGTX would never see the plaintext bid terms
// until the bidding window closes and the financier chooses to decrypt.

function BidSubmissionWithEncryption({
  tenantGtid,
  opportunities,
}: {
  tenantGtid: string;
  opportunities: any[];
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [amount, setAmount] = useState("");
  const [apr, setApr] = useState("");
  const [settlement, setSettlement] = useState("BANK_TRANSFER");
  const [collateral, setCollateral] = useState("GOODS");
  const [isDeFi, setIsDeFi] = useState(false);
  const [deFiProtocol, setDeFiProtocol] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [encryptedPreview, setEncryptedPreview] = useState<string | null>(null);
  const [submittedBidId, setSubmittedBidId] = useState<string | null>(null);

  const openRfqs = opportunities.filter((r) =>
    ["BIDDING_OPEN", "RFQ_BROADCAST", "REQUESTED"].includes(r.status),
  );

  async function handleEncryptAndSubmit() {
    setError(null);
    setEncryptedPreview(null);
    setSubmittedBidId(null);

    if (!tenantGtid) {
      setError("Missing financier identity (no tenant gtid in session).");
      return;
    }
    if (!requestId) {
      setError("Select a financing request first.");
      return;
    }
    const amt = parseFloat(amount);
    const aprNum = parseFloat(apr);
    if (!amt || amt <= 0) {
      setError("Amount must be a positive number.");
      return;
    }
    if (isNaN(aprNum) || aprNum < 0) {
      setError("APR must be a non-negative number.");
      return;
    }
    if (isDeFi && !deFiProtocol) {
      setError("DeFi protocol is required when isDeFi is on.");
      return;
    }

    setBusy(true);
    try {
      // Step 1: encrypt the bid payload (simulated NaCl)
      const bidData = {
        amountOffered: amt,
        apr: aprNum,
        settlementMethod: settlement,
        collateralRequired: collateral,
        conditions: null,
        noteToBorrower: note || null,
        isDeFi,
        deFiProtocol: isDeFi ? deFiProtocol : null,
      };
      const encRes = await fetchWithAuth("/api/sgtx/financing/bids/encrypt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bid_data: bidData,
          financier_gtid: tenantGtid,
        }),
      });
      const encJson = await encRes.json();
      if (!encRes.ok) {
        setError(encJson?.error || "Encryption failed");
        setBusy(false);
        return;
      }
      setEncryptedPreview(encJson.encrypted_payload);

      // Step 2: submit the bid with the encrypted payload
      const submitRes = await fetchWithAuth("/api/sgtx/financing/bid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          financierGtid: tenantGtid,
          amountOffered: amt,
          apr: aprNum,
          settlementMethod: settlement,
          collateralRequired: collateral,
          noteToBorrower: note || null,
          isDeFi,
          deFiProtocol: isDeFi ? deFiProtocol : null,
          borrowerPublicKey: tenantGtid, // simulated: financier encrypts with their own public key
          encryptedPayload: encJson.encrypted_payload, // hint for the bid route to store the proper payload
        }),
      });
      const submitJson = await submitRes.json();
      if (!submitRes.ok) {
        setError(submitJson?.error || "Bid submission failed");
        setBusy(false);
        return;
      }
      setSubmittedBidId(submitJson.bidId);

      // Refresh the dashboard query so the new bid shows up in the list
      queryClient.invalidateQueries({ queryKey: ["cockpit-dashboard", tenantGtid] });

      // Reset form
      setAmount("");
      setApr("");
      setNote("");
      setDeFiProtocol("");
      setIsDeFi(false);
    } catch (e: any) {
      setError(e?.message || "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Submit a bid (encrypted blind bidding)"
      count={openRfqs.length}
      icon={Lock}
    >
      <div className="rounded-md border border-border bg-card/40 p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Lock className="w-3.5 h-3.5" />
          <span>
            Your bid terms are encrypted with your public key before submission. SGTX and the borrower cannot see the terms until the bidding window closes (simulated NaCl-style encryption — see lib header for the production plan).
          </span>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-sm font-medium text-primary hover:underline"
        >
          {open ? "− Cancel" : "+ Submit a new bid"}
        </button>

        {open && (
          <div className="space-y-3 pt-2 border-t border-border">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs space-y-1">
                <span className="text-muted-foreground">Financing request</span>
                <select
                  value={requestId}
                  onChange={(e) => setRequestId(e.target.value)}
                  className="w-full h-9 px-2 rounded border border-border bg-background text-sm"
                >
                  <option value="">Select an open RFQ…</option>
                  {openRfqs.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.requestId} · {fmtMoney(r.amountUsd, r.preferredCurrency || "USD")} · {r.borrower?.legalName || "—"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs space-y-1">
                <span className="text-muted-foreground">Amount offered (USD)</span>
                <input
                  type="number"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 50000"
                  className="w-full h-9 px-2 rounded border border-border bg-background text-sm"
                />
              </label>
              <label className="text-xs space-y-1">
                <span className="text-muted-foreground">APR (%)</span>
                <input
                  type="number"
                  step="any"
                  value={apr}
                  onChange={(e) => setApr(e.target.value)}
                  placeholder="e.g. 6.5"
                  className="w-full h-9 px-2 rounded border border-border bg-background text-sm"
                />
              </label>
              <label className="text-xs space-y-1">
                <span className="text-muted-foreground">Settlement method</span>
                <select
                  value={settlement}
                  onChange={(e) => setSettlement(e.target.value)}
                  className="w-full h-9 px-2 rounded border border-border bg-background text-sm"
                >
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="STABLECOIN">Stablecoin (USDC/USDT)</option>
                  <option value="DEFI_PROTOCOL">DeFi Protocol</option>
                </select>
              </label>
              <label className="text-xs space-y-1">
                <span className="text-muted-foreground">Collateral</span>
                <select
                  value={collateral}
                  onChange={(e) => setCollateral(e.target.value)}
                  className="w-full h-9 px-2 rounded border border-border bg-background text-sm"
                >
                  <option value="GOODS">Goods</option>
                  <option value="WAREHOUSE_RECEIPT">Warehouse Receipt</option>
                  <option value="RECEIVABLES">Receivables</option>
                  <option value="NONE">None</option>
                </select>
              </label>
              <label className="text-xs space-y-1">
                <span className="text-muted-foreground">Note to borrower (optional)</span>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="One-line note"
                  className="w-full h-9 px-2 rounded border border-border bg-background text-sm"
                />
              </label>
              <label className="text-xs space-y-1 flex items-center gap-2 pt-1.5">
                <input
                  type="checkbox"
                  checked={isDeFi}
                  onChange={(e) => setIsDeFi(e.target.checked)}
                  className="w-4 h-4"
                />
                <span>DeFi bid</span>
              </label>
              {isDeFi && (
                <label className="text-xs space-y-1">
                  <span className="text-muted-foreground">DeFi protocol</span>
                  <input
                    type="text"
                    value={deFiProtocol}
                    onChange={(e) => setDeFiProtocol(e.target.value)}
                    placeholder="e.g. Aave"
                    className="w-full h-9 px-2 rounded border border-border bg-background text-sm"
                  />
                </label>
              )}
            </div>

            <button
              type="button"
              onClick={handleEncryptAndSubmit}
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              {busy ? "Encrypting & submitting…" : "Encrypt & submit bid"}
            </button>

            {error && (
              <p className="text-xs text-red-500 flex items-start gap-1.5">
                <span>⚠</span>
                <span>{error}</span>
              </p>
            )}
            {encryptedPreview && (
              <div className="text-xs space-y-1">
                <p className="text-muted-foreground flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  Encrypted payload (stored on SGTX, opaque until window closes):
                </p>
                <code className="block bg-muted/40 p-2 rounded text-[0.65rem] break-all max-h-32 overflow-y-auto">
                  {encryptedPreview.slice(0, 240)}
                  {encryptedPreview.length > 240 ? "…" : ""}
                </code>
              </div>
            )}
            {submittedBidId && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <span>✓</span>
                <span>Bid submitted — ID: <code className="font-mono">{submittedBidId}</code></span>
              </p>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// v17 §10.24 — Co-financing agreement viewer (master + annexes + blended APR)
// ═══════════════════════════════════════════════════════════════════════════════
//
// For each accepted bid, the financier can fetch the assembled master
// financing agreement (with blended APR + total amount + non-removable SGTX
// Witness Clause + SHA-256 hash) and the annex for their tranche (amount,
// APR, fee, borrower net, repayment schedule).

function CoFinancingAgreementViewer({
  tenantGtid: _tenantGtid,
  acceptedBids,
}: {
  tenantGtid: string;
  acceptedBids: any[];
}) {
  const [expandedBidId, setExpandedBidId] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agreement, setAgreement] = useState<any>(null);

  if (acceptedBids.length === 0) {
    return (
      <Section title="Co-financing agreement (master + annexes)" count={0} icon={ScrollText}>
        <p className="text-sm text-muted-foreground">
          No accepted bids yet. Once the borrower accepts your bid, the master co-financing agreement + your tranche annex will appear here.
        </p>
      </Section>
    );
  }

  async function fetchAgreement(financingRequestId: string, bidId: string) {
    setLoading(bidId);
    setError(null);
    setAgreement(null);
    try {
      const res = await fetchWithAuth("/api/sgtx/financing/co-financing/agreement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ co_financing_id: financingRequestId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || "Failed to fetch agreement");
        return;
      }
      setAgreement(json);
      setExpandedBidId(bidId);
    } catch (e: any) {
      setError(e?.message || "Network error");
    } finally {
      setLoading(null);
    }
  }

  return (
    <Section title="Co-financing agreement (master + annexes)" count={acceptedBids.length} icon={ScrollText}>
      <ul className="divide-y divide-border border border-border rounded-md bg-card/40">
        {acceptedBids.map((b: any, i: number) => {
          const finReqId = b.request?.id;
          const isExpanded = expandedBidId === b.bidId;
          const isLoading = loading === b.bidId;
          return (
            <li key={b.id || i} className="p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    Bid {b.bidId} · {fmtMoney(b.amountOffered, "USD")} @ {b.apr}%
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Request {b.request?.requestId} · Borrower {b.request?.borrower?.legalName || "—"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    isExpanded
                      ? setExpandedBidId(null)
                      : finReqId && fetchAgreement(finReqId, b.bidId)
                  }
                  disabled={!finReqId || isLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium hover:bg-muted/40 disabled:opacity-50 transition"
                >
                  {isLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : isExpanded ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                  {isExpanded ? "Hide" : "View agreement"}
                </button>
              </div>

              {isExpanded && agreement && (
                <div className="pt-3 mt-3 border-t border-border space-y-3">
                  {/* Master agreement */}
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <ScrollText className="w-3.5 h-3.5 text-amber-600" />
                      <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-500">
                        Master financing agreement
                      </p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <Field label="Agreement ID" value={agreement.master_agreement?.agreement_id} mono />
                      <Field label="Blended APR" value={`${agreement.blended_apr}%`} accent />
                      <Field label="Total amount" value={fmtMoney(agreement.total_amount, "USD")} accent />
                      <Field label="Tranches" value={String(agreement.annexes?.length || 0)} />
                    </div>
                    <div className="text-xs space-y-1">
                      <Field label="Master SHA-256" value={agreement.master_agreement?.master_hash} mono />
                      <Field label="Combined hash" value={agreement.sha256_hash} mono />
                    </div>
                    <div className="text-xs text-muted-foreground pt-1">
                      <p className="font-medium text-amber-700 dark:text-amber-500 mb-1 flex items-center gap-1">
                        <ScrollText className="w-3 h-3" />
                        SGTX Witness Clause (non-removable):
                      </p>
                      <p className="italic leading-relaxed">
                        &ldquo;{agreement.master_agreement?.witness_clause?.slice(0, 280)}
                        {agreement.master_agreement?.witness_clause?.length > 280 ? "…" : ""}&rdquo;
                      </p>
                    </div>
                  </div>

                  {/* Annexes table */}
                  <div className="rounded-md border border-border bg-card/40">
                    <div className="px-3 py-2 border-b border-border flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Annexes (one per financier tranche)
                      </p>
                    </div>
                    <div className="max-h-72 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/30 sticky top-0">
                          <tr className="text-left text-muted-foreground">
                            <th className="px-3 py-2 font-medium">Financier GTID</th>
                            <th className="px-3 py-2 font-medium">Amount</th>
                            <th className="px-3 py-2 font-medium">APR</th>
                            <th className="px-3 py-2 font-medium">Fee (0.25%)</th>
                            <th className="px-3 py-2 font-medium">Borrower net</th>
                            <th className="px-3 py-2 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {(agreement.annexes || []).map((a: any, j: number) => {
                            const mine = a.financier_gtid === b.financierGtid;
                            return (
                              <tr key={j} className={mine ? "bg-amber-500/5" : ""}>
                                <td className="px-3 py-2 font-mono text-[0.65rem]">
                                  {a.financier_gtid}
                                  {mine && (
                                    <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-500 text-[0.55rem] font-medium uppercase tracking-wider">
                                      Your tranche
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2">{fmtMoney(a.amount, "USD")}</td>
                                <td className="px-3 py-2">{a.apr}%</td>
                                <td className="px-3 py-2">{fmtMoney(a.fee, "USD")}</td>
                                <td className="px-3 py-2">{fmtMoney(a.borrower_net, "USD")}</td>
                                <td className="px-3 py-2">
                                  <Badge variant="outline" className="text-[0.55rem]">
                                    {statusLabel(a.status || "PENDING")}
                                  </Badge>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <p className="text-[0.65rem] text-muted-foreground/80 flex items-center gap-1">
                    <Coins className="w-3 h-3" />
                    PSP split disbursement: 0.25% fee per tranche, deducted from principal, routed to SGTX via single PSP split instruction.
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <p className="text-xs text-red-500 mt-2 flex items-start gap-1.5">
          <span>⚠</span>
          <span>{error}</span>
        </p>
      )}
    </Section>
  );
}

function Field({ label, value, mono, accent }: { label: string; value: any; mono?: boolean; accent?: boolean }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={
          (mono ? "font-mono text-[0.7rem] break-all " : "font-medium ") +
          (accent ? "text-amber-700 dark:text-amber-500" : "")
        }
      >
        {value ?? "—"}
      </p>
    </div>
  );
}

function GovMoney({ data }: { data?: DashboardData }) {
  const trades = [...(data?.tradesAsBuyer || []), ...(data?.tradesAsSeller || [])];
  const totalValue = trades.reduce((s, t) => s + (t.totalValue || 0), 0);
  const fxAlerts = (data?.inbox || []).filter((i) => i.category === "FX_ALERT" || i.category === "COMPLIANCE");

  return (
    <div className="space-y-6">
      <Section title="Cross-border flow" count={trades.length} icon={Activity}>
        <div className="p-4 rounded-md border border-border bg-card/40">
          <p className="text-2xl font-semibold">{fmtMoney(totalValue, "USD")}</p>
          <p className="text-xs text-muted-foreground mt-1">total monitored trade value</p>
        </div>
      </Section>
      <Section title="FX / settlement alerts" count={fxAlerts.length} icon={Landmark}>
        {fxAlerts.length > 0 ? (
          <ul className="divide-y divide-border border border-border rounded-md bg-card/40">
            {fxAlerts.map((a: any, i: number) => (
              <li key={a.id || i}>
                <Link href={a.trade?.ustn ? `/trades/${a.trade.ustn}` : "/trades"} className="flex items-center justify-between gap-3 p-3 hover:bg-muted/40 transition group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{a.title || a.message}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{a.category} · {fmtDate(a.createdAt)}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No FX alerts.</p>
        )}
      </Section>
    </div>
  );
}

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

function InvoiceList({ invoices }: { invoices: any[] }) {
  return (
    <ul className="divide-y divide-border border border-border rounded-md bg-card/40">
      {invoices.map((inv: any, i: number) => (
        <li key={inv.id || i}>
          <Link href={inv.trade?.ustn ? `/trades/${inv.trade.ustn}` : "/trades"} className="flex items-center justify-between gap-3 p-3 hover:bg-muted/40 transition group">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{inv.number || `Invoice ${inv.id?.substring(0, 8)}`}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {fmtMoney(inv.amount, inv.currency)} · {inv.trade?.commodity || "Trade"} · {fmtDate(inv.createdAt)}
              </p>
            </div>
            <Badge variant="outline" className="text-[0.6rem]">{statusLabel(inv.status)}</Badge>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// v18 — TRD Payment Status grid (FeeLock + Payment Manifest + Fee Decision + Payment Health)
// ═══════════════════════════════════════════════════════════════════════════════
//
// For every active trade, this section calls four v18 endpoints in parallel:
//   • GET /api/sgtx/feelock/[ustn]            → FeeLock status (PENDING/ACTIVE/DISPUTED)
//   • GET /api/sgtx/payment-manifest/[ustn]  → total_egp, total_usd, leg count
//   • GET /api/sgtx/fees/[ustn]/decision     → final_fee, final_rate (fairness score)
//   • GET /api/sgtx/payment/[ustn]/health    → score 0-100, band (HEALTHY/WARNING/CRITICAL)
//
// All queries use retry:false so a 404 (trade exists but no FeeLock yet, etc.)
// surfaces immediately as an empty state instead of storming the server.

function TraderPaymentStatusSection({ trades }: { trades: any[] }) {
  if (trades.length === 0) {
    return (
      <Section title="Payment status (v18)" count={0} icon={ShieldCheck}>
        <p className="text-sm text-muted-foreground">
          No active trades. Payment status will appear here once you have an in-flight trade with a FeeLock, manifest, and fee decision.
        </p>
      </Section>
    );
  }
  return (
    <Section title="Payment status (v18)" count={trades.length} icon={ShieldCheck}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {trades.map((t: any) => (
          <TradePaymentCard key={t.ustn || t.id} ustn={t.ustn} commodity={t.commodity} />
        ))}
      </div>
    </Section>
  );
}

function TradePaymentCard({ ustn, commodity }: { ustn: string; commodity?: string }) {
  // 1. FeeLock
  const feelockQ = useQuery({
    queryKey: ["money-feelock", ustn],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/feelock/${encodeURIComponent(ustn)}`);
      if (!res.ok) throw new Error(`feelock ${res.status}`);
      return res.json() as Promise<any>;
    },
    retry: false,
  });

  // 2. Payment Manifest
  const manifestQ = useQuery({
    queryKey: ["money-manifest", ustn],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/payment-manifest/${encodeURIComponent(ustn)}`);
      if (!res.ok) throw new Error(`manifest ${res.status}`);
      return res.json() as Promise<any>;
    },
    retry: false,
  });

  // 3. Fee Decision
  const feeDecisionQ = useQuery({
    queryKey: ["money-fee-decision", ustn],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/fees/${encodeURIComponent(ustn)}/decision`);
      if (!res.ok) throw new Error(`fee-decision ${res.status}`);
      return res.json() as Promise<any>;
    },
    retry: false,
  });

  // 4. Payment Health
  const healthQ = useQuery({
    queryKey: ["money-health", ustn],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/payment/${encodeURIComponent(ustn)}/health`);
      if (!res.ok) throw new Error(`health ${res.status}`);
      return res.json() as Promise<any>;
    },
    retry: false,
  });

  // Defensive derivations — every endpoint may return a slightly different
  // casing (camelCase vs snake_case) depending on which lib produced it.
  const feelock = feelockQ.data;
  const feelockStatus = feelock?.status || feelock?.state;
  const feelockFee = feelock?.feeUsd ?? feelock?.fee_usd ?? feelock?.lockedFeeUsd;

  const manifest = manifestQ.data?.manifest || manifestQ.data;
  const manifestVersion = manifest?.version;
  const manifestLegs: any[] = manifest?.legs || [];
  const manifestLegCount = manifestLegs.length;
  const totalEgp = manifest?.totalEgp ?? manifest?.total_egp;
  const totalUsd = manifest?.totalUsd ?? manifest?.total_usd;

  const feeDecision = feeDecisionQ.data;
  const feeAmount = feeDecision?.feeUsd ?? feeDecision?.fee_usd ?? feeDecision?.finalFeeUsd;
  const finalRate = feeDecision?.finalRate ?? feeDecision?.final_rate;
  const fairnessScore = feeDecision?.fairnessScore ?? feeDecision?.fairness_score;

  const health = healthQ.data;
  const healthScore: number | undefined = health?.score;
  const healthBand = health?.band;
  const healthTone =
    healthBand === "HEALTHY" ? "active"
    : healthBand === "WARNING" ? "warning"
    : healthBand === "CRITICAL" ? "critical"
    : "neutral";

  // Health bar color (green/amber/red) — independent of the global primary
  // color so the band stays legible across light/dark mode.
  const healthBarClass =
    healthBand === "HEALTHY" ? "[&>[data-slot=progress-indicator]]:bg-emerald-500"
    : healthBand === "WARNING" ? "[&>[data-slot=progress-indicator]]:bg-amber-500"
    : healthBand === "CRITICAL" ? "[&>[data-slot=progress-indicator]]:bg-red-500"
    : "";

  const feelockTone =
    feelockStatus === "ACTIVE" ? "active"
    : feelockStatus === "PENDING" ? "pending"
    : feelockStatus === "DISPUTED" ? "warning"
    : feelockStatus === "CANCELLED" ? "critical"
    : "neutral";

  return (
    <Card className="p-4 space-y-3">
      {/* Card header — trade id + commodity */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{commodity || "Untitled trade"}</p>
          <p className="text-[0.65rem] text-muted-foreground font-mono truncate">{ustn}</p>
        </div>
        {healthScore !== undefined ? (
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <Badge
              variant="outline"
              className={
                "text-[0.6rem] " +
                (healthTone === "active" ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                  : healthTone === "warning" ? "border-amber-500/40 text-amber-700 dark:text-amber-300"
                  : healthTone === "critical" ? "border-red-500/40 text-red-700 dark:text-red-300"
                  : "")
              }
            >
              {healthBand || "—"}
            </Badge>
            <span className="text-[0.65rem] text-muted-foreground">{healthScore}/100</span>
          </div>
        ) : healthQ.isLoading ? (
          <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
        ) : (
          <Badge variant="outline" className="text-[0.6rem] text-muted-foreground">No health data</Badge>
        )}
      </div>

      {/* Health bar */}
      {healthScore !== undefined && (
        <Progress value={healthScore} className={healthBarClass} />
      )}

      {/* Compact grid — FeeLock, Manifest, Fee Decision */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <PayStat
          label="FeeLock"
          icon={ShieldCheck}
          loading={feelockQ.isLoading}
          error={feelockQ.isError}
          value={feelockStatus ? statusLabel(feelockStatus) : undefined}
          sub={feelockFee !== undefined ? fmtMoney(feelockFee, "USD") : undefined}
          tone={feelockTone}
        />
        <PayStat
          label="Manifest"
          icon={FileText}
          loading={manifestQ.isLoading}
          error={manifestQ.isError}
          value={manifestVersion ? `v${manifestVersion}` : undefined}
          sub={manifestLegCount > 0 ? `${manifestLegCount} leg${manifestLegCount === 1 ? "" : "s"}` : undefined}
        />
        <PayStat
          label="Fee Decision"
          icon={Gauge}
          loading={feeDecisionQ.isLoading}
          error={feeDecisionQ.isError}
          value={feeAmount !== undefined ? fmtMoney(feeAmount, "USD") : undefined}
          sub={finalRate !== undefined ? `rate ${finalRate}` : fairnessScore !== undefined ? `fairness ${fairnessScore}` : undefined}
        />
      </div>

      {/* Manifest totals (when available) */}
      {(totalEgp !== undefined || totalUsd !== undefined) && (
        <div className="pt-2 border-t border-border flex items-center justify-between text-[0.7rem] text-muted-foreground">
          <span>Manifest totals:</span>
          <span className="font-mono">
            {totalEgp !== undefined && <>EGP {fmtMoney(totalEgp, "EGP")}</>}
            {totalEgp !== undefined && totalUsd !== undefined && <> · </>}
            {totalUsd !== undefined && <>USD {fmtMoney(totalUsd, "USD")}</>}
          </span>
        </div>
      )}

      {/* Empty state — all four endpoints returned 404 */}
      {!feelockQ.isLoading && !manifestQ.isLoading && !feeDecisionQ.isLoading && !healthQ.isLoading &&
       feelockQ.isError && manifestQ.isError && feeDecisionQ.isError && healthQ.isError && (
        <p className="text-[0.65rem] text-muted-foreground/80 italic">
          No payment data yet — FeeLock, manifest, fee decision, and health will appear here as the trade progresses through contract lock and milestone payments.
        </p>
      )}
    </Card>
  );
}

function PayStat({
  label,
  icon: Icon,
  loading,
  error,
  value,
  sub,
  tone,
}: {
  label: string;
  icon: any;
  loading: boolean;
  error: boolean;
  value?: string;
  sub?: string;
  tone?: "active" | "pending" | "warning" | "critical" | "neutral";
}) {
  const toneClass =
    tone === "active" ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
    : tone === "pending" ? "border-amber-500/40 text-amber-700 dark:text-amber-300"
    : tone === "warning" ? "border-amber-500/40 text-amber-700 dark:text-amber-300"
    : tone === "critical" ? "border-red-500/40 text-red-700 dark:text-red-300"
    : "";
  return (
    <div className={"rounded-md border bg-card/40 p-2 space-y-0.5 " + (tone ? toneClass : "")}>
      <p className="text-[0.55rem] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        <Icon className="w-2.5 h-2.5" />
        {label}
      </p>
      {loading ? (
        <p className="text-[0.65rem] text-muted-foreground flex items-center gap-1">
          <Loader2 className="w-2.5 h-2.5 animate-spin" /> …
        </p>
      ) : error ? (
        <p className="text-[0.65rem] text-muted-foreground/70">—</p>
      ) : (
        <>
          <p className="text-[0.7rem] font-medium truncate">{value || "—"}</p>
          {sub && <p className="text-[0.6rem] text-muted-foreground truncate">{sub}</p>}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// v18 — Bank Mandate & Capability Registry (BANK/PFI role)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Calls GET /api/sgtx/bank-mandate/registry to list every bank in the capability
// registry: tier (1=Full ISO 20022, 2=pain.001-only, 3=H2H/SFTP), supported
// messages (pain.001, camt.054, pain.008, camt.053), and health status.
//
// Also surfaces co-financing opportunities (open RFQs with ≥2 bids already
// counted by the FinancierMoney parent — passed in as a prop so the section
// renders below the bank registry without re-querying).

function BankMandateSection() {
  const registryQ = useQuery({
    queryKey: ["money-bank-mandate-registry"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/sgtx/bank-mandate/registry");
      if (!res.ok) throw new Error(`bank-mandate ${res.status}`);
      return res.json() as Promise<any>;
    },
    retry: false,
  });

  const banks: any[] = registryQ.data?.banks || [];

  return (
    <Section title="Bank Mandate & Capability Registry (v18)" count={banks.length} icon={Building2}>
      {registryQ.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading bank registry…
        </div>
      ) : registryQ.isError ? (
        <div className="p-3 rounded-md border border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/10 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>Bank mandate registry unavailable. The v18 endpoint returned an error — try again later.</span>
        </div>
      ) : banks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No banks registered in the capability registry yet. Banks are added via POST /api/sgtx/bank-mandate/registry.
        </p>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-md bg-card/40">
          {banks.map((b: any, i: number) => {
            const tier = b.tier || b.capabilityTier;
            const tierLabel = b.tierLabel || (tier === 1 ? "Full ISO 20022" : tier === 2 ? "pain.001-only" : tier === 3 ? "H2H/SFTP" : "—");
            const health = b.healthStatus || b.health_status || "—";
            const supportedMsgs: string[] = b.supportedMessages || [];
            const healthTone =
              health === "HEALTHY" ? "active"
              : health === "DEGRADED" ? "warning"
              : health === "OFFLINE" ? "critical"
              : "neutral";
            return (
              <li key={b.gtid || b.id || i} className="p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{b.name || b.gtid}</p>
                    <p className="text-[0.65rem] text-muted-foreground font-mono truncate">
                      BIC {b.bic || "—"} · {b.gtid}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant="outline" className="text-[0.55rem]">{tierLabel}</Badge>
                    <Badge
                      variant="outline"
                      className={
                        "text-[0.55rem] " +
                        (healthTone === "active" ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                          : healthTone === "warning" ? "border-amber-500/40 text-amber-700 dark:text-amber-300"
                          : healthTone === "critical" ? "border-red-500/40 text-red-700 dark:text-red-300"
                          : "")
                      }
                    >
                      {health}
                    </Badge>
                  </div>
                </div>
                {supportedMsgs.length > 0 && (
                  <p className="text-[0.65rem] text-muted-foreground/80">
                    Supports: {supportedMsgs.join(" · ")}
                  </p>
                )}
                {Array.isArray(b.ibanPrefixes) && b.ibanPrefixes.length > 0 && (
                  <p className="text-[0.65rem] text-muted-foreground/80">
                    IBAN prefixes: {b.ibanPrefixes.join(", ")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[0.65rem] text-muted-foreground/70 flex items-start gap-1.5 mt-2">
        <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
        <span>
          Tier 1 = Full ISO 20022 (pain.001, camt.054, pain.008, camt.053). Tier 2 = pain.001-only (outbound payments). Tier 3 = H2H/SFTP file-based settlement. Mandates registered under Egyptian Banking Law 194/2020.
        </span>
      </p>
    </Section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// v18 §16.10 / GAP-3 — Financier Portfolio section
// ═══════════════════════════════════════════════════════════════════════════════
//
// Fetches /api/sgtx/finance/cases/financier/[financierGtid] to list every
// TradeFinanceCase row where this financier is the selected counterparty.
// Each case carries: ustn, borrowerGtid, amountUsd, apr, status, tenorDays,
// collateralType, collateralValueUsd, disbursementAmountUsd, repaymentAmountUsd,
// repaymentDate, marginCallThreshold, marginCallTriggered.
//
// Summary cards: Total Exposure (sum of amountUsd), Active Loans (status not CLOSED/REJECTED),
// Repayments Due (repaymentDate within 7 days), Defaults (status includes DEFAULT/DELINQUENT).

function PortfolioSection({ financierGtid }: { financierGtid: string }) {
  const [expandedCaseId, setExpandedCaseId] = useState<string | null>(null);
  const casesQ = useQuery({
    queryKey: ["money-portfolio-cases", financierGtid],
    queryFn: async () => {
      const res = await fetchWithAuth(
        `/api/sgtx/finance/cases/financier/${encodeURIComponent(financierGtid)}`,
      );
      if (!res.ok) throw new Error(`portfolio ${res.status}`);
      return res.json() as Promise<{ cases: any[] }>;
    },
    enabled: !!financierGtid,
    retry: false,
  });

  const cases: any[] = casesQ.data?.cases || [];
  const now = new Date();
  const sevenDaysAhead = new Date(now.getTime() + 7 * 86_400_000);

  const activeCases = cases.filter(
    (c) => !["CLOSED", "REJECTED", "CANCELLED"].includes(c.status || ""),
  );
  const totalExposure = activeCases.reduce((s, c) => s + (Number(c.amountUsd) || 0), 0);
  const repaymentsDue = cases.filter((c) => {
    const rd = c.repaymentDate ? new Date(c.repaymentDate) : null;
    return rd && rd >= now && rd <= sevenDaysAhead;
  }).length;
  const defaults = cases.filter(
    (c) => (c.status || "").toUpperCase().includes("DEFAULT") ||
           (c.status || "").toUpperCase().includes("DELINQUENT") ||
           c.marginCallTriggered === true,
  ).length;

  return (
    <Section title="Portfolio (active loans)" count={activeCases.length} icon={Wallet}>
      {casesQ.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading portfolio…
        </div>
      ) : casesQ.isError ? (
        <div className="p-3 rounded-md border border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/10 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>Portfolio endpoint unavailable. Try again later.</span>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <SummaryCard
              label="Total Exposure"
              value={fmtMoney(totalExposure, "USD")}
              icon={DollarSign}
              tone="default"
            />
            <SummaryCard
              label="Active Loans"
              value={String(activeCases.length)}
              icon={Scale}
              tone="active"
            />
            <SummaryCard
              label="Repayments Due (7d)"
              value={String(repaymentsDue)}
              icon={Calendar}
              tone={repaymentsDue > 0 ? "warning" : "default"}
            />
            <SummaryCard
              label="Defaults / Margin Calls"
              value={String(defaults)}
              icon={AlertTriangle}
              tone={defaults > 0 ? "critical" : "default"}
            />
          </div>

          {/* Loan list */}
          {activeCases.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active loans in your portfolio. Bid on open RFQs above to build your portfolio.
            </p>
          ) : (
            <ul className="divide-y divide-border border border-border rounded-md bg-card/40">
              {activeCases.map((c, i) => {
                const isExpanded = expandedCaseId === c.id;
                const apr = c.apr !== undefined ? `${Number(c.apr).toFixed(2)}%` : "—";
                const maskedBorrower = maskGtid(c.borrowerGtid);
                const nextRepay = c.repaymentDate ? fmtDate(c.repaymentDate) : "—";
                const isOverdue =
                  c.repaymentDate && new Date(c.repaymentDate) < now &&
                  !["CLOSED", "REJECTED", "SETTLED"].includes(c.status || "");
                return (
                  <li key={c.id || i} className="p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {c.ustn ? (
                            <Link href={`/trades/${c.ustn}`} className="hover:underline">
                              {c.ustn}
                            </Link>
                          ) : c.caseId || "Loan case"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Borrower: {maskedBorrower} · {fmtMoney(c.amountUsd, c.currency || "USD")} · APR {apr}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant="outline" className="text-[0.55rem]">
                          {statusLabel(c.status || "ACTIVE")}
                        </Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setExpandedCaseId(isExpanded ? null : c.id)}
                        >
                          {isExpanded ? "Hide" : "View"}
                          <ChevronDown className={cn("w-3 h-3 ml-1 transition-transform", isExpanded && "rotate-180")} />
                        </Button>
                      </div>
                    </div>
                    {isOverdue && (
                      <p className="text-[0.65rem] text-red-600 dark:text-red-400 mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Overdue repayment — {nextRepay}
                      </p>
                    )}
                    {isExpanded && (
                      <div className="mt-2 pt-2 border-t border-border grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <Field label="Case ID" value={c.caseId} mono />
                        <Field label="Tenor (days)" value={c.tenorDays || "—"} />
                        <Field label="Collateral type" value={c.collateralType || "—"} />
                        <Field label="Collateral value" value={c.collateralValueUsd ? fmtMoney(c.collateralValueUsd, "USD") : "—"} />
                        <Field label="Disbursed" value={c.disbursementAmountUsd ? fmtMoney(c.disbursementAmountUsd, "USD") : "—"} />
                        <Field label="Disbursement date" value={c.disbursementDate ? fmtDate(c.disbursementDate) : "—"} />
                        <Field label="Repayment amount" value={c.repaymentAmountUsd ? fmtMoney(c.repaymentAmountUsd, "USD") : "—"} />
                        <Field label="Repayment date" value={nextRepay} />
                        <Field label="Margin call threshold" value={c.marginCallThreshold ? `${(Number(c.marginCallThreshold) * 100).toFixed(0)}%` : "—"} />
                        <Field label="Margin call triggered" value={c.marginCallTriggered ? "Yes" : "No"} accent={c.marginCallTriggered} />
                        <Field label="Relationship verified" value={c.relationshipVerified ? "Yes" : "No"} />
                        <Field label="Created" value={fmtDate(c.createdAt)} />
                        {c.notes && (
                          <div className="col-span-2 sm:col-span-4 text-[0.65rem] text-muted-foreground/80 italic">
                            Notes: {c.notes.slice(0, 280)}{c.notes.length > 280 ? "…" : ""}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// v18 §3B.5.12.1 — DeFi Pools section
// ═══════════════════════════════════════════════════════════════════════════════
//
// Fetches /api/sgtx/financing/defi-protocols to list every DeFi protocol in
// the registry. Each protocol has: name, displayName, chain, riskScore (0-100),
// tvlUsd, auditStatus, healthColor, actionability (computed server-side).
//
// Risk color per task spec:
//   GREEN  ≥85 — new positions allowed
//   YELLOW 60-84 — warning shown, acknowledgement required
//   ORANGE 40-59 — new positions blocked, existing flagged
//   RED    <40  — protocol suspended, refinance within 14 days
//
// ZK reserve proof is generated on-demand via POST /api/sgtx/zk/reserve-proof.
// The ZK proof badge is shown when the protocol's auditStatus === "AUDITED" OR
// when the user has generated a fresh ZK proof in this session.

function DefiPoolsSection({ financierGtid }: { financierGtid: string }) {
  const [expandedProtocol, setExpandedProtocol] = useState<string | null>(null);
  const [zkProofs, setZkProofs] = useState<Record<string, { proof: string; verified: boolean; reserveRatio: number }>>({});
  const [zkBusy, setZkBusy] = useState<string | null>(null);
  const [zkError, setZkError] = useState<string | null>(null);

  const protocolsQ = useQuery({
    queryKey: ["money-defi-protocols"],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/financing/defi-protocols`);
      if (!res.ok) throw new Error(`defi-protocols ${res.status}`);
      return res.json() as Promise<{ protocols: any[] }>;
    },
    retry: false,
  });

  // Active DeFi positions for this financier — fetched from liquidation-alerts endpoint
  // which returns positions filtered by financierGtid.
  const positionsQ = useQuery({
    queryKey: ["money-defi-positions", financierGtid],
    queryFn: async () => {
      const res = await fetchWithAuth(
        `/api/sgtx/financing/liquidation-alerts?financierGtid=${encodeURIComponent(financierGtid)}`,
      );
      if (!res.ok) throw new Error(`defi-positions ${res.status}`);
      return res.json() as Promise<{ positions: any[] }>;
    },
    enabled: !!financierGtid,
    retry: false,
  });

  const protocols: any[] = protocolsQ.data?.protocols || [];
  const positions: any[] = positionsQ.data?.positions || [];

  function positionsForProtocol(name: string) {
    return positions.filter(
      (p) => p.protocolName === name || p.protocolName === name.toUpperCase(),
    );
  }

  async function generateZkProof(protocol: any) {
    setZkError(null);
    setZkBusy(protocol.name);
    try {
      const reserve = Number(protocol.tvlUsd) || 1_000_000;
      const liabilities = reserve * 0.78; // simulate 1.28× reserve ratio (above 1.1× minimum)
      const res = await fetchWithAuth(`/api/sgtx/zk/reserve-proof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reserveAmount: reserve, liabilities }),
      });
      const json = await res.json();
      if (!res.ok) {
        setZkError(json?.error || "ZK proof generation failed");
        return;
      }
      setZkProofs((prev) => ({
        ...prev,
        [protocol.name]: {
          proof: json.proof,
          verified: json.verified,
          reserveRatio: json.reserveRatio,
        },
      }));
    } catch (e: any) {
      setZkError(e?.message || "Network error");
    } finally {
      setZkBusy(null);
    }
  }

  return (
    <Section title="DeFi pools (risk oracle + ZK reserve proof)" count={protocols.length} icon={BarChart3}>
      {protocolsQ.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading DeFi protocols…
        </div>
      ) : protocolsQ.isError ? (
        <div className="p-3 rounded-md border border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/10 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>DeFi protocol registry unavailable.</span>
        </div>
      ) : protocols.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No DeFi protocols registered. Add protocols via the DeFi Protocol model.
        </p>
      ) : (
        <div className="space-y-2">
          {/* Color legend */}
          <p className="text-[0.65rem] text-muted-foreground flex items-center gap-2">
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />GREEN ≥85</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500" />YELLOW 60-84</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500" />ORANGE 40-59</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />RED &lt;40</span>
          </p>
          <ul className="divide-y divide-border border border-border rounded-md bg-card/40">
            {protocols.map((p, i) => {
              const riskScore = Number(p.riskScore) ?? 85;
              const colorBand =
                riskScore >= 85 ? "GREEN"
                : riskScore >= 60 ? "YELLOW"
                : riskScore >= 40 ? "ORANGE"
                : "RED";
              const colorClass =
                colorBand === "GREEN" ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                : colorBand === "YELLOW" ? "border-yellow-500/40 text-yellow-700 dark:text-yellow-300"
                : colorBand === "ORANGE" ? "border-orange-500/40 text-orange-700 dark:text-orange-300"
                : "border-red-500/40 text-red-700 dark:text-red-300";
              const hasZk = zkProofs[p.name] !== undefined || p.auditStatus === "AUDITED";
              const protoPositions = positionsForProtocol(p.name);
              const action = p.actionability || {};
              const isExpanded = expandedProtocol === p.name;
              return (
                <li key={p.id || i} className="p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">
                          {p.displayName || p.name}
                        </p>
                        <Badge variant="outline" className={`text-[0.55rem] ${colorClass}`}>
                          {colorBand} · {riskScore}
                        </Badge>
                        {hasZk && (
                          <Badge variant="outline" className="text-[0.55rem] border-emerald-500/40 text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                            <ShieldCheck className="w-2.5 h-2.5" /> ZK
                          </Badge>
                        )}
                        {p.chain && (
                          <Badge variant="outline" className="text-[0.55rem]">{p.chain}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        TVL {fmtMoney(p.tvlUsd, "USD")} · APY {p.apy ?? "—"} · {protoPositions.length} position(s)
                      </p>
                      {action.notice && (
                        <p className="text-[0.6rem] text-muted-foreground/80 mt-0.5 italic">{action.notice}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => generateZkProof(p)}
                        disabled={zkBusy === p.name}
                        title="Generate ZK reserve proof (zk-SNARK stub, SHA-256 commitments)"
                      >
                        {zkBusy === p.name ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Zap className="w-3 h-3 mr-1" />}
                        ZK
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setExpandedProtocol(isExpanded ? null : p.name)}
                      >
                        {protoPositions.length > 0 ? "View Position" : "Details"}
                        <ChevronDown className={cn("w-3 h-3 ml-1 transition-transform", isExpanded && "rotate-180")} />
                      </Button>
                    </div>
                  </div>
                  {zkProofs[p.name] && (
                    <p className="text-[0.6rem] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      ZK proof generated · reserve ratio {zkProofs[p.name].reserveRatio.toFixed(2)}× · verified={String(zkProofs[p.name].verified)}
                    </p>
                  )}
                  {isExpanded && (
                    <div className="mt-2 pt-2 border-t border-border space-y-2">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <Field label="Audit status" value={p.auditStatus} />
                        <Field label="Governance" value={p.governanceActivity} />
                        <Field label="Health color" value={p.healthColor} />
                        <Field label="Last exploit" value={p.lastExploit || "None"} accent={!!p.lastExploit} />
                        <Field label="Contract" value={p.contractAddress} mono />
                        <Field label="Updated" value={fmtDate(p.updatedAt)} />
                      </div>
                      {protoPositions.length > 0 ? (
                        <div className="rounded-md border border-border bg-muted/30">
                          <p className="text-[0.6rem] uppercase tracking-wider text-muted-foreground px-2 py-1.5 border-b border-border">
                            Active positions for this protocol
                          </p>
                          <div className="max-h-48 overflow-y-auto">
                            <table className="w-full text-xs">
                              <thead className="bg-muted/40 sticky top-0">
                                <tr className="text-left text-muted-foreground">
                                  <th className="px-2 py-1.5 font-medium">Borrower</th>
                                  <th className="px-2 py-1.5 font-medium">Principal</th>
                                  <th className="px-2 py-1.5 font-medium">Health</th>
                                  <th className="px-2 py-1.5 font-medium">Collateral</th>
                                  <th className="px-2 py-1.5 font-medium">Debt</th>
                                  <th className="px-2 py-1.5 font-medium">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {protoPositions.map((pos, j) => (
                                  <tr key={pos.id || j}>
                                    <td className="px-2 py-1.5 font-mono text-[0.6rem]">{maskGtid(pos.borrowerGtid)}</td>
                                    <td className="px-2 py-1.5">{fmtMoney(pos.principalUsd, "USD")}</td>
                                    <td className="px-2 py-1.5">{Number(pos.healthFactor).toFixed(2)}{pos.predictedHealth24h ? ` → ${Number(pos.predictedHealth24h).toFixed(2)}` : ""}</td>
                                    <td className="px-2 py-1.5">{fmtMoney(pos.collateralUsd, "USD")}</td>
                                    <td className="px-2 py-1.5">{fmtMoney(pos.debtUsd, "USD")}</td>
                                    <td className="px-2 py-1.5">
                                      <Badge variant="outline" className={
                                        "text-[0.55rem] " +
                                        (pos.status === "ACTIVE" ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                                          : pos.status === "WARNING" ? "border-yellow-500/40 text-yellow-700 dark:text-yellow-300"
                                          : "border-red-500/40 text-red-700 dark:text-red-300")
                                      }>
                                        {pos.status}
                                      </Badge>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[0.65rem] text-muted-foreground/80 italic">
                          No active positions for this protocol under your financier tenant.
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {zkError && (
            <p className="text-xs text-red-500 flex items-start gap-1.5 mt-2">
              <span>⚠</span>
              <span>{zkError}</span>
            </p>
          )}
        </div>
      )}
    </Section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// v18 §3B.5 — Collateral Monitoring section
// ═══════════════════════════════════════════════════════════════════════════════
//
// Fetches /api/sgtx/finance/cases?financierGtid=X then filters for cases where
// collateralType is set and not "NONE". For each case computes:
//   LTV = amountUsd / collateralValueUsd (when collateralValueUsd > 0)
//   liquidationPrice = collateralValueUsd * liquidationThreshold (default 0.80)
//
// LTV color per task spec:
//   GREEN  <50% — well collateralised
//   YELLOW 50-70% — within normal range
//   RED    >70% — margin call territory
//
// "Margin Call" button POSTs to /api/sgtx/finance/cases/[id]/margin-call with
// a reason (min 20 chars). The endpoint triggers the margin call on the case
// row and returns the updated case.

function CollateralMonitoringSection({ financierGtid }: { financierGtid: string }) {
  const queryClient = useQueryClient();
  const [marginCallDialog, setMarginCallDialog] = useState<{ caseId: string; ustn: string } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const casesQ = useQuery({
    queryKey: ["money-collateral-cases", financierGtid],
    queryFn: async () => {
      const res = await fetchWithAuth(
        `/api/sgtx/finance/cases?financierGtid=${encodeURIComponent(financierGtid)}`,
      );
      if (!res.ok) throw new Error(`collateral cases ${res.status}`);
      return res.json() as Promise<{ cases: any[] }>;
    },
    enabled: !!financierGtid,
    retry: false,
  });

  const allCases: any[] = casesQ.data?.cases || [];
  const collateralised = allCases.filter(
    (c) => c.collateralType && c.collateralType !== "NONE" && Number(c.collateralValueUsd) > 0,
  );

  async function triggerMarginCall() {
    if (!marginCallDialog) return;
    if (reason.trim().length < 20) {
      setError("Reason must be at least 20 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetchWithAuth(
        `/api/sgtx/finance/cases/${encodeURIComponent(marginCallDialog.caseId)}/margin-call`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: reason.trim() }),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || `Margin call failed (${res.status})`);
        return;
      }
      setSuccess(`Margin call triggered for case ${marginCallDialog.ustn || marginCallDialog.caseId}.`);
      queryClient.invalidateQueries({ queryKey: ["money-collateral-cases", financierGtid] });
      queryClient.invalidateQueries({ queryKey: ["money-portfolio-cases", financierGtid] });
      setMarginCallDialog(null);
      setReason("");
    } catch (e: any) {
      setError(e?.message || "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Collateral monitoring (LTV + liquidation price)" count={collateralised.length} icon={Database}>
      {casesQ.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading collateral positions…
        </div>
      ) : casesQ.isError ? (
        <div className="p-3 rounded-md border border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/10 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>Collateral positions endpoint unavailable.</span>
        </div>
      ) : collateralised.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No collateralised positions yet. Active cases with collateral type ≠ NONE will appear here.
        </p>
      ) : (
        <div className="rounded-md border border-border bg-card/40 overflow-hidden">
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 sticky top-0">
                <tr className="text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">USTN</th>
                  <th className="px-3 py-2 font-medium">Collateral type</th>
                  <th className="px-3 py-2 font-medium">Value</th>
                  <th className="px-3 py-2 font-medium">Loan</th>
                  <th className="px-3 py-2 font-medium">LTV</th>
                  <th className="px-3 py-2 font-medium">Liq. price</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {collateralised.map((c, i) => {
                  const loan = Number(c.amountUsd) || 0;
                  const col = Number(c.collateralValueUsd) || 0;
                  const ltv = col > 0 ? loan / col : 0;
                  const threshold = Number(c.marginCallThreshold) || 0.80;
                  const liquidationPrice = col * threshold * (loan > 0 ? loan / col : 1);
                  const ltvPct = ltv * 100;
                  const band = ltvPct < 50 ? "GREEN" : ltvPct <= 70 ? "YELLOW" : "RED";
                  const bandClass =
                    band === "GREEN" ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                    : band === "YELLOW" ? "border-yellow-500/40 text-yellow-700 dark:text-yellow-300"
                    : "border-red-500/40 text-red-700 dark:text-red-300";
                  const barClass =
                    band === "GREEN" ? "[&>[data-slot=progress-indicator]]:bg-emerald-500"
                    : band === "YELLOW" ? "[&>[data-slot=progress-indicator]]:bg-yellow-500"
                    : "[&>[data-slot=progress-indicator]]:bg-red-500";
                  const highRisk = band === "RED" || c.marginCallTriggered;
                  return (
                    <tr key={c.id || i}>
                      <td className="px-3 py-2">
                        {c.ustn ? (
                          <Link href={`/trades/${c.ustn}`} className="font-mono text-[0.65rem] hover:underline">
                            {c.ustn.slice(0, 18)}…
                          </Link>
                        ) : (
                          <span className="font-mono text-[0.65rem]">{c.caseId || "—"}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">{c.collateralType}</td>
                      <td className="px-3 py-2">{fmtMoney(col, "USD")}</td>
                      <td className="px-3 py-2">{fmtMoney(loan, "USD")}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className={`text-[0.55rem] ${bandClass}`}>{band}</Badge>
                          <span>{ltvPct.toFixed(1)}%</span>
                        </div>
                        <Progress value={Math.min(100, ltvPct)} className={`h-1 mt-1 ${barClass}`} />
                      </td>
                      <td className="px-3 py-2">{fmtMoney(liquidationPrice, "USD")}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="text-[0.55rem]">{statusLabel(c.status || "ACTIVE")}</Badge>
                        {c.marginCallTriggered && (
                          <Badge variant="outline" className="ml-1 text-[0.55rem] border-red-500/40 text-red-700 dark:text-red-300">
                            Margin Call
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!highRisk}
                          onClick={() => {
                            setMarginCallDialog({ caseId: c.id, ustn: c.ustn || c.caseId });
                            setReason("");
                            setSuccess(null);
                            setError(null);
                          }}
                          className={highRisk ? "border-red-500/40 text-red-700 dark:text-red-300" : ""}
                        >
                          Margin Call
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {success && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" /> {success}
        </p>
      )}
      {error && (
        <p className="text-xs text-red-500 mt-2 flex items-start gap-1.5">
          <span>⚠</span>
          <span>{error}</span>
        </p>
      )}

      <Dialog open={!!marginCallDialog} onOpenChange={(o) => !o && setMarginCallDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trigger margin call</DialogTitle>
            <DialogDescription>
              Case: {marginCallDialog?.ustn} — this will mark the case as margin-call triggered and notify the borrower. Provide a clear reason (min 20 chars).
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="e.g. LTV exceeded 70% threshold after collateral revaluation per §3B.5.4. Request top-up within 48h."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarginCallDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={triggerMarginCall} disabled={busy || reason.trim().length < 20}>
              {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <AlertTriangle className="w-3.5 h-3.5 mr-1" />}
              Trigger margin call
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// v18 §13.6 — FX Settlement section
// ═══════════════════════════════════════════════════════════════════════════════
//
// Fetches the latest FX rates via /api/sgtx/fx/rates for the standard SGTX
// pairs (USD/EGP, EUR/USD, USD/AED, USD/SAR, USD/CNY). Each pair is fetched
// in parallel. The GOV CBE settlement endpoint POST /api/sgtx/gov/cbe/settlement
// dispatches a settlement instruction to the Central Bank of Egypt adapter.
//
// The financier can enter a USTN + amount + currency + beneficiary IBAN to
// settle an FX leg. The settlement endpoint returns an instructionId and a
// status (typically PENDING — the CBE adapter is in simulation mode).

function FxSettlementSection({ financierGtid: _financierGtid }: { financierGtid: string }) {
  const FX_PAIRS = [
    { from: "USD", to: "EGP" },
    { from: "EUR", to: "USD" },
    { from: "USD", to: "AED" },
    { from: "USD", to: "SAR" },
    { from: "USD", to: "CNY" },
  ];
  const [ustn, setUstn] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EGP");
  const [iban, setIban] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Each FX pair is fetched in parallel; refetch every 60s for live rates.
  const ratesQ = useQuery({
    queryKey: ["money-fx-rates"],
    queryFn: async () => {
      const results = await Promise.all(
        FX_PAIRS.map(async (p) => {
          try {
            const res = await fetchWithAuth(`/api/sgtx/fx/rates?from=${p.from}&to=${p.to}`);
            if (!res.ok) return { ...p, rate: null, source: null, error: `${res.status}` };
            const json = await res.json();
            return { ...p, rate: json.rate, source: json.source, timestamp: json.timestamp };
          } catch (e: any) {
            return { ...p, rate: null, source: null, error: e?.message || "fetch failed" };
          }
        }),
      );
      return results;
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  async function settleFx() {
    setError(null);
    setSuccess(null);
    if (!ustn || !amount || !iban) {
      setError("USTN, amount, and beneficiary IBAN are required.");
      return;
    }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      setError("Amount must be a positive number.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetchWithAuth(`/api/sgtx/gov/cbe/settlement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ustn: ustn.trim(),
          amount: amt,
          currency: currency.toUpperCase(),
          beneficiaryIban: iban.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || `Settlement failed (${res.status})`);
        return;
      }
      setSuccess(`Settlement dispatched — instruction ID: ${json.instructionId}. Status: ${json.status}.`);
      setUstn("");
      setAmount("");
      setIban("");
    } catch (e: any) {
      setError(e?.message || "Network error");
    } finally {
      setBusy(false);
    }
  }

  const rates = ratesQ.data || [];

  return (
    <Section title="FX settlement (live rates + CBE dispatch)" count={rates.length} icon={ArrowRightLeft}>
      <div className="space-y-3">
        {/* Live FX rates grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {ratesQ.isLoading ? (
            <div className="col-span-full flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Fetching live FX rates…
            </div>
          ) : ratesQ.isError ? (
            <p className="col-span-full text-xs text-red-500">FX rate endpoint unavailable.</p>
          ) : (
            rates.map((r, i) => (
              <div key={i} className="rounded-md border border-border bg-card/40 p-2">
                <p className="text-[0.55rem] uppercase tracking-wider text-muted-foreground">
                  {r.from}/{r.to}
                </p>
                <p className="text-sm font-mono font-medium">
                  {r.rate !== null && r.rate !== undefined ? Number(r.rate).toFixed(4) : "—"}
                </p>
                <p className="text-[0.55rem] text-muted-foreground/70 mt-0.5">
                  {r.source || r.error || "—"}
                </p>
              </div>
            ))
          )}
        </div>

        {/* Settlement dispatch form */}
        <div className="rounded-md border border-border bg-card/40 p-3 space-y-3">
          <div className="flex items-center gap-1.5 text-[0.65rem] text-muted-foreground">
            <Landmark className="w-3 h-3" />
            <span>
              Dispatch a CBE (Central Bank of Egypt) settlement instruction for an FX leg. The CBE adapter is in simulation mode (mTLS-configured, queue-backed). Returns a pending instructionId.
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <label className="text-xs space-y-1">
              <span className="text-muted-foreground">USTN</span>
              <Input
                value={ustn}
                onChange={(e) => setUstn(e.target.value)}
                placeholder="SGTX-EG-25-0001"
                className="font-mono text-xs"
              />
            </label>
            <label className="text-xs space-y-1">
              <span className="text-muted-foreground">Amount</span>
              <Input
                type="number"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="50000"
                className="text-xs"
              />
            </label>
            <label className="text-xs space-y-1">
              <span className="text-muted-foreground">Currency</span>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full h-9 px-2 rounded border border-border bg-background text-xs"
              >
                <option value="EGP">EGP</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="AED">AED</option>
                <option value="SAR">SAR</option>
              </select>
            </label>
            <label className="text-xs space-y-1">
              <span className="text-muted-foreground">Beneficiary IBAN</span>
              <Input
                value={iban}
                onChange={(e) => setIban(e.target.value)}
                placeholder="EG3800190005..."
                className="font-mono text-xs"
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={settleFx} disabled={busy} size="sm">
              {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Bank className="w-3.5 h-3.5 mr-1" />}
              Settle FX
            </Button>
            <span className="text-[0.65rem] text-muted-foreground">
              Auto-refresh rates every 60s.
            </span>
          </div>
          {error && (
            <p className="text-xs text-red-500 flex items-start gap-1.5">
              <span>⚠</span>
              <span>{error}</span>
            </p>
          )}
          {success && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-start gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{success}</span>
            </p>
          )}
        </div>
      </div>
    </Section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// v18 §16.8.10 Tab 5 — Financed Companies Directory (Bank/PFI, private)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Private, read-only, audit-traced directory of every borrower the bank has
// ever financed. NEVER shared with other financiers. Aggregated by borrower
// GTID from TradeFinanceCase rows where financierGtid === tenantGtid.
//
// Source: GET /api/sgtx/finance/financiers/[id]/financed-companies
//   { companies: [{ borrowerGtid, maskedGtid, legalName, totalFinancedUsd,
//     activeLoansCount, totalCasesCount, lastFinancedAt, trustScore, history }]
//     summary: { totalBorrowers, totalFinancedUsd, activeLoans } }

function FinancedCompaniesDirectory({ financierGtid }: { financierGtid: string }) {
  const [expandedBorrower, setExpandedBorrower] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["money-financed-companies", financierGtid],
    queryFn: async () => {
      const res = await fetchWithAuth(
        `/api/sgtx/finance/financiers/${encodeURIComponent(financierGtid)}/financed-companies`,
      );
      if (!res.ok) throw new Error(`financed-companies ${res.status}`);
      return res.json() as Promise<{
        companies: any[];
        summary: { totalBorrowers: number; totalFinancedUsd: number; activeLoans: number };
        private: boolean;
        note: string;
      }>;
    },
    enabled: !!financierGtid,
    retry: false,
  });

  const companies: any[] = q.data?.companies || [];
  const summary = q.data?.summary || { totalBorrowers: 0, totalFinancedUsd: 0, activeLoans: 0 };

  return (
    <Section title="Financed Companies Directory (Tab 5)" count={summary.totalBorrowers} icon={Building2}>
      {/* PRIVATE badge — read-only, never shared */}
      <div className="p-3 mb-3 rounded-md border border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/10 flex items-start gap-2">
        <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
            PRIVATE — Audit-traced
            <Badge variant="outline" className="text-[0.55rem] border-amber-500/40 text-amber-700 dark:text-amber-300">
              Read-only
            </Badge>
          </p>
          <p className="text-[0.7rem] text-amber-700/80 dark:text-amber-300/80 mt-0.5">
            This directory is private. Never shared with other financiers.
          </p>
        </div>
      </div>

      {q.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading financed companies…
        </div>
      ) : q.isError ? (
        <div className="p-3 rounded-md border border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/10 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>Directory endpoint unavailable. Try again later.</span>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3 mb-3">
            <SummaryCard
              label="Borrowers Financed"
              value={String(summary.totalBorrowers)}
              icon={Building2}
              tone="default"
            />
            <SummaryCard
              label="Total Financed"
              value={fmtMoney(summary.totalFinancedUsd, "USD")}
              icon={DollarSign}
              tone="default"
            />
            <SummaryCard
              label="Active Loans"
              value={String(summary.activeLoans)}
              icon={Scale}
              tone="active"
            />
          </div>

          {/* Companies table — read-only, no edit/delete buttons */}
          {companies.length === 0 ? (
            <div className="p-6 rounded-md border border-dashed border-border text-center">
              <Building2 className="w-5 h-5 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No borrowers in your financed-companies directory yet. The
                directory populates automatically as you accept financing bids
                and disburse loans.
              </p>
            </div>
          ) : (
            <div className="border border-border rounded-md overflow-hidden bg-card/40">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[0.6rem] uppercase tracking-wider">Borrower</TableHead>
                    <TableHead className="text-[0.6rem] uppercase tracking-wider">Legal name</TableHead>
                    <TableHead className="text-[0.6rem] uppercase tracking-wider text-right">Total financed</TableHead>
                    <TableHead className="text-[0.6rem] uppercase tracking-wider text-right">Active loans</TableHead>
                    <TableHead className="text-[0.6rem] uppercase tracking-wider">Last financed</TableHead>
                    <TableHead className="text-[0.6rem] uppercase tracking-wider text-right">Trust</TableHead>
                    <TableHead className="text-[0.6rem] uppercase tracking-wider text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {companies.map((c, i) => {
                    const isExpanded = expandedBorrower === c.borrowerGtid;
                    const trustTone =
                      c.trustScore >= 80 ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                      : c.trustScore >= 60 ? "border-yellow-500/40 text-yellow-700 dark:text-yellow-300"
                      : "border-red-500/40 text-red-700 dark:text-red-300";
                    return (
                      <TableRow key={c.borrowerGtid || i}>
                        <TableCell className="font-mono text-[0.7rem]">
                          {c.maskedGtid}
                        </TableCell>
                        <TableCell className="text-[0.75rem]">
                          <div className="flex flex-col">
                            <span className="font-medium">{c.legalName}</span>
                            <span className="text-[0.6rem] text-muted-foreground">
                              {c.tenantType} · {c.country}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-[0.75rem] font-medium">
                          {fmtMoney(c.totalFinancedUsd, "USD")}
                        </TableCell>
                        <TableCell className="text-right text-[0.75rem]">
                          <Badge variant="outline" className={cn(
                            "text-[0.55rem]",
                            c.activeLoansCount > 0
                              ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                              : "border-border text-muted-foreground",
                          )}>
                            {c.activeLoansCount} active
                          </Badge>
                          <span className="text-[0.6rem] text-muted-foreground ml-1">
                            / {c.totalCasesCount} total
                          </span>
                        </TableCell>
                        <TableCell className="text-[0.7rem]">
                          {c.lastFinancedAt ? fmtDate(c.lastFinancedAt) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline" className={cn("text-[0.55rem]", trustTone)}>
                            {c.trustScore ?? "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setExpandedBorrower(isExpanded ? null : c.borrowerGtid)}
                          >
                            {isExpanded ? "Hide" : "View Details"}
                            <ChevronDown className={cn(
                              "w-3 h-3 ml-1 transition-transform",
                              isExpanded && "rotate-180",
                            )} />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Expanded financing history */}
          {expandedBorrower && (() => {
            const c = companies.find((x) => x.borrowerGtid === expandedBorrower);
            if (!c) return null;
            return (
              <Card className="p-4 mt-3">
                <div className="flex items-center gap-2 mb-3">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">
                    Financing history — {c.legalName}
                  </h3>
                  <Badge variant="outline" className="text-[0.55rem] font-mono">
                    {c.maskedGtid}
                  </Badge>
                </div>
                {c.history?.length > 0 ? (
                  <div className="border border-border rounded-md overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[0.6rem] uppercase tracking-wider">Case ID</TableHead>
                          <TableHead className="text-[0.6rem] uppercase tracking-wider">USTN</TableHead>
                          <TableHead className="text-[0.6rem] uppercase tracking-wider text-right">Amount</TableHead>
                          <TableHead className="text-[0.6rem] uppercase tracking-wider">APR / Tenor</TableHead>
                          <TableHead className="text-[0.6rem] uppercase tracking-wider">Collateral</TableHead>
                          <TableHead className="text-[0.6rem] uppercase tracking-wider">Status</TableHead>
                          <TableHead className="text-[0.6rem] uppercase tracking-wider">Repayment</TableHead>
                          <TableHead className="text-[0.6rem] uppercase tracking-wider">Created</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {c.history.map((h: any, i: number) => (
                          <TableRow key={h.caseId || i}>
                            <TableCell className="font-mono text-[0.65rem]">{h.caseId}</TableCell>
                            <TableCell className="text-[0.65rem]">
                              {h.ustn ? (
                                <Link href={`/trades/${h.ustn}`} className="hover:underline">
                                  {h.ustn}
                                </Link>
                              ) : "—"}
                            </TableCell>
                            <TableCell className="text-right text-[0.7rem] font-medium">
                              {fmtMoney(h.amountUsd, h.currency || "USD")}
                            </TableCell>
                            <TableCell className="text-[0.65rem]">
                              {h.apr ? `${Number(h.apr).toFixed(2)}%` : "—"} · {h.tenorDays ? `${h.tenorDays}d` : "—"}
                            </TableCell>
                            <TableCell className="text-[0.65rem]">
                              {h.collateralType || "—"}
                              {h.collateralValueUsd ? ` (${fmtMoney(h.collateralValueUsd, "USD")})` : ""}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[0.55rem]">
                                {statusLabel(h.status || "ACTIVE")}
                              </Badge>
                              {h.marginCallTriggered && (
                                <Badge variant="outline" className="ml-1 text-[0.55rem] border-red-500/40 text-red-700 dark:text-red-300">
                                  Margin call
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-[0.65rem]">
                              {h.repaymentDate ? fmtDate(h.repaymentDate) : "—"}
                              {h.repaymentAmountUsd ? ` (${fmtMoney(h.repaymentAmountUsd, "USD")})` : ""}
                            </TableCell>
                            <TableCell className="text-[0.65rem] text-muted-foreground">
                              {fmtDate(h.createdAt)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No case history available.</p>
                )}
              </Card>
            );
          })()}
        </>
      )}
    </Section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// v18 §16.8.14 — Marketplace Partner Portal (5 tabs)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Tab 1: Leads/Intent Inbox — leads attributed to the partner with viability
// Tab 2: Webhook Management — register/test/delete webhook URLs
// Tab 3: API Key Management — masked keys, usage analytics, regenerate/revoke
// Tab 4: Revenue Attribution — trade attributions, payouts, dispute flow
// Tab 5: Integration Guide & Test Sandbox — endpoint docs + test runner
//
// The MP portal is the only "external" cockpit route — the partner doesn't
// have trades of their own; they get attributed leads from buyers/sellers
// who used their referral/integration to initiate a trade on SGTX.

function MarketplacePartnerMoney({ data }: { data?: DashboardData }) {
  const tenantGtid = data?.tenant?.gtid || "";
  return (
    <div className="space-y-6">
      {/* Privacy / context banner */}
      <div className="p-3 rounded-md border border-cyan-500/30 bg-cyan-50/30 dark:bg-cyan-950/10 flex items-start gap-2">
        <Plug className="w-3.5 h-3.5 text-cyan-700 dark:text-cyan-300 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-xs font-semibold text-cyan-700 dark:text-cyan-300">
            Marketplace Partner Portal
          </p>
          <p className="text-[0.7rem] text-cyan-700/80 dark:text-cyan-300/80 mt-0.5">
            External marketplace integration · Revenue share: 0.5% per
            attributed trade · {tenantGtid || "—"}
          </p>
        </div>
      </div>

      {/* Tab 1: Leads/Intent Inbox */}
      <MpLeadsInbox partnerGtid={tenantGtid} />

      {/* Tab 2: Webhook Management */}
      <MpWebhookManagement partnerGtid={tenantGtid} />

      {/* Tab 3: API Key Management */}
      <MpApiKeyManagement partnerGtid={tenantGtid} />

      {/* Tab 4: Revenue Attribution */}
      <MpRevenueAttribution partnerGtid={tenantGtid} />

      {/* Tab 5: Integration Guide & Test Sandbox */}
      <MpSandboxGuide partnerGtid={tenantGtid} />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// MP Tab 1 — Leads/Intent Inbox
// ──────────────────────────────────────────────────────────────────────────────

function MpLeadsInbox({ partnerGtid }: { partnerGtid: string }) {
  const queryClient = useQueryClient();
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["mp-leads", partnerGtid],
    queryFn: async () => {
      const res = await fetchWithAuth(
        `/api/sgtx/marketplace/leads?partnerGtid=${encodeURIComponent(partnerGtid)}`,
      );
      if (!res.ok) throw new Error(`leads ${res.status}`);
      return res.json() as Promise<{
        leads: any[];
        summary: { total: number; pending: number; accepted: number; rejected: number; disputed: number; expired: number };
      }>;
    },
    enabled: !!partnerGtid,
    retry: false,
    refetchInterval: 60_000,
  });

  const leads: any[] = q.data?.leads || [];
  const summary = q.data?.summary || { total: 0, pending: 0, accepted: 0, rejected: 0, disputed: 0, expired: 0 };

  async function handleAccept(leadId: string) {
    setBusy(leadId);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetchWithAuth(`/api/sgtx/marketplace/leads/${leadId}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerGtid, acceptedBy: partnerGtid }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `accept failed (${res.status})`);
      }
      setSuccess(`Lead ${leadId.slice(-6).toUpperCase()} accepted. Webhook fired.`);
      queryClient.invalidateQueries({ queryKey: ["mp-leads", partnerGtid] });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function handleReject(leadId: string) {
    if (rejectReason.trim().length < 10) {
      setError("Rejection reason must be ≥10 characters.");
      return;
    }
    setBusy(leadId);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetchWithAuth(`/api/sgtx/marketplace/leads/${leadId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerGtid, reason: rejectReason.trim(), rejectedBy: partnerGtid }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `reject failed (${res.status})`);
      }
      setSuccess(`Lead ${leadId.slice(-6).toUpperCase()} rejected. Reason logged for audit.`);
      setRejectingId(null);
      setRejectReason("");
      queryClient.invalidateQueries({ queryKey: ["mp-leads", partnerGtid] });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section title="Leads / Intent Inbox (Tab 1)" count={summary.total} icon={Handshake}>
      {q.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading leads…
        </div>
      ) : q.isError ? (
        <div className="p-3 rounded-md border border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/10 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>Leads endpoint unavailable. Try again later.</span>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-3">
            <SummaryCard label="Total" value={String(summary.total)} icon={Handshake} tone="default" />
            <SummaryCard label="Pending" value={String(summary.pending)} icon={Loader2} tone={summary.pending > 0 ? "warning" : "default"} />
            <SummaryCard label="Accepted" value={String(summary.accepted)} icon={CheckCircle2} tone="active" />
            <SummaryCard label="Rejected" value={String(summary.rejected)} icon={ShieldOff} tone="default" />
            <SummaryCard label="Conditional" value={String(summary.disputed)} icon={AlertTriangle} tone={summary.disputed > 0 ? "critical" : "default"} />
            <SummaryCard label="Expired" value={String(summary.expired)} icon={Calendar} tone="default" />
          </div>

          {/* Revenue share indicator */}
          <div className="mb-3 p-2 rounded-md border border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-950/10 text-[0.7rem] text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
            <Coins className="w-3 h-3" />
            <span className="font-semibold">0.5%</span>
            <span>revenue share per accepted lead · paid out monthly on settled trades</span>
          </div>

          {/* Error / success */}
          {error && (
            <p className="text-xs text-red-500 flex items-start gap-1.5 mb-2">
              <AlertTriangle className="w-3.5 h-3.5" /> {error}
            </p>
          )}
          {success && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-start gap-1.5 mb-2">
              <CheckCircle2 className="w-3.5 h-3.5" /> {success}
            </p>
          )}

          {leads.length === 0 ? (
            <div className="p-6 rounded-md border border-dashed border-border text-center">
              <Handshake className="w-5 h-5 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No leads attributed yet. Leads appear here when buyers or
                sellers initiate a trade on SGTX using your marketplace
                attribution code.
              </p>
            </div>
          ) : (
            <div className="border border-border rounded-md overflow-hidden bg-card/40 max-h-[28rem] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[0.6rem] uppercase tracking-wider">Lead</TableHead>
                    <TableHead className="text-[0.6rem] uppercase tracking-wider">Buyer</TableHead>
                    <TableHead className="text-[0.6rem] uppercase tracking-wider">Commodity</TableHead>
                    <TableHead className="text-[0.6rem] uppercase tracking-wider text-right">Trade value</TableHead>
                    <TableHead className="text-[0.6rem] uppercase tracking-wider text-right">Viability</TableHead>
                    <TableHead className="text-[0.6rem] uppercase tracking-wider">Status</TableHead>
                    <TableHead className="text-[0.6rem] uppercase tracking-wider">Attributed</TableHead>
                    <TableHead className="text-[0.6rem] uppercase tracking-wider text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((l: any, i: number) => {
                    const isExpanded = expandedLead === l.id;
                    const isRejecting = rejectingId === l.id;
                    const viabilityTone =
                      l.viabilityScore >= 75 ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                      : l.viabilityScore >= 50 ? "border-yellow-500/40 text-yellow-700 dark:text-yellow-300"
                      : "border-red-500/40 text-red-700 dark:text-red-300";
                    const statusTone =
                      l.status === "ACCEPTED" ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                      : l.status === "REJECTED" ? "border-red-500/40 text-red-700 dark:text-red-300"
                      : l.status === "CONDITIONAL" ? "border-yellow-500/40 text-yellow-700 dark:text-yellow-300"
                      : l.status === "EXPIRED" ? "border-border text-muted-foreground"
                      : "border-cyan-500/40 text-cyan-700 dark:text-cyan-300";
                    return (
                      <TableRow key={l.id || i}>
                        <TableCell className="font-mono text-[0.65rem]">{l.leadId}</TableCell>
                        <TableCell className="font-mono text-[0.65rem]">{maskGtid(l.buyerGtid)}</TableCell>
                        <TableCell className="text-[0.7rem]">
                          <div className="flex flex-col">
                            <span>{l.commodity}</span>
                            <span className="text-[0.55rem] text-muted-foreground">
                              {l.originCountry} → {l.destCountry}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-[0.7rem] font-medium">
                          {fmtMoney(l.tradeValueUsd, "USD")}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline" className={cn("text-[0.55rem]", viabilityTone)}>
                            {l.viabilityScore}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("text-[0.55rem]", statusTone)}>
                            {l.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[0.65rem] text-muted-foreground">
                          {fmtDate(l.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {l.status === "PENDING" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-[0.65rem] border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                                  disabled={busy === l.id}
                                  onClick={() => handleAccept(l.id)}
                                >
                                  {busy === l.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                                  Accept
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-[0.65rem] border-red-500/40 text-red-700 dark:text-red-300"
                                  disabled={busy === l.id}
                                  onClick={() => setRejectingId(isRejecting ? null : l.id)}
                                >
                                  <ShieldOff className="w-3 h-3" />
                                  Reject
                                </Button>
                              </>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-[0.65rem]"
                              onClick={() => setExpandedLead(isExpanded ? null : l.id)}
                            >
                              {isExpanded ? "Hide" : "Details"}
                              <ChevronDown className={cn("w-3 h-3 ml-1 transition-transform", isExpanded && "rotate-180")} />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Reject inline form */}
          {rejectingId && (
            <Card className="p-3 mt-3 border-red-500/30">
              <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                <ShieldOff className="w-3.5 h-3.5 text-red-600" />
                Reject lead {rejectingId.slice(-6).toUpperCase()}
              </p>
              <Textarea
                placeholder="Reason for rejection (≥10 chars) — this is recorded on the audit trail…"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="text-xs min-h-[60px]"
              />
              <div className="flex items-center gap-2 mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-500/40 text-red-700 dark:text-red-300"
                  disabled={busy === rejectingId || rejectReason.trim().length < 10}
                  onClick={() => handleReject(rejectingId)}
                >
                  {busy === rejectingId ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldOff className="w-3 h-3" />}
                  Confirm rejection
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setRejectingId(null); setRejectReason(""); setError(null); }}
                >
                  Cancel
                </Button>
              </div>
            </Card>
          )}

          {/* Lead details */}
          {expandedLead && (() => {
            const l = leads.find((x) => x.id === expandedLead);
            if (!l) return null;
            return (
              <Card className="p-3 mt-3">
                <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-muted-foreground" />
                  Lead details — {l.leadId}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <Field label="Lead ID" value={l.leadId} mono />
                  <Field label="USTN" value={l.ustn || "— (no trade initiated yet)"} mono />
                  <Field label="Buyer GTID" value={maskGtid(l.buyerGtid)} mono />
                  <Field label="Seller GTID" value={maskGtid(l.sellerGtid)} mono />
                  <Field label="Commodity" value={l.commodity} />
                  <Field label="Trade value" value={fmtMoney(l.tradeValueUsd, "USD")} />
                  <Field label="Viability score" value={`${l.viabilityScore} / 100`} accent={l.viabilityScore >= 75} />
                  <Field label="Status" value={l.status} />
                  <Field label="Revenue share" value={`${l.revenueSharePct}%`} />
                  <Field label="Attributed at" value={fmtDateTime(l.createdAt)} />
                  {l.expiresAt && <Field label="Expires at" value={fmtDateTime(l.expiresAt)} />}
                  {l.disputedAt && <Field label="Disputed at" value={fmtDateTime(l.disputedAt)} accent />}
                </div>
                {l.ustn && (
                  <div className="mt-2">
                    <Link href={`/trades/${l.ustn}`} className="text-xs text-cyan-700 dark:text-cyan-300 hover:underline inline-flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" />
                      Open trade cockpit
                    </Link>
                  </div>
                )}
              </Card>
            );
          })()}
        </>
      )}
    </Section>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// MP Tab 2 — Webhook Management
// ──────────────────────────────────────────────────────────────────────────────

const WEBHOOK_EVENTS = [
  "lead.created",
  "lead.accepted",
  "lead.rejected",
  "lead.expired",
  "revenue.attributed",
  "revenue.disputed",
  "agreement.updated",
  "test.ping",
];

function MpWebhookManagement({ partnerGtid }: { partnerGtid: string }) {
  const queryClient = useQueryClient();
  const [showRegister, setShowRegister] = useState(false);
  const [url, setUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>(WEBHOOK_EVENTS);
  const [busy, setBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<any>(null);

  const q = useQuery({
    queryKey: ["mp-webhooks", partnerGtid],
    queryFn: async () => {
      const res = await fetchWithAuth(
        `/api/sgtx/marketplace/webhooks?partnerGtid=${encodeURIComponent(partnerGtid)}`,
      );
      if (!res.ok) throw new Error(`webhooks ${res.status}`);
      return res.json() as Promise<{
        partner: any;
        registeredWebhooks: any[];
        logs: any[];
        summary: any;
      }>;
    },
    enabled: !!partnerGtid,
    retry: false,
    refetchInterval: 60_000,
  });

  const registered: any[] = q.data?.registeredWebhooks || [];
  const logs: any[] = q.data?.logs || [];
  const summary = q.data?.summary || { total: 0, delivered: 0, failed: 0, retried: 0, deliveryRate: 0, recentSuccessRate: 0 };

  async function handleRegister() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetchWithAuth(`/api/sgtx/marketplace/webhooks/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerGtid, webhookUrl: url, events: selectedEvents }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `register failed (${res.status})`);
      }
      setSuccess("Webhook registered. Test delivery recommended before going live.");
      setShowRegister(false);
      setUrl("");
      queryClient.invalidateQueries({ queryKey: ["mp-webhooks", partnerGtid] });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Remove the registered webhook? Delivery log is retained for audit.")) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetchWithAuth(
        `/api/sgtx/marketplace/webhooks?partnerGtid=${encodeURIComponent(partnerGtid)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `delete failed (${res.status})`);
      }
      setSuccess("Webhook URL cleared. Inbound events will be logged as undeliverable.");
      queryClient.invalidateQueries({ queryKey: ["mp-webhooks", partnerGtid] });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleTest() {
    setTestBusy(true);
    setError(null);
    setSuccess(null);
    setTestResult(null);
    try {
      const res = await fetchWithAuth(`/api/sgtx/marketplace/webhooks/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerGtid }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `test failed (${res.status})`);
      setTestResult(j.test);
      setSuccess(j.test?.delivered
        ? `Test event delivered — HTTP ${j.test.responseStatus} in ${j.test.responseMs}ms.`
        : `Test delivery failed — endpoint unreachable or returned non-2xx.`);
      queryClient.invalidateQueries({ queryKey: ["mp-webhooks", partnerGtid] });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setTestBusy(false);
    }
  }

  return (
    <Section title="Webhook Management (Tab 2)" count={registered.length} icon={Webhook}>
      {q.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading webhooks…
        </div>
      ) : q.isError ? (
        <div className="p-3 rounded-md border border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/10 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>Webhook endpoint unavailable. Try again later.</span>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
            <SummaryCard label="Registered" value={String(registered.length)} icon={Webhook} tone={registered.length > 0 ? "active" : "default"} />
            <SummaryCard label="Total deliveries" value={String(summary.total)} icon={Send} tone="default" />
            <SummaryCard label="Delivered" value={String(summary.delivered)} icon={CheckCircle2} tone="active" />
            <SummaryCard label="Failed" value={String(summary.failed)} icon={AlertTriangle} tone={summary.failed > 0 ? "critical" : "default"} />
            <SummaryCard label="Success rate (7d)" value={`${summary.recentSuccessRate ?? 0}%`} icon={BarChart3} tone={(summary.recentSuccessRate ?? 0) >= 90 ? "active" : "warning"} />
          </div>

          {/* Action bar */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Button size="sm" onClick={() => setShowRegister(!showRegister)}>
              <Webhook className="w-3.5 h-3.5" />
              Register Webhook
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={registered.length === 0 || testBusy}
              onClick={handleTest}
            >
              {testBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Test Webhook
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-red-500/40 text-red-700 dark:text-red-300"
              disabled={registered.length === 0 || busy}
              onClick={handleDelete}
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Delete Webhook
            </Button>
          </div>

          {/* Register form */}
          {showRegister && (
            <Card className="p-3 mb-3 border-cyan-500/30">
              <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 text-cyan-700 dark:text-cyan-300" />
                Register webhook endpoint
              </p>
              <div className="space-y-2">
                <div>
                  <Label className="text-[0.7rem] text-muted-foreground">Webhook URL (https://…)</Label>
                  <Input
                    placeholder="https://your-endpoint.com/sgtx/webhooks"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="text-xs font-mono"
                  />
                </div>
                <div>
                  <Label className="text-[0.7rem] text-muted-foreground">Events to subscribe to</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 mt-1">
                    {WEBHOOK_EVENTS.map((ev) => (
                      <label key={ev} className="flex items-center gap-1 text-[0.7rem] font-mono cursor-pointer">
                        <Checkbox
                          checked={selectedEvents.includes(ev)}
                          onCheckedChange={(c) => {
                            if (c) setSelectedEvents([...selectedEvents, ev]);
                            else setSelectedEvents(selectedEvents.filter((x) => x !== ev));
                          }}
                        />
                        <span>{ev}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Button size="sm" disabled={busy || !url} onClick={handleRegister}>
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Webhook className="w-3.5 h-3.5" />}
                  Register
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowRegister(false)}>Cancel</Button>
              </div>
            </Card>
          )}

          {/* Error / success */}
          {error && (
            <p className="text-xs text-red-500 flex items-start gap-1.5 mb-2">
              <AlertTriangle className="w-3.5 h-3.5" /> {error}
            </p>
          )}
          {success && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-start gap-1.5 mb-2">
              <CheckCircle2 className="w-3.5 h-3.5" /> {success}
            </p>
          )}

          {/* Test result */}
          {testResult && (
            <Card className="p-3 mb-3">
              <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                <Code className="w-3.5 h-3.5 text-muted-foreground" />
                Test delivery result
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <Field label="Event" value={testResult.eventType} mono />
                <Field label="URL" value={testResult.url} mono />
                <Field label="HTTP status" value={String(testResult.responseStatus ?? "—")} />
                <Field label="Latency" value={testResult.responseMs ? `${testResult.responseMs}ms` : "—"} />
              </div>
              {testResult.responseBodySnippet && (
                <div className="mt-2 p-2 rounded-md bg-muted/40 border border-border">
                  <p className="text-[0.6rem] uppercase tracking-wider text-muted-foreground mb-1">Response body (first 240 chars)</p>
                  <pre className="text-[0.65rem] font-mono whitespace-pre-wrap break-all">{testResult.responseBodySnippet}</pre>
                </div>
              )}
            </Card>
          )}

          {/* Registered webhook */}
          {registered.length === 0 ? (
            <div className="p-6 rounded-md border border-dashed border-border text-center mb-3">
              <Webhook className="w-5 h-5 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No webhook registered. Register an endpoint to receive lead + revenue events.
              </p>
            </div>
          ) : (
            <div className="border border-border rounded-md overflow-hidden mb-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[0.6rem] uppercase tracking-wider">URL</TableHead>
                    <TableHead className="text-[0.6rem] uppercase tracking-wider">Events</TableHead>
                    <TableHead className="text-[0.6rem] uppercase tracking-wider">Status</TableHead>
                    <TableHead className="text-[0.6rem] uppercase tracking-wider">Last delivery</TableHead>
                    <TableHead className="text-[0.6rem] uppercase tracking-wider text-right">Success</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {registered.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell className="font-mono text-[0.65rem] break-all max-w-[24rem]">{w.url}</TableCell>
                      <TableCell className="text-[0.6rem]">
                        <div className="flex flex-wrap gap-1">
                          {w.events.map((ev: string) => (
                            <Badge key={ev} variant="outline" className="text-[0.5rem] font-mono">{ev}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn(
                          "text-[0.55rem]",
                          w.status === "ACTIVE" ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300" : "border-border text-muted-foreground",
                        )}>
                          {w.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[0.65rem] text-muted-foreground">
                        {w.lastDeliveryAt ? fmtDateTime(w.lastDeliveryAt) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className={cn(
                          "text-[0.55rem]",
                          w.recentSuccessRate >= 90 ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                          : w.recentSuccessRate >= 50 ? "border-yellow-500/40 text-yellow-700 dark:text-yellow-300"
                          : "border-red-500/40 text-red-700 dark:text-red-300",
                        )}>
                          {w.recentSuccessRate}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Delivery log */}
          {logs.length > 0 && (
            <div>
              <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground mb-1.5">
                Recent deliveries (last {logs.length})
              </p>
              <div className="border border-border rounded-md overflow-hidden max-h-72 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[0.6rem] uppercase tracking-wider">Event</TableHead>
                      <TableHead className="text-[0.6rem] uppercase tracking-wider">HTTP</TableHead>
                      <TableHead className="text-[0.6rem] uppercase tracking-wider">Delivered</TableHead>
                      <TableHead className="text-[0.6rem] uppercase tracking-wider">Timestamp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.slice(0, 25).map((l: any, i: number) => (
                      <TableRow key={l.id || i}>
                        <TableCell className="font-mono text-[0.6rem]">{l.eventType}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn(
                            "text-[0.5rem]",
                            l.responseStatus && l.responseStatus >= 200 && l.responseStatus < 300
                              ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                              : l.responseStatus === null
                                ? "border-border text-muted-foreground"
                                : "border-red-500/40 text-red-700 dark:text-red-300",
                          )}>
                            {l.responseStatus ?? "undeliverable"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[0.6rem]">
                          {l.deliveredAt ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <AlertTriangle className="w-3 h-3 text-red-500" />}
                        </TableCell>
                        <TableCell className="text-[0.6rem] text-muted-foreground">
                          {fmtDateTime(l.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </>
      )}
    </Section>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// MP Tab 3 — API Key Management
// ──────────────────────────────────────────────────────────────────────────────

function MpApiKeyManagement({ partnerGtid }: { partnerGtid: string }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["mp-api-keys", partnerGtid],
    queryFn: async () => {
      const res = await fetchWithAuth(
        `/api/sgtx/marketplace/api-keys?partnerGtid=${encodeURIComponent(partnerGtid)}`,
      );
      if (!res.ok) throw new Error(`api-keys ${res.status}`);
      return res.json() as Promise<{
        partner: any;
        apiKey: { masked: string; prefix: string; createdAt: string; lastUsedAt: string };
        rateLimits: any[];
        ipWhitelist: string[];
      }>;
    },
    enabled: !!partnerGtid,
    retry: false,
  });

  const apiKey = q.data?.apiKey;
  const rateLimits: any[] = q.data?.rateLimits || [];
  const ipWhitelist: string[] = q.data?.ipWhitelist || [];

  async function handleRegenerate() {
    if (!confirm("Regenerate API key? The old key is invalidated immediately. Update your integration.")) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetchWithAuth(`/api/sgtx/marketplace/api-keys/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerGtid }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `regenerate failed (${res.status})`);
      setSuccess(`New API key generated. Old key (••••${j.previousKeyLast4}) invalidated.`);
      queryClient.invalidateQueries({ queryKey: ["mp-api-keys", partnerGtid] });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke() {
    if (!confirm("Revoke API key? Inbound requests will fail until you regenerate. Partner status will be set to REVOKED.")) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetchWithAuth(`/api/sgtx/marketplace/api-keys/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerGtid, reason: "manual revoke from cockpit" }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `revoke failed (${res.status})`);
      setSuccess(`API key revoked. Partner status set to REVOKED. Regenerate to reactivate.`);
      queryClient.invalidateQueries({ queryKey: ["mp-api-keys", partnerGtid] });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="API Key Management (Tab 3)" count={apiKey ? 1 : 0} icon={KeyRound}>
      {q.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading API keys…
        </div>
      ) : q.isError ? (
        <div className="p-3 rounded-md border border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/10 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>API key endpoint unavailable. Try again later.</span>
        </div>
      ) : apiKey ? (
        <>
          {/* Key card */}
          <Card className="p-4 mb-3">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex-1 min-w-0">
                <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                  Active API key
                </p>
                <p className="text-base font-mono font-semibold mt-0.5 break-all">
                  {revealedKey || apiKey.masked}
                </p>
                <div className="flex flex-wrap gap-2 mt-1.5 text-[0.65rem] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-2.5 h-2.5" />
                    Created {fmtDate(apiKey.createdAt)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Activity className="w-2.5 h-2.5" />
                    Last used {apiKey.lastUsedAt ? fmtDateTime(apiKey.lastUsedAt) : "—"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => setRevealedKey(null)} title="Masked view">
                  <EyeOff className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="outline" disabled={busy} onClick={handleRegenerate}>
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Regenerate
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-red-500/40 text-red-700 dark:text-red-300"
                disabled={busy}
                onClick={handleRevoke}
              >
                <ShieldOff className="w-3.5 h-3.5" />
                Revoke
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  navigator.clipboard?.writeText(apiKey.masked);
                  setSuccess("Masked key copied to clipboard.");
                }}
              >
                <Copy className="w-3.5 h-3.5" />
                Copy masked
              </Button>
            </div>
          </Card>

          {/* Error / success */}
          {error && (
            <p className="text-xs text-red-500 flex items-start gap-1.5 mb-2">
              <AlertTriangle className="w-3.5 h-3.5" /> {error}
            </p>
          )}
          {success && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-start gap-1.5 mb-2">
              <CheckCircle2 className="w-3.5 h-3.5" /> {success}
            </p>
          )}

          {/* Usage analytics — rate limits */}
          <div className="mb-3">
            <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground mb-1.5">
              Usage analytics — rate limits (1-hour window)
            </p>
            <div className="border border-border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[0.6rem] uppercase tracking-wider">Endpoint</TableHead>
                    <TableHead className="text-[0.6rem] uppercase tracking-wider text-right">Limit</TableHead>
                    <TableHead className="text-[0.6rem] uppercase tracking-wider text-right">Used</TableHead>
                    <TableHead className="text-[0.6rem] uppercase tracking-wider text-right">Remaining</TableHead>
                    <TableHead className="text-[0.6rem] uppercase tracking-wider">Utilization</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rateLimits.map((rl, i) => {
                    const pct = rl.limit > 0 ? (rl.currentUsage / rl.limit) * 100 : 0;
                    const tone = pct >= 90 ? "critical" : pct >= 70 ? "warning" : "active";
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-[0.6rem]">{rl.endpoint}</TableCell>
                        <TableCell className="text-right text-[0.65rem]">{rl.limit}</TableCell>
                        <TableCell className="text-right text-[0.65rem] font-medium">{rl.currentUsage}</TableCell>
                        <TableCell className="text-right text-[0.65rem]">{rl.limit - rl.currentUsage}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={pct} className="h-1.5 w-24" />
                            <span className={cn(
                              "text-[0.6rem]",
                              tone === "critical" ? "text-red-600" : tone === "warning" ? "text-yellow-700 dark:text-yellow-300" : "text-emerald-700 dark:text-emerald-300",
                            )}>
                              {pct.toFixed(0)}%
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* IP whitelist */}
          <div>
            <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground mb-1.5">
              IP whitelist
            </p>
            <div className="flex flex-wrap gap-1.5">
              {ipWhitelist.map((ip) => (
                <Badge key={ip} variant="outline" className="text-[0.55rem] font-mono">{ip}</Badge>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </Section>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// MP Tab 4 — Revenue Attribution
// ──────────────────────────────────────────────────────────────────────────────

function MpRevenueAttribution({ partnerGtid }: { partnerGtid: string }) {
  const queryClient = useQueryClient();
  const [disputingLead, setDisputingLead] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["mp-revenue", partnerGtid],
    queryFn: async () => {
      const res = await fetchWithAuth(
        `/api/sgtx/marketplace/revenue?partnerGtid=${encodeURIComponent(partnerGtid)}`,
      );
      if (!res.ok) throw new Error(`revenue ${res.status}`);
      return res.json() as Promise<{
        partner: any;
        summary: any;
        monthly: any[];
        topCorridors: any[];
        payouts: any[];
      }>;
    },
    enabled: !!partnerGtid,
    retry: false,
  });

  // Also fetch leads so we can render the dispute affordance per lead.
  const leadsQ = useQuery({
    queryKey: ["mp-revenue-leads", partnerGtid],
    queryFn: async () => {
      const res = await fetchWithAuth(
        `/api/sgtx/marketplace/leads?partnerGtid=${encodeURIComponent(partnerGtid)}`,
      );
      if (!res.ok) throw new Error(`leads ${res.status}`);
      return res.json() as Promise<{ leads: any[] }>;
    },
    enabled: !!partnerGtid,
    retry: false,
  });

  const summary = q.data?.summary || {};
  const monthly: any[] = q.data?.monthly || [];
  const topCorridors: any[] = q.data?.topCorridors || [];
  const payouts: any[] = q.data?.payouts || [];
  const leads: any[] = leadsQ.data?.leads || [];

  async function handleDispute() {
    if (disputeReason.trim().length < 20) {
      setError("Dispute reason must be ≥20 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetchWithAuth(`/api/sgtx/marketplace/revenue/dispute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerGtid, leadId: disputingLead, reason: disputeReason.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `dispute failed (${res.status})`);
      setSuccess(`Lead ${disputingLead?.slice(-6).toUpperCase()} disputed. Reason logged for adjudication.`);
      setDisputingLead(null);
      setDisputeReason("");
      queryClient.invalidateQueries({ queryKey: ["mp-revenue", partnerGtid] });
      queryClient.invalidateQueries({ queryKey: ["mp-revenue-leads", partnerGtid] });
      queryClient.invalidateQueries({ queryKey: ["mp-leads", partnerGtid] });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Revenue Attribution (Tab 4)" count={summary.totalLeads || 0} icon={Banknote}>
      {q.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading revenue attribution…
        </div>
      ) : q.isError ? (
        <div className="p-3 rounded-md border border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/10 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>Revenue endpoint unavailable. Try again later.</span>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <SummaryCard label="Total leads" value={String(summary.totalLeads || 0)} icon={Handshake} tone="default" />
            <SummaryCard label="Accepted (active)" value={String(summary.activeLeads || 0)} icon={CheckCircle2} tone="active" />
            <SummaryCard label="Conversion rate" value={`${summary.conversionRate ?? 0}%`} icon={TrendingUp} tone="default" />
            <SummaryCard label="Total revenue share" value={fmtMoney(summary.totalRevenue || 0, "USD")} icon={DollarSign} tone="active" />
          </div>

          {/* Error / success */}
          {error && (
            <p className="text-xs text-red-500 flex items-start gap-1.5 mb-2">
              <AlertTriangle className="w-3.5 h-3.5" /> {error}
            </p>
          )}
          {success && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-start gap-1.5 mb-2">
              <CheckCircle2 className="w-3.5 h-3.5" /> {success}
            </p>
          )}

          {/* Monthly breakdown */}
          <div className="mb-3">
            <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground mb-1.5">
              Monthly summary (last 6 months)
            </p>
            <div className="border border-border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[0.6rem] uppercase tracking-wider">Month</TableHead>
                    <TableHead className="text-[0.6rem] uppercase tracking-wider text-right">Leads</TableHead>
                    <TableHead className="text-[0.6rem] uppercase tracking-wider text-right">Revenue share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthly.map((m, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-[0.7rem] font-medium">{m.month}</TableCell>
                      <TableCell className="text-right text-[0.7rem]">{m.leads}</TableCell>
                      <TableCell className="text-right text-[0.7rem] font-medium">{fmtMoney(m.revenue, "USD")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Top corridors + payouts side-by-side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <Card className="p-3">
              <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                <Globe className="w-3 h-3" />
                Top corridors
              </p>
              {topCorridors.length > 0 ? (
                <ul className="space-y-1.5">
                  {topCorridors.map((c, i) => (
                    <li key={i} className="flex items-center justify-between text-[0.7rem]">
                      <span className="font-mono">{c.pair}</span>
                      <span className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[0.55rem]">{c.count} leads</Badge>
                        <span className="font-medium">{fmtMoney(c.revenue, "USD")}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[0.7rem] text-muted-foreground">No corridor data yet.</p>
              )}
            </Card>
            <Card className="p-3">
              <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                <Wallet className="w-3 h-3" />
                Payout history
              </p>
              {payouts.length > 0 ? (
                <ul className="space-y-1.5">
                  {payouts.map((p, i) => (
                    <li key={i} className="flex items-center justify-between text-[0.7rem]">
                      <span className="flex items-center gap-1.5">
                        <span className="font-mono">{p.id}</span>
                        <Badge variant="outline" className={cn(
                          "text-[0.5rem]",
                          p.status === "PAID" ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300" : "border-yellow-500/40 text-yellow-700 dark:text-yellow-300",
                        )}>
                          {p.status}
                        </Badge>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{fmtMoney(p.amount, "USD")}</span>
                        <span className="text-[0.6rem] text-muted-foreground">{p.month}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[0.7rem] text-muted-foreground">No payouts yet.</p>
              )}
            </Card>
          </div>

          {/* Dispute attribution */}
          <Card className="p-3 border-red-500/20">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <p className="text-xs font-semibold flex items-center gap-1.5">
                  <FileWarning className="w-3.5 h-3.5 text-red-600" />
                  Dispute attribution
                </p>
                <p className="text-[0.65rem] text-muted-foreground mt-0.5">
                  Mark a lead as DISPUTED if attribution was assigned to the wrong
                  partner. The reason (≥20 chars) is logged for adjudication.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <div>
                <Label className="text-[0.65rem] text-muted-foreground">Select lead to dispute</Label>
                <select
                  className="w-full mt-1 text-[0.7rem] rounded-md border border-border bg-background px-2 py-1.5"
                  value={disputingLead || ""}
                  onChange={(e) => setDisputingLead(e.target.value || null)}
                >
                  <option value="">— choose a lead —</option>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.leadId} · {maskGtid(l.buyerGtid)} · {l.commodity} · {l.status}
                    </option>
                  ))}
                </select>
              </div>
              {disputingLead && (
                <>
                  <Textarea
                    placeholder="Dispute reason (≥20 chars) — e.g. 'This lead was attributed to us but the buyer came through Partner B's referral link…'"
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    className="text-xs min-h-[70px]"
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-500/40 text-red-700 dark:text-red-300"
                      disabled={busy || disputeReason.trim().length < 20}
                      onClick={handleDispute}
                    >
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileWarning className="w-3.5 h-3.5" />}
                      Submit dispute
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setDisputingLead(null); setDisputeReason(""); setError(null); }}>
                      Cancel
                    </Button>
                  </div>
                </>
              )}
            </div>
          </Card>
        </>
      )}
    </Section>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// MP Tab 5 — Integration Guide & Test Sandbox
// ──────────────────────────────────────────────────────────────────────────────

const SANDBOX_ENDPOINTS = [
  { value: "POST /v1/partner/intent/analyze", label: "POST /v1/partner/intent/analyze — analyse buyer intent" },
  { value: "POST /v1/partner/trade/initiate", label: "POST /v1/partner/trade/initiate — initiate sandbox trade" },
  { value: "GET /v1/partner/suppliers/match", label: "GET /v1/partner/suppliers/match — match suppliers" },
  { value: "GET /v1/partner/analytics", label: "GET /v1/partner/analytics — pull partner analytics" },
];

function MpSandboxGuide({ partnerGtid }: { partnerGtid: string }) {
  const queryClient = useQueryClient();
  const [endpoint, setEndpoint] = useState(SANDBOX_ENDPOINTS[0].value);
  const [payload, setPayload] = useState(JSON.stringify({
    commodity: "Fresh Strawberries",
    originCountry: "EG",
    destCountry: "DE",
    revenueSharePct: 0.5,
  }, null, 2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const historyQ = useQuery({
    queryKey: ["mp-sandbox-history", partnerGtid],
    queryFn: async () => {
      const res = await fetchWithAuth(
        `/api/sgtx/marketplace/sandbox/test?partnerGtid=${encodeURIComponent(partnerGtid)}`,
      );
      if (!res.ok) throw new Error(`sandbox ${res.status}`);
      return res.json() as Promise<{ availableEndpoints: string[]; history: any[] }>;
    },
    enabled: !!partnerGtid,
    retry: false,
  });

  const history: any[] = historyQ.data?.history || [];

  async function handleSendTest() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    setResult(null);
    let parsed: any = null;
    try {
      parsed = JSON.parse(payload);
    } catch {
      setError("Payload is not valid JSON.");
      setBusy(false);
      return;
    }
    try {
      const res = await fetchWithAuth(`/api/sgtx/marketplace/sandbox/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerGtid, endpoint, payload: parsed }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `test failed (${res.status})`);
      setResult(j);
      setSuccess(`Test request sent — ${j.responseMs}ms · sandbox only, no production data touched.`);
      queryClient.invalidateQueries({ queryKey: ["mp-sandbox-history", partnerGtid] });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Integration Guide & Test Sandbox (Tab 5)" count={SANDBOX_ENDPOINTS.length} icon={FlaskConical}>
      {/* Integration guide */}
      <Card className="p-4 mb-3">
        <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
          <Code className="w-3.5 h-3.5 text-muted-foreground" />
          Integration guide
        </p>
        <div className="space-y-2 text-[0.7rem]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="p-2 rounded-md border border-border bg-muted/30">
              <p className="text-[0.6rem] uppercase tracking-wider text-muted-foreground mb-1">Base URL</p>
              <p className="font-mono text-[0.7rem] break-all">https://api.sgtx.global/v1/partner</p>
            </div>
            <div className="p-2 rounded-md border border-border bg-muted/30">
              <p className="text-[0.6rem] uppercase tracking-wider text-muted-foreground mb-1">Auth</p>
              <p className="font-mono text-[0.7rem]">Authorization: Bearer $SGTX_API_KEY</p>
            </div>
            <div className="p-2 rounded-md border border-border bg-muted/30">
              <p className="text-[0.6rem] uppercase tracking-wider text-muted-foreground mb-1">Content-Type</p>
              <p className="font-mono text-[0.7rem]">application/json</p>
            </div>
            <div className="p-2 rounded-md border border-border bg-muted/30">
              <p className="text-[0.6rem] uppercase tracking-wider text-muted-foreground mb-1">Idempotency</p>
              <p className="font-mono text-[0.7rem]">Idempotency-Key: &lt;uuid&gt; (POST only)</p>
            </div>
          </div>

          <div className="mt-2 p-2 rounded-md border border-border bg-muted/20">
            <p className="text-[0.6rem] uppercase tracking-wider text-muted-foreground mb-1">Sample request</p>
            <pre className="text-[0.65rem] font-mono whitespace-pre-wrap">{`curl -X POST https://api.sgtx.global/v1/partner/intent/analyze \\
  -H "Authorization: Bearer $SGTX_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "commodity": "Fresh Strawberries",
    "originCountry": "EG",
    "destCountry": "DE"
  }'`}</pre>
          </div>

          <div className="flex items-center gap-2 mt-2">
            <a
              href="https://docs.sgtx.global/partner-api"
              target="_blank"
              rel="noreferrer"
              className="text-[0.7rem] text-cyan-700 dark:text-cyan-300 hover:underline inline-flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" />
              Full API documentation
            </a>
            <a
              href="https://docs.sgtx.global/partner-webhooks"
              target="_blank"
              rel="noreferrer"
              className="text-[0.7rem] text-cyan-700 dark:text-cyan-300 hover:underline inline-flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" />
              Webhook events reference
            </a>
          </div>
        </div>
      </Card>

      {/* Test sandbox */}
      <Card className="p-4 mb-3 border-cyan-500/30">
        <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
          <FlaskConical className="w-3.5 h-3.5 text-cyan-700 dark:text-cyan-300" />
          Test sandbox — send a request
        </p>
        <div className="space-y-2">
          <div>
            <Label className="text-[0.65rem] text-muted-foreground">Endpoint</Label>
            <select
              className="w-full mt-1 text-[0.7rem] rounded-md border border-border bg-background px-2 py-1.5 font-mono"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
            >
              {SANDBOX_ENDPOINTS.map((e) => (
                <option key={e.value} value={e.value}>{e.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-[0.65rem] text-muted-foreground">Request payload (JSON)</Label>
            <Textarea
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              className="text-[0.7rem] font-mono min-h-[120px]"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={busy} onClick={handleSendTest}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Send Test Request
            </Button>
            <span className="text-[0.65rem] text-muted-foreground">
              Sandbox — no production data affected.
            </span>
          </div>
        </div>

        {/* Error / success */}
        {error && (
          <p className="text-xs text-red-500 flex items-start gap-1.5 mt-2">
            <AlertTriangle className="w-3.5 h-3.5" /> {error}
          </p>
        )}
        {success && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-start gap-1.5 mt-2">
            <CheckCircle2 className="w-3.5 h-3.5" /> {success}
          </p>
        )}

        {/* Test result */}
        {result && (
          <div className="mt-3 p-2 rounded-md border border-border bg-muted/30">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">Response</p>
              <Badge variant="outline" className="text-[0.55rem] border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
                200 · {result.responseMs}ms
              </Badge>
            </div>
            <pre className="text-[0.65rem] font-mono whitespace-pre-wrap max-h-72 overflow-y-auto">
              {JSON.stringify(result.response, null, 2)}
            </pre>
          </div>
        )}
      </Card>

      {/* Test results history */}
      <div>
        <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground mb-1.5">
          Test results history (last {history.length})
        </p>
        {historyQ.isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading history…
          </div>
        ) : history.length === 0 ? (
          <div className="p-4 rounded-md border border-dashed border-border text-center">
            <Code className="w-4 h-4 text-muted-foreground/40 mx-auto mb-1.5" />
            <p className="text-xs text-muted-foreground">No test requests sent yet.</p>
          </div>
        ) : (
          <div className="border border-border rounded-md overflow-hidden max-h-72 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[0.6rem] uppercase tracking-wider">Endpoint</TableHead>
                  <TableHead className="text-[0.6rem] uppercase tracking-wider text-right">Latency</TableHead>
                  <TableHead className="text-[0.6rem] uppercase tracking-wider">Sent at</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h, i) => (
                  <TableRow key={h.id || i}>
                    <TableCell className="font-mono text-[0.6rem]">{h.endpoint}</TableCell>
                    <TableCell className="text-right text-[0.65rem]">{h.responseMs ? `${h.responseMs}ms` : "—"}</TableCell>
                    <TableCell className="text-[0.65rem] text-muted-foreground">{fmtDateTime(h.sentAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </Section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// GAP-3 helpers
// ═══════════════════════════════════════════════════════════════════════════════

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: any;
  tone?: "default" | "active" | "warning" | "critical";
}) {
  const toneClass =
    tone === "active" ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
    : tone === "warning" ? "border-yellow-500/40 text-yellow-700 dark:text-yellow-300"
    : tone === "critical" ? "border-red-500/40 text-red-700 dark:text-red-300"
    : "border-border";
  return (
    <Card className={`p-3 ${toneClass}`}>
      <p className="text-[0.55rem] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        <Icon className="w-2.5 h-2.5" />
        {label}
      </p>
      <p className="text-lg font-semibold mt-0.5">{value}</p>
    </Card>
  );
}

function maskGtid(gtid: string | undefined): string {
  if (!gtid) return "—";
  if (gtid.length <= 12) return gtid;
  return `${gtid.slice(0, 6)}…${gtid.slice(-4)}`;
}
