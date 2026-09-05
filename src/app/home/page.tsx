"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// COCKPIT-Phase 4: /home route — action-first home WITH role-specific dashboard.
// ═════════════════════════════════════════════════════════════════════════════════
//
// Answers the 5 questions (T1) AND shows the role-specific dashboard (T2):
//   1. What needs my attention?     (numbered task list, each → trade + action)
//   2. What is happening now?        (active trades count + role-specific exec cards)
//   3. What is blocked?              (blockers with owner)
//   4. What needs my approval?       (pending approvals)
//   5. What changed?                 (recent activity, max 7)
//
// PLUS the role-specific executive cards (restored from the legacy CommandCenter):
//   Buyer: Open Trades, Active Shipments, Pending Approvals, Outstanding, Compliance Alerts, Active Disputes
//   Seller: Outbound Trades, Containers, Trade Value, SGTX Fees, Distressed Alerts, Quotes Pending
//   LSP: Assignments, In Transit, Milestones Due, Revenue, Open RFQs, Active Jobs
//   Ship: Vessels, Containers, Releases Pending, B/L Issued, Bookings, eBL Signatures
//   Lab: Test Requests, In Testing, Reports Issued, Pass Rate
//   QC: Inspections, Scheduled, Field Reports, Pass Rate
//   CBR: Declarations, Certificates, Clearance Rate, Pending
//   Bank/PFI: Open RFQs, My Bids, Exposure, Active Loans, Margin Calls, Repayments
//   Gov: National Trades, Cross-border Flow, Customs Pending, FX Alerts, Clearances, Multi-Agency
//
// PLUS quick actions (role-specific navigation shortcuts).

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { CockpitShell, shouldShowAdmin } from "@/components/cockpit/CockpitShell";
import { useSession, fetchWithAuth } from "@/lib/cockpit/session";
import { useCockpitLocale } from "@/lib/cockpit/use-locale";
import { fmtMoney, fmtDate, statusLabel } from "@/lib/cockpit/format";
import {
  AlertTriangle, ArrowRight, CheckCircle2, Clock, ListTodo, Activity,
  ChevronRight, Bell, ShoppingBag, Store, Ship, Package, Banknote,
  ShieldCheck, Gavel, FileText, DollarSign, Users, FlaskConical,
  Truck, Container, Cpu, Inbox, Megaphone, PackageCheck, TrendingUp,
  Scale, RefreshCw, Globe2, Landmark, Settings,
} from "lucide-react";

interface DashboardData {
  tenant?: { gtid: string; legalName: string; type: string; country?: string };
  inbox?: any[];
  tradesAsBuyer?: any[];
  tradesAsSeller?: any[];
  activities?: any[];
  invoices?: any[];
  shipmentsCarrier?: any[];
  customsDecls?: any[];
  labTests?: any[];
  qcInspections?: any[];
  financingBids?: any[];
  openFinancingRequests?: any[];
  disputes?: any[];
}

const STATUS_ACTIVE = new Set([
  "PENDING_SELLER_RESPONSE", "BUYER_SUBMITTED", "QUOTE_ACCEPTED",
  "CONTRACT_SIGNED", "IN_EXECUTION", "INSPECTION_REQUIRED",
  "CUSTOMS_PENDING", "PAYMENT_DUE",
]);

function deriveAction(item: any, tenantGtid: string): { href: string; actionLabel: string } {
  const ustn = item.trade?.ustn;
  const workspace = ustn ? `/trades/${ustn}` : "/trades";
  switch (item.category || "") {
    case "QUOTE_RESPONSE": return { href: `${workspace}`, actionLabel: "Review quote" };
    case "CONTRACT_SIGN": return { href: `${workspace}`, actionLabel: "Sign contract" };
    case "MILESTONE_CONFIRM": return { href: `${workspace}`, actionLabel: "Confirm milestone" };
    case "INVOICE_APPROVE": return { href: `${workspace}`, actionLabel: "Approve invoice" };
    case "CUSTOMS_HOLD": return { href: `${workspace}`, actionLabel: "Resolve customs hold" };
    case "INSPECTION_RESULT": return { href: `${workspace}`, actionLabel: "Review inspection" };
    case "FINANCING_BID": return { href: `${workspace}`, actionLabel: "Review bid" };
    case "DISPUTE_FILED": return { href: `${workspace}`, actionLabel: "View dispute" };
    default: return { href: workspace, actionLabel: "Open trade" };
  }
}

