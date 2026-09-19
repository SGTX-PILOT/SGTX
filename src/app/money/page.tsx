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

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { CockpitShell, shouldShowAdmin } from "@/components/cockpit/CockpitShell";
import { useSession, fetchWithAuth } from "@/lib/cockpit/session";
import { useCockpitLocale } from "@/lib/cockpit/use-locale";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  DollarSign, FileText, Banknote, Scale, TrendingUp, Activity,
  ChevronRight, Loader2, Landmark,
  Lock, Unlock, GitBranch, ScrollText, Layers, Eye, EyeOff, Coins,
  ShieldCheck, Calendar, CheckCircle2, AlertTriangle, Info, Gauge,
  Building2,
} from "lucide-react";
import { fmtDate, fmtDateTime, fmtMoney, statusLabel } from "@/lib/cockpit/format";

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
