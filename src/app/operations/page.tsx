"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// COCKPIT-Phase 5: /operations route — role-dependent operational queue.
// ═════════════════════════════════════════════════════════════════════════════════
//
// Law #5: THE TRADE IS THE PRIMARY OBJECT. Every operational item links to
// /trades/[ustn]. This page is the operational queue — not a dashboard.
//
// Role → content mapping:
//   TRD (Buyer/Seller)  → their shipments + milestones for their trades
//   LSP                 → assigned jobs + dispatch planner + fleet
//   SHIP                → bookings + B/L + container release + schedules
//   LAB                 → test requests + sampling queue + certificates
//   QC                  → inspection schedule + field inspections + reports
//   CBR                 → declarations + certificates + clearance status
//   GOV                 → national trade flow + customs + food safety (drill into /trades/[ustn])
//   MP                  → lead attribution (not operations-focused; redirects)
//   ADM                 → platform monitoring (not operations; hidden)
//
// The role is derived from the tenant type (JWT claim → /api/sgtx/dashboard
// returns the tenant type). Unknown types see an honest empty state.

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { CockpitShell, shouldShowAdmin } from "@/components/cockpit/CockpitShell";
import { useSession, fetchWithAuth } from "@/lib/cockpit/session";
import { Badge } from "@/components/ui/badge";
import {
  Activity, Briefcase, Truck, Ship, FlaskConical, ShieldCheck, Landmark,
  ChevronRight, Package, FileText, Calendar, AlertTriangle, Loader2,
} from "lucide-react";
import { fmtDate, statusLabel } from "@/lib/cockpit/format";

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

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["cockpit-dashboard", payload?.tenantGtid],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/dashboard?tenant=${encodeURIComponent(payload!.tenantGtid!)}`);
      if (!res.ok) throw new Error(`Failed to load dashboard (${res.status})`);
      return res.json();
    },
    enabled: ready && !!payload?.tenantGtid,
  });

  if (!ready) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading session…</div>;
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
          <h1 className="text-2xl font-semibold tracking-tight">Operations</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your operational queue. Each item links to the trade it belongs to.
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

// ── LSP operations: assigned jobs + dispatch + fleet ─────────────────────────
function LspOperations({ data }: { data?: DashboardData }) {
  const jobs = data?.shipmentsCarrier || [];
  return (
    <div className="space-y-6">
      <Section title="Assigned jobs" count={jobs.length} icon={Truck}>
        <ShipmentList shipments={jobs} empty="No jobs assigned to your fleet." />
      </Section>
    </div>
  );
}

// ── SHIP operations: bookings + B/L + container release ──────────────────────
function ShipOperations({ data }: { data?: DashboardData }) {
  const jobs = data?.shipmentsCarrier || [];
  return (
    <div className="space-y-6">
      <Section title="Bookings & B/L" count={jobs.length} icon={Ship}>
        <ShipmentList shipments={jobs} empty="No bookings assigned to your shipping line." />
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