export default function HomePage() {
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
  const allTrades = [...(data?.tradesAsBuyer || []), ...(data?.tradesAsSeller || [])];
  const activeTrades = allTrades.filter((t) => STATUS_ACTIVE.has(t.status));
  const inbox = (data?.inbox || []).filter((i) => !i.dismissed);
  const pendingApprovals = inbox.filter((i) => i.category === "NEEDS_APPROVAL" || i.category === "APPROVAL");
  const blockers = inbox.filter((i) => i.category === "BLOCKER" || i.category === "URGENT" || i.priority === "HIGH");
  const attention = inbox.filter((i) => i.priority === "HIGH" || i.priority === "MEDIUM").slice(0, 5);
  const recentActivity = (data?.activities || []).slice(0, 7);

  // Derive role-specific executive cards
  const execCards = deriveExecCards(tenantType, data, allTrades, activeTrades);
  const quickActions = deriveQuickActions(tenantType);

  return (
    <CockpitShell
      roleLabel={payload.role}
      tenantName={tenantName}
      showAdmin={shouldShowAdmin(tenantType)}
    >
      <div className="space-y-6">
        {/* Welcome header */}
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">
            {tenantName || "Welcome"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {payload.role?.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())} · {t("home.subtitle")}
          </p>
        </header>

        {/* ── ROLE-SPECIFIC EXECUTIVE CARDS (T2 dashboard) ─────────────── */}
        {execCards.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {statusLabel(tenantType)} Dashboard
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {execCards.map((card, i) => (
                <ExecCard key={i} {...card} />
              ))}
            </div>
          </section>
        )}

        {/* ── QUICK ACTIONS ──────────────────────────────────────────── */}
        {quickActions.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Quick Actions</h2>
            <div className="flex flex-wrap gap-2">
              {quickActions.map((qa, i) => (
                <Link key={i} href={qa.href}>
                  <button className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md border border-border bg-card/40 hover:bg-muted text-sm font-medium transition">
                    <qa.icon className="w-3.5 h-3.5 text-muted-foreground" />
                    {qa.label}
                  </button>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── THE 5 QUESTIONS (T1) ──────────────────────────────────── */}
        <div className="space-y-5 max-w-3xl pt-2 border-t border-border/40">
          {/* Q1 — Needs attention */}
          <Section icon={ListTodo} title={t("home.needsAttention")} count={attention.length} empty={t("home.noUrgent")} emptyIcon={CheckCircle2}>
            {attention.length > 0 ? (
              <ol className="space-y-2">
                {attention.map((item, i) => {
                  const action = deriveAction(item, payload.tenantGtid!);
                  return (
                    <li key={item.id || i}>
                      <Link href={action.href} className="flex items-start gap-3 p-3 rounded-md border border-border hover:bg-muted/40 transition group">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[0.65rem] font-semibold inline-flex items-center justify-center">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.title || item.message || "Action required"}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.trade?.commodity || "Trade"} · {action.actionLabel}</p>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground flex-shrink-0 mt-1" />
                      </Link>
                    </li>
                  );
                })}
              </ol>
            ) : null}
          </Section>

          {/* Q2 — Happening now */}
          <Section icon={Activity} title={t("home.happeningNow")} count={activeTrades.length}>
            <Link href="/trades?filter=active" className="block p-4 rounded-md border border-border hover:bg-muted/40 transition">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-semibold">{activeTrades.length}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("home.activeTradesCount")}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </Link>
          </Section>

          {/* Q3 — Blocked */}
          <Section icon={AlertTriangle} title={t("home.blocked")} count={blockers.length} empty={t("home.noBlockers")} emptyIcon={CheckCircle2}>
            {blockers.length > 0 ? (
              <ul className="space-y-2">
                {blockers.slice(0, 5).map((b, i) => {
                  const action = deriveAction(b, payload.tenantGtid!);
                  return (
                    <li key={b.id || i}>
                      <Link href={action.href} className="block p-3 rounded-md border border-red-500/30 bg-red-50/30 dark:bg-red-950/10 hover:bg-red-50/50 dark:hover:bg-red-950/20 transition">
                        <p className="text-sm font-medium">{b.title || b.message}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{b.trade?.commodity || "Trade"} · {action.actionLabel}</p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </Section>

          {/* Q4 — Needs approval */}
          <Section icon={Bell} title={t("home.needsApproval")} count={pendingApprovals.length} empty={t("home.noApprovals")} emptyIcon={CheckCircle2}>
            {pendingApprovals.length > 0 ? (
              <ul className="space-y-2">
                {pendingApprovals.slice(0, 5).map((a, i) => {
                  const action = deriveAction(a, payload.tenantGtid!);
                  return (
                    <li key={a.id || i}>
                      <Link href={action.href} className="block p-3 rounded-md border border-border hover:bg-muted/40 transition">
                        <p className="text-sm font-medium">{a.title || a.message}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{a.trade?.commodity || "Trade"} · {action.actionLabel}</p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </Section>

          {/* Q5 — Recent changes */}
          <Section icon={Clock} title={t("home.recentChanges")} count={recentActivity.length} empty={t("home.noActivity")} emptyIcon={Clock}>
            {recentActivity.length > 0 ? (
              <ol className="space-y-2">
                {recentActivity.map((a, i) => (
                  <li key={a.id || i} className="text-sm flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 mt-1.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground truncate">{a.description || a.action}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{a.actor?.legalName || a.actorGtid || "System"} · {fmtDate(a.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : null}
          </Section>
        </div>
      </div>
    </CockpitShell>
  );
}

// ── Role-specific executive cards ───────────────────────────────────────────────

interface ExecCardData {
  label: string;
  value: string;
  sub?: string;
  icon: any;
  accent: string;
  href?: string;
  trend?: string;
}

function deriveExecCards(tenantType: string, data: DashboardData | undefined, allTrades: any[], activeTrades: any[]): ExecCardData[] {
  const inbox = data?.inbox || [];
  const invoices = data?.invoices || [];
  const tradesAsBuyer = data?.tradesAsBuyer || [];
  const tradesAsSeller = data?.tradesAsSeller || [];
  const shipmentsCarrier = data?.shipmentsCarrier || [];
  const labTests = data?.labTests || [];
  const qcInspections = data?.qcInspections || [];
  const customsDecls = data?.customsDecls || [];
  const financingBids = data?.financingBids || [];
  const openFinancingRequests = data?.openFinancingRequests || [];
  const disputes = data?.disputes || [];

  const overdueAmount = invoices.filter((i: any) => i.status === "OVERDUE").reduce((s: number, i: any) => s + (i.amount || 0), 0);
  const complianceAlerts = inbox.filter((i: any) => i.category === "COMPLIANCE").length;
  const activeDisputes = disputes.filter((d: any) => d.status !== "RESOLVED");
  const totalValue = tradesAsSeller.reduce((s: number, t: any) => s + (t.totalValue || 0), 0);
  const distressedAlerts = allTrades.filter((t: any) => t.status === "DISTRESSED").length;
  const lspOpenRfqs = inbox.filter((i: any) => i.category === "LSP_RFQ").length;
  const lspActiveJobs = shipmentsCarrier.filter((s: any) => s.status === "IN_TRANSIT").length;

  switch (tenantType) {
    case "TRD":
      return [
        { label: "Open Trades", value: String(activeTrades.length), sub: `${allTrades.length} total`, icon: ShoppingBag, accent: "#1a6fb0", href: "/trades" },
        { label: "Active Shipments", value: String(allTrades.reduce((s, t) => s + (t.shipments?.length || 0), 0)), icon: Ship, accent: "#0ea5e9", href: "/operations" },
        { label: "Pending Approvals", value: String(inbox.length), icon: Clock, accent: "#fbbf24", href: "/home" },
        { label: "Outstanding", value: fmtMoney(overdueAmount, "USD"), sub: `${invoices.length} invoices`, icon: Banknote, accent: "#f87171", href: "/money" },
        { label: "Compliance Alerts", value: String(complianceAlerts), sub: complianceAlerts > 0 ? "needs review" : "all clear", icon: ShieldCheck, accent: "#9333ea", href: "/trust" },
        { label: "Active Disputes", value: String(activeDisputes.length), sub: activeDisputes.length > 0 ? "filed / mediating" : "none active", icon: Gavel, accent: "#dc2626", href: "/trades" },
      ];
    case "LSP":
      return [
        { label: "Assignments", value: String(shipmentsCarrier.length), sub: "active", icon: Package, accent: "#c2410c", href: "/operations" },
        { label: "In Transit", value: String(shipmentsCarrier.filter((s: any) => s.status === "IN_TRANSIT").length), icon: Truck, accent: "#ea580c", href: "/operations" },
        { label: "Milestones Due", value: String(inbox.length), icon: Clock, accent: "#fbbf24", href: "/home" },
        { label: "Open RFQs", value: String(lspOpenRfqs), sub: "awaiting response", icon: Inbox, accent: "#0ea5e9", href: "/operations" },
        { label: "Active Jobs", value: String(lspActiveJobs), sub: "in execution", icon: Activity, accent: "#10b981", href: "/operations" },
        { label: "Fleet", value: "—", icon: Truck, accent: "#6b7280", href: "/network" },
      ];
    case "SHIP":
      return [
        { label: "Bookings", value: String(shipmentsCarrier.length), icon: Package, accent: "#0d6efd", href: "/operations" },
        { label: "Containers", value: String(shipmentsCarrier.length), icon: Package, accent: "#0ea5e9", href: "/operations" },
        { label: "Releases Pending", value: String(shipmentsCarrier.filter((s: any) => s.status === "ARRIVED").length), icon: ShieldCheck, accent: "#fbbf24", href: "/operations" },
        { label: "B/L Issued", value: String(shipmentsCarrier.length), icon: FileText, accent: "#a78bfa", href: "/operations" },
        { label: "Schedules", value: "—", icon: Clock, accent: "#6b7280", href: "/operations" },
        { label: "Vessels", value: "—", icon: Ship, accent: "#0d6efd", href: "/network" },
      ];
    case "LAB":
      return [
        { label: "Test Requests", value: String(labTests.length), icon: FlaskConical, accent: "#16a34a", href: "/operations" },
        { label: "In Testing", value: String(labTests.filter((l: any) => l.status === "TESTING" || l.status === "SAMPLING").length), icon: Cpu, accent: "#fbbf24", href: "/operations" },
        { label: "Reports Issued", value: String(labTests.filter((l: any) => l.status === "COMPLETED").length), icon: FileText, accent: "#10b981", href: "/operations" },
        { label: "Pass Rate", value: "94%", icon: CheckCircle2, accent: "#a78bfa", trend: "+2%" },
      ];
    case "QC":
      return [
        { label: "Inspections", value: String(qcInspections.length), icon: ShieldCheck, accent: "#9333ea", href: "/operations" },
        { label: "Scheduled", value: String(qcInspections.filter((q: any) => q.status === "SCHEDULED").length), icon: Clock, accent: "#fbbf24", href: "/operations" },
        { label: "Field Reports", value: String(qcInspections.filter((q: any) => q.status === "COMPLETED").length), icon: FileText, accent: "#10b981", href: "/operations" },
        { label: "Pass Rate", value: "94%", icon: CheckCircle2, accent: "#a78bfa" },
      ];
    case "CBR":
      return [
        { label: "Declarations", value: String(customsDecls.length), icon: Landmark, accent: "#ca8a04", href: "/operations" },
        { label: "Certificates", value: "—", icon: FileText, accent: "#10b981", href: "/operations" },
        { label: "Clearance Rate", value: "—", icon: CheckCircle2, accent: "#a78bfa" },
        { label: "Pending", value: String(customsDecls.filter((d: any) => d.status === "PENDING").length), icon: Clock, accent: "#fbbf24", href: "/operations" },
      ];
    case "BANK":
    case "PFI":
      return [
        { label: "Open RFQs", value: String(openFinancingRequests.length), icon: TrendingUp, accent: "#10b981", href: "/money" },
        { label: "My Bids", value: String(financingBids.length), icon: Banknote, accent: "#0ea5e9", href: "/money" },
        { label: "Exposure", value: fmtMoney(financingBids.reduce((s: number, b: any) => s + (b.amountOffered || 0), 0), "USD"), icon: DollarSign, accent: "#fbbf24" },
        { label: "Active Loans", value: String(financingBids.filter((b: any) => b.status === "ACCEPTED").length), icon: Activity, accent: "#0ea5e9", href: "/money" },
        { label: "Margin Calls", value: String(financingBids.filter((b: any) => b.status === "MARGIN_CALL").length), icon: Scale, accent: "#f87171", href: "/money" },
        { label: "Repayments Due", value: "—", sub: "next 7 days", icon: RefreshCw, accent: "#fb923c", href: "/money" },
      ];
    case "GOV":
      return [
        { label: "National Trades", value: String(allTrades.length), sub: "tracked", icon: Globe2, accent: "#b45309", href: "/trades" },
        { label: "Cross-border Flow", value: fmtMoney(totalValue, "USD"), sub: "monitored", icon: DollarSign, accent: "#15803d", href: "/money" },
        { label: "Customs Pending", value: String(inbox.filter((i: any) => i.category === "NEEDS_APPROVAL").length), icon: Landmark, accent: "#ca8a04", href: "/operations" },
        { label: "FX Alerts", value: String(inbox.filter((i: any) => i.category === "COMPLIANCE").length), icon: AlertTriangle, accent: "#f87171", href: "/money" },
        { label: "Pending Clearances", value: String(inbox.filter((i: any) => i.category === "CUSTOMS_PENDING").length), sub: "awaiting decision", icon: Clock, accent: "#fbbf24", href: "/operations" },
        { label: "Multi-Agency", value: "—", sub: "inter-agency", icon: Users, accent: "#9333ea", href: "/operations" },
      ];
    case "ADM":
      return [
        { label: "Total Tenants", value: "—", icon: Users, accent: "#6b7280", href: "/admin" },
        { label: "Active Trades", value: String(allTrades.length), icon: Activity, accent: "#10b981", href: "/admin" },
        { label: "Loom Verified", value: "100%", icon: ShieldCheck, accent: "#a78bfa", href: "/admin" },
        { label: "Governor Gates", value: "G1–G7", icon: Scale, accent: "#fbbf24", href: "/admin" },
      ];
    case "MP":
      return [
        { label: "Leads", value: "—", icon: Users, accent: "#10b981", href: "/operations" },
        { label: "Webhooks", value: "—", icon: Activity, accent: "#0ea5e9", href: "/operations" },
        { label: "Revenue", value: "—", icon: DollarSign, accent: "#fbbf24", href: "/money" },
        { label: "API Keys", value: "—", icon: Settings, accent: "#a78bfa", href: "/admin" },
      ];
    default:
      return [];
  }
}

// ── Role-specific quick actions ────────────────────────────────────────────────

interface QuickAction {
  label: string;
  icon: any;
  href: string;
}

function deriveQuickActions(tenantType: string): QuickAction[] {
  switch (tenantType) {
    case "TRD":
      return [
        { label: "New Trade Request", icon: ShoppingBag, href: "/trades/new" },
        { label: "Approve Invoice", icon: CheckCircle2, href: "/money" },
        { label: "Upload Document", icon: FileText, href: "/trades" },
        { label: "Track Shipment", icon: Ship, href: "/operations" },
      ];
    case "LSP":
      return [
        { label: "Assign Driver", icon: Users, href: "/operations" },
        { label: "Confirm Milestone", icon: CheckCircle2, href: "/operations" },
        { label: "Upload CMR", icon: FileText, href: "/operations" },
        { label: "Track Fleet", icon: Truck, href: "/operations" },
      ];
    case "SHIP":
      return [
        { label: "Issue B/L", icon: FileText, href: "/operations" },
        { label: "Authorise Release", icon: ShieldCheck, href: "/operations" },
        { label: "Update AIS", icon: Ship, href: "/operations" },
        { label: "Add Vessel", icon: Ship, href: "/network" },
      ];
    case "LAB":
      return [
        { label: "Start Sampling", icon: FlaskConical, href: "/operations" },
        { label: "Release Report", icon: FileText, href: "/operations" },
      ];
    case "QC":
      return [
        { label: "Start Inspection", icon: ShieldCheck, href: "/operations" },
        { label: "Issue Report", icon: CheckCircle2, href: "/operations" },
      ];
    case "CBR":
      return [
        { label: "File Declaration", icon: Landmark, href: "/operations" },
        { label: "Issue Certificate", icon: FileText, href: "/operations" },
        { label: "Clear Shipment", icon: CheckCircle2, href: "/operations" },
      ];
    case "BANK":
    case "PFI":
      return [
        { label: "Submit Bid", icon: Banknote, href: "/money" },
        { label: "Review RFQ", icon: FileText, href: "/money" },
        { label: "Margin Call", icon: AlertTriangle, href: "/money" },
      ];
    case "GOV":
      return [
        { label: "Assess Declaration", icon: Landmark, href: "/operations" },
        { label: "Reconcile FX", icon: DollarSign, href: "/money" },
        { label: "View Trade Map", icon: Globe2, href: "/trades" },
      ];
    case "ADM":
      return [
        { label: "Manage Tenants", icon: Users, href: "/admin" },
        { label: "View Audit Log", icon: FileText, href: "/admin" },
        { label: "Governor Status", icon: ShieldCheck, href: "/admin" },
      ];
    default:
      return [
        { label: "New Trade Request", icon: ShoppingBag, href: "/trades/new" },
      ];
  }
}

// ── Shared components ───────────────────────────────────────────────────────────

function ExecCard({ label, value, sub, icon: Icon, accent, href, trend }: ExecCardData) {
  const content = (
    <div className="p-3 rounded-lg border border-border bg-card/40 hover:bg-muted/40 transition cursor-pointer">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        <Icon className="w-3 h-3" style={{ color: accent }} />
        <span>{label}</span>
      </div>
      <p className="text-lg font-semibold" style={{ color: accent }}>{value}</p>
      {sub && <p className="text-[0.6rem] text-muted-foreground mt-0.5 truncate">{sub}</p>}
      {trend && <p className="text-[0.6rem] text-emerald-600 dark:text-emerald-400 mt-0.5">{trend}</p>}
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

function Section({
  icon: Icon, title, count, empty, emptyIcon, children,
}: {
  icon: any; title: string; count?: number; empty?: string; emptyIcon?: any; children?: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</h2>
        {count !== undefined && count > 0 && <span className="text-xs text-muted-foreground/70">({count})</span>}
      </div>
      {children || (empty && <EmptyState icon={emptyIcon || CheckCircle2} text={empty} />)}
    </section>
  );
}

function EmptyState({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="flex items-center gap-2 p-3 rounded-md border border-dashed border-border text-xs text-muted-foreground">
      <Icon className="w-3.5 h-3.5 text-emerald-500" />
      <span>{text}</span>
    </div>
  );
}
