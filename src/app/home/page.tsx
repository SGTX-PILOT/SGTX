"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// COCKPIT-Phase 4: /home route — the action-first home.
// ═══════════════════════════════════════════════════════════════════════════════
//
// Answers exactly five questions, nothing more. Each question is a
// numbered task list where each item links to the exact trade + the
// specific action the user must take.
//
//   1. What needs my attention?     (numbered, each → /trades/[ustn])
//   2. What is happening now?        (active trades count → /trades?filter=active)
//   3. What is blocked?              (blockers with owner + link to trade)
//   4. What needs my approval?       (pending approvals → link to trade)
//   5. What changed?                  (important updates, max 7)
//
// Analytics/KPIs are NOT shown here. The home screen exists to give the
// user a clear next action, not a telemetry wall.

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { CockpitShell, shouldShowAdmin } from "@/components/cockpit/CockpitShell";
import { useSession, fetchWithAuth } from "@/lib/cockpit/session";
import { useCockpitLocale } from "@/lib/cockpit/use-locale";
import {
  AlertTriangle, ArrowRight, CheckCircle2, Clock, ListTodo, Activity,
  ChevronRight, Bell,
} from "lucide-react";

interface DashboardData {
  tenant?: { gtid: string; legalName: string; type: string };
  inbox?: any[];
  tradesAsBuyer?: any[];
  tradesAsSeller?: any[];
  activities?: any[];
  invoices?: any[];
}

const STATUS_ACTIVE = new Set([
  "PENDING_SELLER_RESPONSE", "BUYER_SUBMITTED", "QUOTE_ACCEPTED",
  "CONTRACT_SIGNED", "IN_EXECUTION", "INSPECTION_REQUIRED",
  "CUSTOMS_PENDING", "PAYMENT_DUE",
]);

function fmtDate(iso: string | undefined): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en", { day: "numeric", month: "short" }); }
  catch { return iso; }
}

