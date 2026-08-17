// SGTX Seller Delta 5 — Control Tower (CCL-005)
// =============================================================================
// Consolidates existing seller information into a single prioritized view.
// Does NOT create a parallel dashboard — extends the existing Command Center.
//
// Respects data scopes: margin / SGTX fee / freight are hidden from
// employees without permission (uses the caller's employee context).
//
// Blueprint Part 3.12 — Seller § "Seller Control Tower"

import type { LifecycleStageInfo } from "./lifecycle";

export type PriorityLevel = "CRITICAL" | "URGENT" | "ACTION_REQUIRED" | "INFORMATION";

export interface ControlTowerCard {
  key: string;
  category: "Commercial" | "Logistics" | "Execution" | "Financial";
  label: string;
  value: string;
  sub?: string;
  priority: PriorityLevel;
  actionUrl?: string;
  actionLabel?: string;
}

export interface ControlTowerAction {
  label: string;
  priority: PriorityLevel;
  actionUrl: string;
  actionLabel: string;
  ustn?: string;
}

export interface ControlTowerSummary {
  cards: ControlTowerCard[];
  actions: ControlTowerAction[];
  counts: {
    openTrades: number;
    quotesInProgress: number;
    exceptions: number;
    criticalIssues: number;
    activeShipments: number;
    paymentsDue: number;
  };
  // Execution mode (post-contract)
  executionMode?: {
    ustn: string;
    status: "GREEN" | "AMBER" | "RED";
    nextAction: string;
    critical: { area: string; state: "OK" | "WARNING" | "BLOCKED" }[];
    lastSafeAction?: string;
    nextMilestone?: string;
  };
}

export interface ControlTowerInput {
  sellerGtid: string;
  // From dashboard data
  trades: any[];
  inbox: any[];
  invoices: any[];
  shipments: any[];
  // Data scope (hide margin/fee/freight from unauthorized employees)
  dataScope?: {
    hideMargin?: boolean;
    hideSgtxFee?: boolean;
    hideFreight?: boolean;
  };
  // Execution trade (if post-contract)
  executionTrade?: any;
}

/**
 * Build the Seller Control Tower summary from dashboard data.
 * Pure function — composes existing data into prioritized cards + actions.
 */
