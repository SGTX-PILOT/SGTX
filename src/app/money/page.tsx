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
//   BANK  → financing opportunities (open RFQs) + their bids + collateral
//   PFI   → same as BANK
//   GOV   → FX monitoring + settlement overview (cross-tenant, read-only)
//   Other → honest empty state

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { CockpitShell, shouldShowAdmin } from "@/components/cockpit/CockpitShell";
import { useSession, fetchWithAuth } from "@/lib/cockpit/session";
import { useCockpitLocale } from "@/lib/cockpit/use-locale";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign, FileText, Banknote, Scale, TrendingUp, Activity,
  ChevronRight, Loader2, Landmark,
} from "lucide-react";
import { fmtDate, fmtMoney, statusLabel } from "@/lib/cockpit/format";

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

function TraderMoney({ data }: { data?: DashboardData }) {
  const invoices = data?.invoices || [];
  const outstanding = invoices.filter((i) => i.status === "ISSUED" || i.status === "OVERDUE");
  const paid = invoices.filter((i) => i.status === "PAID" || i.status === "SETTLED");

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
    </div>
  );
}

function FinancierMoney({ data }: { data?: DashboardData }) {
  const opportunities = data?.openFinancingRequests || [];
  const myBids = data?.financingBids || [];
  const accepted = myBids.filter((b) => b.status === "ACCEPTED");

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
                      {r.trade?.commodity || "Financing RFQ"} · {fmtMoney(r.amountRequested, r.currency)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Borrower: {r.borrower?.legalName || "—"} · {r.status || "OPEN"}
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
      <Section title="Your bids" count={myBids.length} icon={Banknote}>
        {myBids.length > 0 ? (
          <ul className="divide-y divide-border border border-border rounded-md bg-card/40">
            {myBids.map((b: any, i: number) => (
              <li key={b.id || i}>
                <Link href={b.request?.trade?.ustn ? `/trades/${b.request.trade.ustn}` : "/trades"} className="flex items-center justify-between gap-3 p-3 hover:bg-muted/40 transition group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {fmtMoney(b.amountOffered, b.currency)} at {b.rateOffered}%
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
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
      <Section title="Active loans" count={accepted.length} icon={Scale}>
        {accepted.length > 0 ? (
          <ul className="divide-y divide-border border border-border rounded-md bg-card/40">
            {accepted.map((b: any, i: number) => (
              <li key={b.id || i}>
                <Link href={b.request?.trade?.ustn ? `/trades/${b.request.trade.ustn}` : "/trades"} className="flex items-center justify-between gap-3 p-3 hover:bg-muted/40 transition group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{fmtMoney(b.amountOffered, b.currency)} loan</p>
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