// Derive the specific action + link for an inbox item.
// Each item maps to a trade workspace + a specific action tab.
function deriveAction(item: any, tenantGtid: string): { href: string; actionLabel: string } {
  const ustn = item.trade?.ustn;
  const workspace = ustn ? `/trades/${ustn}` : "/trades";
  const category = item.category || "";

  // Map the inbox category to a specific action.
  switch (category) {
    case "QUOTE_RESPONSE":
      return { href: `${workspace}/documents`, actionLabel: "Review quote" };
    case "CONTRACT_SIGN":
      return { href: `${workspace}/documents`, actionLabel: "Sign contract" };
    case "MILESTONE_CONFIRM":
      return { href: `${workspace}/documents`, actionLabel: "Confirm milestone" };
    case "INVOICE_APPROVE":
      return { href: `${workspace}/payments`, actionLabel: "Approve invoice" };
    case "CUSTOMS_HOLD":
      return { href: `${workspace}/compliance`, actionLabel: "Resolve customs hold" };
    case "INSPECTION_RESULT":
      return { href: `${workspace}/compliance`, actionLabel: "Review inspection" };
    case "FINANCING_BID":
      return { href: `${workspace}/payments`, actionLabel: "Review bid" };
    case "DISPUTE_FILED":
      return { href: `${workspace}/compliance`, actionLabel: "View dispute" };
    default:
      return { href: workspace, actionLabel: "Open trade" };
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

  // Derive the 5 answers from the dashboard data.
  const allTrades = [...(data?.tradesAsBuyer || []), ...(data?.tradesAsSeller || [])];
  const activeTrades = allTrades.filter((t) => STATUS_ACTIVE.has(t.status));
  const inbox = (data?.inbox || []).filter((i) => !i.dismissed);
  const pendingApprovals = inbox.filter((i) => i.category === "NEEDS_APPROVAL" || i.category === "APPROVAL");
  const blockers = inbox.filter((i) => i.category === "BLOCKER" || i.category === "URGENT" || i.priority === "HIGH");
  const attention = inbox.filter((i) => i.priority === "HIGH" || i.priority === "MEDIUM").slice(0, 5);
  const recentActivity = (data?.activities || []).slice(0, 7);

  return (
    <CockpitShell
      roleLabel={payload.role}
      tenantName={data?.tenant?.legalName}
      showAdmin={shouldShowAdmin(data?.tenant?.type)}
    >
      <div className="space-y-6 max-w-3xl">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("home.welcome")}{data?.tenant?.legalName ? `, ${data.tenant.legalName.split(" ")[0]}` : ""}.
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("home.subtitle")}
          </p>
        </header>

        {/* Q1 — What needs my attention? (numbered, each → exact trade + action) */}
        <Section
          icon={ListTodo}
          title={t("home.needsAttention")}
          count={attention.length}
          empty={t("home.noUrgent")}
          emptyIcon={CheckCircle2}
        >
          {attention.length > 0 ? (
            <ol className="space-y-2">
              {attention.map((item, i) => {
                const action = deriveAction(item, payload.tenantGtid!);
                return (
                  <li key={item.id || i}>
                    <Link
                      href={action.href}
                      className="flex items-start gap-3 p-3 rounded-md border border-border hover:bg-muted/40 transition group"
                    >
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[0.65rem] font-semibold inline-flex items-center justify-center">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.title || item.message || "Action required"}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {item.trade?.commodity || "Trade"} · {action.actionLabel}
                        </p>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground flex-shrink-0 mt-1" />
                    </Link>
                  </li>
                );
              })}
            </ol>
          ) : null}
        </Section>

        {/* Q2 — What is happening now? */}
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

        {/* Q3 — What is blocked? (each → exact trade) */}
        <Section
          icon={AlertTriangle}
          title={t("home.blocked")}
          count={blockers.length}
          empty={t("home.noBlockers")}
          emptyIcon={CheckCircle2}
        >
          {blockers.length > 0 ? (
            <ul className="space-y-2">
              {blockers.slice(0, 5).map((b, i) => {
                const action = deriveAction(b, payload.tenantGtid!);
                return (
                  <li key={b.id || i}>
                    <Link href={action.href} className="block p-3 rounded-md border border-red-500/30 bg-red-50/30 dark:bg-red-950/10 hover:bg-red-50/50 dark:hover:bg-red-950/20 transition">
                      <p className="text-sm font-medium">{b.title || b.message}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {b.trade?.commodity || "Trade"} · {action.actionLabel}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </Section>

        {/* Q4 — What needs my approval? (each → exact trade + action) */}
        <Section
          icon={Bell}
          title={t("home.needsApproval")}
          count={pendingApprovals.length}
          empty={t("home.noApprovals")}
          emptyIcon={CheckCircle2}
        >
          {pendingApprovals.length > 0 ? (
            <ul className="space-y-2">
              {pendingApprovals.slice(0, 5).map((a, i) => {
                const action = deriveAction(a, payload.tenantGtid!);
                return (
                  <li key={a.id || i}>
                    <Link href={action.href} className="block p-3 rounded-md border border-border hover:bg-muted/40 transition">
                      <p className="text-sm font-medium">{a.title || a.message}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {a.trade?.commodity || "Trade"} · {action.actionLabel}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </Section>

        {/* Q5 — What changed? (max 7) */}
        <Section icon={Clock} title={t("home.recentChanges")} count={recentActivity.length} empty={t("home.noActivity")} emptyIcon={Clock}>
          {recentActivity.length > 0 ? (
            <ol className="space-y-2">
              {recentActivity.map((a, i) => (
                <li key={a.id || i} className="text-sm flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 mt-1.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground truncate">{a.description || a.action}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {a.actor?.legalName || a.actorGtid || "System"} · {fmtDate(a.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          ) : null}
        </Section>
      </div>
    </CockpitShell>
  );
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
        {count !== undefined && count > 0 && (
          <span className="text-xs text-muted-foreground/70">({count})</span>
        )}
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