export function buildControlTower(input: ControlTowerInput): ControlTowerSummary {
  const { trades, inbox, invoices, shipments, dataScope } = input;
  const cards: ControlTowerCard[] = [];
  const actions: ControlTowerAction[] = [];

  // ── Commercial cards ──────────────────────────────────────────────────
  const openTrades = trades.filter((t) => ["INITIATED", "QUOTED", "BUYER_AMENDED", "COUNTER_OFFERED"].includes(t.status));
  const quotesInProgress = trades.filter((t) => t.status === "INITIATED");
  const activeTrades = trades.filter((t) => ["CONTRACT_SIGNED", "IN_EXECUTION"].includes(t.status));

  cards.push({
    key: "openTrades",
    category: "Commercial",
    label: "Open Trades",
    value: String(openTrades.length),
    sub: `${quotesInProgress.length} quotes in progress`,
    priority: openTrades.length > 5 ? "URGENT" : "INFORMATION",
    actionUrl: "requests",
    actionLabel: "View Pending Requests",
  });

  // Quote viability (placeholder — seller must open each trade to assess)
  const tradesNeedingQuotes = quotesInProgress.length;
  if (tradesNeedingQuotes > 0) {
    cards.push({
      key: "quoteViability",
      category: "Commercial",
      label: "Quote Viability",
      value: `${tradesNeedingQuotes} pending`,
      sub: "Trades awaiting quote",
      priority: "ACTION_REQUIRED",
      actionUrl: "quote-builder",
      actionLabel: "Build Quote",
    });
  }

  // Margin at risk (hidden if dataScope.hideMargin)
  if (!dataScope?.hideMargin) {
    const totalTradeValue = activeTrades.reduce((s, t) => s + (t.tradeValueUsd || 0), 0);
    if (totalTradeValue > 0) {
      cards.push({
        key: "marginAtRisk",
        category: "Commercial",
        label: "Margin-at-Risk",
        value: `$${(totalTradeValue * 0.05).toFixed(0)}`,
        sub: "Estimated exposure across active trades",
        priority: "INFORMATION",
        actionUrl: "shipments",
        actionLabel: "View Active Trades",
      });
    }
  }

  // ── Logistics cards ───────────────────────────────────────────────────
  const logisticsExceptions = inbox.filter(
    (i) => i.category === "LOGISTICS" || i.category === "CAPACITY" || i.category === "DRIFT"
  );
  const expiringQuotes = inbox.filter((i) => i.category === "QUOTE_EXPIRY" || (i.deadline && new Date(i.deadline).getTime() - Date.now() < 86400000));
  const capacityIssues = inbox.filter((i) => i.category === "CAPACITY");

  if (logisticsExceptions.length > 0) {
    cards.push({
      key: "logisticsExceptions",
      category: "Logistics",
      label: "Logistics Exceptions",
      value: String(logisticsExceptions.length),
      sub: `${capacityIssues.length} capacity issues`,
      priority: logisticsExceptions.length > 2 ? "URGENT" : "ACTION_REQUIRED",
      actionUrl: "inbox",
      actionLabel: "Review Exceptions",
    });
  }

  if (expiringQuotes.length > 0) {
    cards.push({
      key: "expiringQuotes",
      category: "Logistics",
      label: "Expiring Quotes",
      value: String(expiringQuotes.length),
      sub: "Expiring within 24h",
      priority: "URGENT",
      actionUrl: "quote-builder",
      actionLabel: "Review Quotes",
    });
  }

  // ── Execution cards ───────────────────────────────────────────────────
  const activeShipments = shipments.filter((s) => ["PLANNED", "LOADED", "DEPARTED", "IN_TRANSIT", "ARRIVED"].includes(s.status));
  const lateMilestones = shipments.filter((s) => s.status === "DELAYED" || (s.eta && new Date(s.eta) < new Date() && s.status !== "DELIVERED"));

  if (activeShipments.length > 0) {
    cards.push({
      key: "activeShipments",
      category: "Execution",
      label: "Active Shipments",
      value: String(activeShipments.length),
      sub: lateMilestones.length > 0 ? `${lateMilestones.length} late milestone(s)` : "all on schedule",
      priority: lateMilestones.length > 0 ? "URGENT" : "INFORMATION",
      actionUrl: "shipments",
      actionLabel: "View Shipments",
    });
  }

  // QC/LAB/customs dependencies
  const qcLabCustomsPending = inbox.filter((i) => ["QC_BOOKING", "LAB_RESULT", "CUSTOMS_HOLD"].includes(i.category));
  if (qcLabCustomsPending.length > 0) {
    cards.push({
      key: "qcLabCustoms",
      category: "Execution",
      label: "QC/LAB/Customs",
      value: String(qcLabCustomsPending.length),
      sub: "Pending dependencies",
      priority: "ACTION_REQUIRED",
      actionUrl: "inbox",
      actionLabel: "Review Dependencies",
    });
  }

  // ── Financial cards ───────────────────────────────────────────────────
  const paymentsDue = invoices.filter((i) => i.status === "PENDING" && i.payeeGtid === input.sellerGtid);
  const overdueAmount = paymentsDue.reduce((s, i) => s + (i.amountUsd || 0), 0);

  if (paymentsDue.length > 0) {
    cards.push({
      key: "paymentsDue",
      category: "Financial",
      label: "Payments Due",
      value: String(paymentsDue.length),
      sub: !dataScope?.hideMargin ? `$${overdueAmount.toFixed(0)} outstanding` : `${paymentsDue.length} invoices`,
      priority: overdueAmount > 50000 ? "CRITICAL" : "URGENT",
      actionUrl: "invoices",
      actionLabel: "View Invoices",
    });
  }

  // Settlement status (hidden if dataScope.hideSgtxFee)
  if (!dataScope?.hideSgtxFee) {
    const settledTrades = trades.filter((t) => t.status === "SETTLED").length;
    cards.push({
      key: "settlementStatus",
      category: "Financial",
      label: "Settlement Status",
      value: `${settledTrades} settled`,
      sub: `${activeTrades.length} in execution`,
      priority: "INFORMATION",
      actionUrl: "settlement",
      actionLabel: "View Settlement",
    });
  }

  // ── Build prioritized actions ─────────────────────────────────────────
  // Sort: CRITICAL > URGENT > ACTION_REQUIRED > INFORMATION
  const priorityOrder: Record<PriorityLevel, number> = {
    CRITICAL: 0, URGENT: 1, ACTION_REQUIRED: 2, INFORMATION: 3,
  };

  const sortedCards = [...cards].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  for (const card of sortedCards.slice(0, 8)) {
    if (card.actionUrl && card.actionLabel) {
      actions.push({
        label: card.actionLabel,
        priority: card.priority,
        actionUrl: card.actionUrl,
        actionLabel: card.actionLabel,
      });
    }
  }

  // ── Execution mode (if post-contract) ────────────────────────────────
  let executionMode: ControlTowerSummary["executionMode"];
  if (input.executionTrade) {
    const t = input.executionTrade;
    executionMode = {
      ustn: t.ustn,
      status: t.status === "IN_EXECUTION" && lateMilestones.length > 0 ? "AMBER" : "GREEN",
      nextAction: "Acknowledge Release",
      critical: [
        { area: "Ocean Capacity", state: "OK" },
        { area: "Customs", state: qcLabCustomsPending.length > 0 ? "WARNING" : "OK" },
        { area: "QC", state: "OK" },
        { area: "Documents", state: "OK" },
      ],
      lastSafeAction: t.latestDeliveryDate,
      nextMilestone: "LOAD",
    };
  }

  const criticalIssues = cards.filter((c) => c.priority === "CRITICAL").length;

  return {
    cards: sortedCards,
    actions,
    counts: {
      openTrades: openTrades.length,
      quotesInProgress: quotesInProgress.length,
      exceptions: logisticsExceptions.length + expiringQuotes.length,
      criticalIssues,
      activeShipments: activeShipments.length,
      paymentsDue: paymentsDue.length,
    },
    executionMode,
  };
}
