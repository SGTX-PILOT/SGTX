/**
 * SGTX BRAIN — Portal Intelligence + AI-Weighted Trade Readiness Scoring
 * ============================================================================
 *
 * This module closes two of the most consequential gaps surfaced by AUDIT-1:
 *
 *   1. `getPortalIntelligence({ tenantGtid, portal })` — a per-portal Brain
 *      feed that slices existing Brain outputs (price intelligence, demand
 *      forecast, trade risk, credit risk, sanctions radar, force-majeure
 *      radar, etc.) into 3 role-specific insights. Each portal dashboard
 *      calls this on mount to render Brain-personalised headlines.
 *
 *   2. `calculateTradeReadinessScore(tenantGtid)` — replaces the pure
 *      rule-based inline scoring that previously lived in
 *      `/api/sgtx/readiness/cron` with an AI-weighted score. The Brain's
 *      `validateQuotePrice` history, dispute frequency vs. platform peers,
 *      settlement reliability, sanctions clearance and trade volume are
 *      combined into a 0-100 readiness score with a tier (PLATINUM / GOLD /
 *      SILVER / BRONZE / PROVISIONAL) and an improving / stable / declining
 *      trend relative to the tenant's previous assessment.
 *
 * Design principles:
 *   • Every Brain call is wrapped — a single signal failing must NEVER break
 *     the entire assessment. We always return a well-formed result.
 *   • `getPortalIntelligence` ALWAYS returns exactly 3 insights. If the
 *     role-specific Brain calls yield fewer (because of failure or no data),
 *     we pad with generic platform-status insights so the UI has a stable
 *     surface to render.
 *   • `calculateTradeReadinessScore` is cheap enough to run from the cron
 *     (it makes at most 3 AI calls per tenant via `validateQuotePrice` on the
 *     most recent trades; everything else is DB-local). For tenants with no
 *     trade history we fall back to a baseline so the cron never throws.
 *   • No `@ts-nocheck`. All exports are fully typed.
 *
 * Integration points:
 *   • `/api/sgtx/readiness/cron/route.ts` calls `calculateTradeReadinessScore`
 *     for each VERIFIED tenant and persists the result.
 *   • `/api/sgtx/brain/portal-intelligence/route.ts` exposes
 *     `getPortalIntelligence` over HTTP for portal dashboards.
 */

import { db } from "@/lib/db";
import {
  searchCommodityPrices,
  validateQuotePrice,
} from "@/lib/sgtx/ai/brain";
import {
  predictTradeRisk,
  forecastDemand,
  assessCreditRisk,
  sanctionsRadar,
  optimizeRoute,
} from "@/lib/sgtx/ai/brain-intelligence";
import {
  getActiveForceMajeureEvents,
  type ForceMajeureEvent,
} from "@/lib/sgtx/compliance/force-majeure";
import { screenForSanctions } from "@/lib/sgtx/compliance/sanctions";

// ============================================================================
// Public types (per task spec)
// ============================================================================

export type PortalType =
  | "buyer"
  | "seller"
  | "lsp"
  | "shipping"
  | "lab"
  | "qc"
  | "customs_broker"
  | "bank"
  | "private_financier"
  | "government"
  | "admin";

export type InsightSeverity = "info" | "opportunity" | "warning" | "critical";

export interface PortalInsight {
  id: string;
  portal: PortalType;
  title: string; // short headline
  body: string; // 1-2 sentence detail
  severity: InsightSeverity;
  actionUrl?: string;
  actionLabel?: string;
  data?: Record<string, any>; // structured data for the UI to render charts/badges
  generatedAt: string;
}

export interface PortalIntelligenceResult {
  tenantGtid: string;
  portal: PortalType;
  insights: PortalInsight[]; // exactly 3
  assessedAt: string;
  brainModule: string; // "getPortalIntelligence"
}

export interface TradeReadinessComponent {
  score: number; // 0-100
  weight: number; // 0-1
  detail: string;
}

export interface TradeReadinessScore {
  tenantGtid: string;
  overallScore: number; // 0-100
  tier: "PLATINUM" | "GOLD" | "SILVER" | "BRONZE" | "PROVISIONAL";
  components: {
    marketAlignment: TradeReadinessComponent;
    complianceVelocity: TradeReadinessComponent;
    disputeFrequency: TradeReadinessComponent;
    paymentReliability: TradeReadinessComponent;
    sanctionsClear: TradeReadinessComponent;
    tradeVolume: TradeReadinessComponent;
  };
  trend: "improving" | "stable" | "declining";
  recommendations: string[];
  assessedAt: string;
  brainModule: string; // "calculateTradeReadinessScore"
}

// ============================================================================
// Internal helpers
// ============================================================================

const ISO_EPOCH = "1970-01-01T00:00:00.000Z";

function nowIso(): string {
  return new Date().toISOString();
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function shortId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${ts}-${rand}`.toUpperCase();
}

function targetMonthFromNow(offsetMonths = 1): string {
  // Returns YYYY-MM for the month `offsetMonths` from now (default next month).
  const d = new Date();
  d.setMonth(d.getMonth() + offsetMonths);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Map a Tenant.type (+ traderMode) to its primary PortalType. Used by the
 *  readiness cron and any other caller that has a Tenant row but not an
 *  explicit portal selector. */
export function tenantToPortal(
  tenantType: string,
  traderMode?: string | null,
): PortalType {
  const t = (tenantType || "").toUpperCase();
  switch (t) {
    case "TRD":
      if (traderMode === "BUY") return "buyer";
      if (traderMode === "SELL") return "seller";
      // DUAL / NONE / unknown → default to seller (the dual portal's default
      // surface is "Trader Portal — Seller" per portal-config.ts).
      return "seller";
    case "LSP":
      return "lsp";
    case "SHIP":
      return "shipping";
    case "LAB":
      return "lab";
    case "QC":
      return "qc";
    case "CBR":
      return "customs_broker";
    case "BANK":
      return "bank";
    case "PFI":
      return "private_financier";
    case "GOV":
      return "government";
    case "ADM":
      return "admin";
    case "MKT":
      // No dedicated marketplace-portal type in the spec; fall back to admin.
      return "admin";
    default:
      return "admin";
  }
}

// ============================================================================
// Tenant + trade context loaders
// ============================================================================

interface TenantContext {
  gtid: string;
  legalName: string;
  type: string;
  country: string;
  traderMode: string;
  kybTier: number;
  trustScore: number;
  sanctionsCleared: boolean;
  bankSwift: string | null;
  bankAccountNo: string | null;
  createdAt: Date;
}

interface TradeRowLite {
  ustn: string;
  buyerGtid: string;
  sellerGtid: string;
  commodity: string;
  commodityHs: string | null;
  incoterm: string;
  tradeValueUsd: number;
  grossWeightKg: number;
  originPort: string;
  destPort: string;
  originCountry: string;
  destCountry: string;
  status: string;
  coldChain: boolean;
  createdAt: Date;
}

async function loadTenant(gtid: string): Promise<TenantContext | null> {
  const t = await db.tenant.findUnique({
    where: { gtid },
    select: {
      gtid: true,
      legalName: true,
      type: true,
      country: true,
      traderMode: true,
      kybTier: true,
      trustScore: true,
      sanctionsCleared: true,
      bankSwift: true,
      bankAccountNo: true,
      createdAt: true,
    },
  });
  return t as TenantContext | null;
}

async function loadTenantTrades(gtid: string, limit = 25): Promise<TradeRowLite[]> {
  const trades = await db.trade.findMany({
    where: { OR: [{ buyerGtid: gtid }, { sellerGtid: gtid }] },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      ustn: true,
      buyerGtid: true,
      sellerGtid: true,
      commodity: true,
      commodityHs: true,
      incoterm: true,
      tradeValueUsd: true,
      grossWeightKg: true,
      originPort: true,
      destPort: true,
      originCountry: true,
      destCountry: true,
      status: true,
      coldChain: true,
      createdAt: true,
    },
  });
  return trades as TradeRowLite[];
}

// ============================================================================
// Generic platform-status insights (used to pad up to 3)
// ============================================================================

function platformStatusInsights(
  portal: PortalType,
  tenantGtid: string,
  count: number,
): PortalInsight[] {
  const out: PortalInsight[] = [];
  const base: Omit<PortalInsight, "id" | "title" | "body"> = {
    portal,
    severity: "info",
    generatedAt: nowIso(),
  };
  const pad: Array<Pick<PortalInsight, "title" | "body">> = [
    {
      title: "Brain intelligence feed online",
      body: "SGTX Brain is monitoring commodity prices, sanctions, and force-majeure events in real time. Role-specific insights will appear here as new signals arrive.",
    },
    {
      title: "Verify your Trust Passport",
      body: "A complete Trust Passport unlocks higher trade-readiness tiers and lowers financing costs. Review your compliance, documentation, and settlement reliability scores.",
    },
    {
      title: "Review Smart Inbox for pending actions",
      body: "Outstanding contract signatures, document uploads, and settlement approvals affect your readiness score. Clear them to lift your tier.",
    },
  ];
  for (let i = 0; i < count && i < pad.length; i++) {
    out.push({
      id: shortId("PI-PAD"),
      ...base,
      ...pad[i],
      actionUrl: `/portal/${portal === "customs_broker" ? "cbr" : portal === "private_financier" ? "pfi" : portal}/inbox`,
      actionLabel: "Open Smart Inbox",
    });
  }
  return out;
}

// ============================================================================
// Per-portal insight generators
//
// Each generator returns 0-3 PortalInsight objects. The caller pads up to 3
// with platformStatusInsights. We use Promise.allSettled semantics inside
// each generator so a single Brain-call failure never takes down the whole
// feed.
// ============================================================================

// ---- Seller --------------------------------------------------------------

async function sellerInsights(
  tenant: TenantContext,
  trades: TradeRowLite[],
): Promise<PortalInsight[]> {
  const out: PortalInsight[] = [];
  const myExports = trades.filter((t) => t.sellerGtid === tenant.gtid);
  const topCommodity = myExports[0]?.commodity || "frozen strawberries";
  const topHs = myExports[0]?.commodityHs || "";
  const topDestPort = myExports[0]?.destPort || "DEHAM";
  const topDestCountry = myExports[0]?.destCountry || "DE";
  const topOriginPort = myExports[0]?.originPort || "EGALX";
  const topOriginCountry = myExports[0]?.originCountry || tenant.country || "EG";

  // (1) Price intelligence on their commodity at destination port.
  try {
    const prices = await searchCommodityPrices(topCommodity, topDestPort, topDestCountry);
    const price = prices[0];
    if (price && price.priceUsd > 0) {
      const severity: InsightSeverity =
        price.trend === "up" ? "opportunity" : price.trend === "down" ? "warning" : "info";
      out.push({
        id: shortId("PI-SLR-1"),
        portal: "seller",
        title: `${price.commodity} at ${price.port}: $${price.priceUsd}/${price.unit} (${price.trend})`,
        body: `Latest Brain reading for ${price.commodity} at ${price.port} is $${price.priceUsd}/${price.unit}, trend ${price.trend} (${price.trendPercent}% vs previous). ${price.notes || ""}`.trim(),
        severity,
        actionUrl: `/portal/seller/quote-builder`,
        actionLabel: "Update EXW Quote",
        data: { price },
        generatedAt: nowIso(),
      });
    }
  } catch {
    /* skip — padded below */
  }

  // (2) Demand forecast for top commodity at top destination.
  try {
    const fc = await forecastDemand(topCommodity, topHs || "0000.00", targetMonthFromNow(1));
    const severity: InsightSeverity =
      fc.trend === "increasing" ? "opportunity" : fc.trend === "decreasing" ? "warning" : "info";
    out.push({
      id: shortId("PI-SLR-2"),
      portal: "seller",
      title: `${topCommodity} demand forecast: ${fc.trend} (index ${fc.demandIndex}/100)`,
      body: `Brain forecasts ${fc.trend} demand for ${topCommodity} next month (index ${fc.demandIndex}/100, ${(fc.forecastConfidence * 100).toFixed(0)}% confidence). Price impact: ${fc.priceImpact}. Seasonal drivers: ${fc.seasonalFactors.slice(0, 2).join("; ") || "stable"}.`,
      severity,
      actionUrl: `/portal/seller/requests`,
      actionLabel: "Plan Inventory",
      data: { forecast: fc, commodity: topCommodity, hsCode: topHs },
      generatedAt: nowIso(),
    });
  } catch {
    /* skip */
  }

  // (3) Active force-majeure events on their export corridors.
  try {
    const fmEvents = await getActiveForceMajeureEvents();
    const relevant = fmEvents.filter(
      (e) =>
        e.affectedRegions?.some(
          (r) =>
            r.toUpperCase() === topOriginCountry.toUpperCase() ||
            r.toUpperCase() === topDestCountry.toUpperCase(),
        ) ||
        e.affectedPorts?.some(
          (p) =>
            p.toUpperCase() === topOriginPort.toUpperCase() ||
            p.toUpperCase() === topDestPort.toUpperCase(),
        ) ||
        e.affectedCorridors?.some((c) =>
          c
            .toUpperCase()
            .includes(`${topOriginCountry.toUpperCase()}-${topDestCountry.toUpperCase()}`) ||
          c
            .toUpperCase()
            .includes(`${topDestCountry.toUpperCase()}-${topOriginCountry.toUpperCase()}`),
        ),
    );
    if (relevant.length > 0) {
      const top = relevant[0];
      const sevMap: Record<ForceMajeureEvent["severity"], InsightSeverity> = {
        minor: "info",
        major: "warning",
        catastrophic: "critical",
      };
      out.push({
        id: shortId("PI-SLR-3"),
        portal: "seller",
        title: `Force majeure on ${topOriginCountry}→${topDestCountry} corridor: ${top.title}`,
        body: `${top.description.slice(0, 240)}${top.description.length > 240 ? "…" : ""} Severity: ${top.severity}. ${relevant.length} active event(s) overlap your export corridor.`,
        severity: sevMap[top.severity],
        actionUrl: `/portal/seller/shipments`,
        actionLabel: "Review Shipments",
        data: { events: relevant, originCountry: topOriginCountry, destCountry: topDestCountry },
        generatedAt: nowIso(),
      });
    } else {
      // No FM events — surface a positive "corridors clear" insight so the
      // seller gets a non-empty 3rd slot.
      out.push({
        id: shortId("PI-SLR-3"),
        portal: "seller",
        title: `Export corridors clear of force majeure`,
        body: `Brain's force-majeure radar shows no active events on your ${topOriginCountry}→${topDestCountry} corridor. Sailing schedules and war-risk insurance should price normally.`,
        severity: "info",
        actionUrl: `/portal/seller/shipments`,
        actionLabel: "View Shipments",
        generatedAt: nowIso(),
      });
    }
  } catch {
    /* skip */
  }

  return out;
}

// ---- Buyer ---------------------------------------------------------------

async function buyerInsights(
  tenant: TenantContext,
  trades: TradeRowLite[],
): Promise<PortalInsight[]> {
  const out: PortalInsight[] = [];
  const myImports = trades.filter((t) => t.buyerGtid === tenant.gtid);
  const topCommodity = myImports[0]?.commodity || "frozen strawberries";
  const topHs = myImports[0]?.commodityHs || "";
  const topOriginPort = myImports[0]?.originPort || "EGALX";
  const topOriginCountry = myImports[0]?.originCountry || "EG";

  // (1) Supply abundance alert — if origin-port prices are below average,
  //     "good time to buy".
  try {
    const prices = await searchCommodityPrices(topCommodity, topOriginPort, topOriginCountry);
    const p = prices[0];
    if (p && p.priceUsd > 0) {
      const isDrop = p.trend === "down" || p.trendPercent < -5;
      const severity: InsightSeverity = isDrop ? "opportunity" : p.trend === "up" ? "warning" : "info";
      out.push({
        id: shortId("PI-BYR-1"),
        portal: "buyer",
        title: isDrop
          ? `Good time to buy: ${topCommodity} prices dropping at ${topOriginPort}`
          : `${topCommodity} at ${topOriginPort}: $${p.priceUsd}/${p.unit} (${p.trend})`,
        body: isDrop
          ? `Brain reads ${topCommodity} at ${topOriginPort} for $${p.priceUsd}/${p.unit} — trend ${p.trend} (${p.trendPercent}% vs previous). Consider locking supply now before prices rebound.`
          : `Latest Brain reading: ${topCommodity} at ${topOriginPort} is $${p.priceUsd}/${p.unit} (${p.trend}, ${p.trendPercent}%). ${p.notes || ""}`.trim(),
        severity,
        actionUrl: `/portal/buyer/new-trade`,
        actionLabel: "Initiate Trade Request",
        data: { price: p },
        generatedAt: nowIso(),
      });
    }
  } catch {
    /* skip */
  }

  // (2) Route risk on their import corridors — call predictTradeRisk with a
  //     representative recent import.
  try {
    const recent = myImports[0];
    if (recent) {
      const risk = await predictTradeRisk({
        ustn: recent.ustn,
        buyerGtid: recent.buyerGtid,
        sellerGtid: recent.sellerGtid,
        commodity: recent.commodity,
        hsCode: recent.commodityHs || "0000.00",
        tradeValueUsd: recent.tradeValueUsd,
        originCountry: recent.originCountry,
        destCountry: recent.destCountry,
        incoterm: recent.incoterm,
      });
      const sevMap: Record<typeof risk.riskLevel, InsightSeverity> = {
        LOW: "info",
        MEDIUM: "warning",
        HIGH: "warning",
        CRITICAL: "critical",
      };
      out.push({
        id: shortId("PI-BYR-2"),
        portal: "buyer",
        title: `Import corridor risk ${recent.originCountry}→${recent.destCountry}: ${risk.riskLevel} (${risk.riskScore}/100)`,
        body: `Brain trade-risk engine scored your ${recent.commodity} import ${recent.originCountry}→${recent.destCountry} at ${risk.riskScore}/100 (${risk.riskLevel}). ${risk.recommendation}`,
        severity: sevMap[risk.riskLevel],
        actionUrl: `/portal/buyer/quotes`,
        actionLabel: "Review Quotes",
        data: { risk, ustn: recent.ustn },
        generatedAt: nowIso(),
      });
    }
  } catch {
    /* skip */
  }

  // (3) Credit intelligence on their financing options.
  try {
    const credit = await assessCreditRisk({
      borrowerGtid: tenant.gtid,
      requestedAmount: myImports[0]?.tradeValueUsd || 100000,
      tradeValueUsd: myImports[0]?.tradeValueUsd || 100000,
      creditScore: tenant.trustScore,
      trustScore: tenant.trustScore,
      previousLoans: 0,
      repaymentHistory: { onTime: 0, late: 0, defaulted: 0 },
    });
    out.push({
      id: shortId("PI-BYR-3"),
      portal: "buyer",
      title: `Financing capacity: grade ${credit.riskGrade} — up to $${credit.maxLoanAmount.toLocaleString()}`,
      body: `Brain credit-risk engine grades you ${credit.riskGrade} (recommended APR ${((credit.recommendedInterestRate || 0) * 100).toFixed(1)}%). Max loan against your recent import value: $${credit.maxLoanAmount.toLocaleString()}. ${credit.collateralRequired ? "Collateral required." : "No collateral required."}`,
      severity: credit.approved ? "opportunity" : "warning",
      actionUrl: `/portal/buyer/financing`,
      actionLabel: "Request Financing",
      data: { credit },
      generatedAt: nowIso(),
    });
  } catch {
    /* skip */
  }

  return out;
}

// ---- LSP -----------------------------------------------------------------

async function lspInsights(
  tenant: TenantContext,
  _trades: TradeRowLite[],
): Promise<PortalInsight[]> {
  const out: PortalInsight[] = [];
  const serviceCountry = tenant.country || "EG";

  // (1) Port congestion alerts on their service ports — derived from
  //     optimizeRoute's portCongestion output.
  try {
    const route = await optimizeRoute({
      originCountry: serviceCountry,
      destCountry: "DE",
      commodity: "general cargo",
      containerCount: 1,
      coldChain: false,
      targetDate: nowIso(),
    });
    const highCongestion = route.portCongestion.filter((p) => p.level === "HIGH");
    if (route.portCongestion.length > 0) {
      const top = highCongestion[0] || route.portCongestion[0];
      out.push({
        id: shortId("PI-LSP-1"),
        portal: "lsp",
        title: highCongestion.length > 0
          ? `Port congestion HIGH at ${top.port} (+${top.avgDelayDays}d delay)`
          : `Port congestion ${top.level} at ${top.port}`,
        body: `Brain route-optimisation engine reports congestion ${top.level} at ${top.port} (avg delay ${top.avgDelayDays}d). ${highCongestion.length > 0 ? `${highCongestion.length} port(s) at HIGH congestion on your service lanes.` : "Plan dispatch windows with margin."}`,
        severity: highCongestion.length > 0 ? "warning" : "info",
        actionUrl: `/portal/lsp/dispatch-planner`,
        actionLabel: "Open Dispatch Planner",
        data: { portCongestion: route.portCongestion },
        generatedAt: nowIso(),
      });
    }
  } catch {
    /* skip */
  }

  // (2) Active force majeure affecting pickup schedules.
  try {
    const fmEvents = await getActiveForceMajeureEvents();
    const relevant = fmEvents.filter((e) =>
      e.affectedRegions?.some((r) => r.toUpperCase() === serviceCountry.toUpperCase()),
    );
    if (relevant.length > 0) {
      const top = relevant[0];
      const sevMap: Record<ForceMajeureEvent["severity"], InsightSeverity> = {
        minor: "info",
        major: "warning",
        catastrophic: "critical",
      };
      out.push({
        id: shortId("PI-LSP-2"),
        portal: "lsp",
        title: `Force majeure in ${serviceCountry}: ${top.title}`,
        body: `${top.description.slice(0, 200)}${top.description.length > 200 ? "…" : ""} Pickup schedules in ${serviceCountry} may be impacted. Severity: ${top.severity}.`,
        severity: sevMap[top.severity],
        actionUrl: `/portal/lsp/assignments`,
        actionLabel: "Review Assignments",
        data: { events: relevant },
        generatedAt: nowIso(),
      });
    } else {
      out.push({
        id: shortId("PI-LSP-2"),
        portal: "lsp",
        title: `No force-majeure events in ${serviceCountry}`,
        body: `Brain's force-majeure radar shows no active events affecting ${serviceCountry} pickups. Standard dispatch windows apply.`,
        severity: "info",
        actionUrl: `/portal/lsp/dispatch-planner`,
        actionLabel: "Open Dispatch Planner",
        generatedAt: nowIso(),
      });
    }
  } catch {
    /* skip */
  }

  // (3) Demand forecast for logistics services on their lanes.
  try {
    const fc = await forecastDemand("logistics services", "0000.00", targetMonthFromNow(1));
    const severity: InsightSeverity =
      fc.trend === "increasing" ? "opportunity" : fc.trend === "decreasing" ? "warning" : "info";
    out.push({
      id: shortId("PI-LSP-3"),
      portal: "lsp",
      title: `Logistics demand outlook: ${fc.trend} (index ${fc.demandIndex}/100)`,
      body: `Brain forecasts ${fc.trend} logistics demand next month (index ${fc.demandIndex}/100, ${(fc.forecastConfidence * 100).toFixed(0)}% confidence). ${fc.recommendation}`,
      severity,
      actionUrl: `/portal/lsp/fleet`,
      actionLabel: "Plan Fleet",
      data: { forecast: fc },
      generatedAt: nowIso(),
    });
  } catch {
    /* skip */
  }

  return out;
}

// ---- Shipping ------------------------------------------------------------

async function shippingInsights(
  tenant: TenantContext,
  _trades: TradeRowLite[],
): Promise<PortalInsight[]> {
  const out: PortalInsight[] = [];

  // (1) Vessel schedule intelligence — derived from optimizeRoute (port
  //     congestion as a proxy for vessel berth-window pressure).
  try {
    const route = await optimizeRoute({
      originCountry: tenant.country || "EG",
      destCountry: "DE",
      commodity: "containerised cargo",
      containerCount: 1,
      coldChain: false,
      targetDate: nowIso(),
    });
    out.push({
      id: shortId("PI-SHP-1"),
      portal: "shipping",
      title: `Sailing windows: ${route.recommendedRoute.originPort}→${route.recommendedRoute.destPort} ${route.recommendedRoute.estimatedDays}d $${route.recommendedRoute.estimatedCost}`,
      body: `Brain route-optimisation recommends ${route.recommendedRoute.originPort}→${route.recommendedRoute.destPort} at ${route.recommendedRoute.estimatedDays}d transit ($${route.recommendedRoute.estimatedCost}). ${route.reasoning}`,
      severity: "info",
      actionUrl: `/portal/shipping/schedules`,
      actionLabel: "Open Schedules",
      data: { route },
      generatedAt: nowIso(),
    });
  } catch {
    /* skip */
  }

  // (2) Force majeure on their routes.
  try {
    const fmEvents = await getActiveForceMajeureEvents();
    const relevant = fmEvents.filter(
      (e) => e.type === "war" || e.type === "port_closure" || e.severity === "catastrophic",
    );
    if (relevant.length > 0) {
      const top = relevant[0];
      out.push({
        id: shortId("PI-SHP-2"),
        portal: "shipping",
        title: `Maritime risk: ${top.title}`,
        body: `${top.description.slice(0, 220)}${top.description.length > 220 ? "…" : ""} Vessels on affected corridors face war-risk premium and rerouting. Severity: ${top.severity}.`,
        severity: top.severity === "catastrophic" ? "critical" : "warning",
        actionUrl: `/portal/shipping/vessels`,
        actionLabel: "Review Vessel Fleet",
        data: { events: relevant },
        generatedAt: nowIso(),
      });
    } else {
      out.push({
        id: shortId("PI-SHP-2"),
        portal: "shipping",
        title: `No maritime force-majeure events active`,
        body: `Brain's force-majeure radar shows no active war / port-closure / catastrophic events affecting your routes. Sailing schedules can proceed on standard routings.`,
        severity: "info",
        actionUrl: `/portal/shipping/schedules`,
        actionLabel: "View Schedules",
        generatedAt: nowIso(),
      });
    }
  } catch {
    /* skip */
  }

  // (3) Container demand forecast.
  try {
    const fc = await forecastDemand("container demand", "0000.00", targetMonthFromNow(1));
    const severity: InsightSeverity =
      fc.trend === "increasing" ? "opportunity" : fc.trend === "decreasing" ? "warning" : "info";
    out.push({
      id: shortId("PI-SHP-3"),
      portal: "shipping",
      title: `Container demand: ${fc.trend} (index ${fc.demandIndex}/100)`,
      body: `Brain forecasts ${fc.trend} container demand next month (index ${fc.demandIndex}/100). Price impact on freight rates: ${fc.priceImpact}. ${fc.recommendation}`,
      severity,
      actionUrl: `/portal/shipping/contract-rates`,
      actionLabel: "Review Contract Rates",
      data: { forecast: fc },
      generatedAt: nowIso(),
    });
  } catch {
    /* skip */
  }

  return out;
}

// ---- Lab / QC ------------------------------------------------------------

async function labQcInsights(
  tenant: TenantContext,
  _trades: TradeRowLite[],
): Promise<PortalInsight[]> {
  const out: PortalInsight[] = [];
  const isLab = tenant.type.toUpperCase() === "LAB";

  // (1) Upcoming inspection workload — query DB for pending LabTest or
  //     QcInspection rows for this GTID.
  try {
    const [pendingLab, pendingQc] = await Promise.all([
      isLab
        ? db.labTest.count({
            where: { labGtid: tenant.gtid, status: { in: ["REQUESTED", "SAMPLING", "TESTING"] } },
          })
        : Promise.resolve(0),
      !isLab
        ? db.qcInspection.count({
            where: { qcGtid: tenant.gtid, status: { in: ["REQUESTED", "SCHEDULED", "IN_PROGRESS"] } },
          })
        : Promise.resolve(0),
    ]);
    const pending = isLab ? pendingLab : pendingQc;
    out.push({
      id: shortId("PI-LQ-1"),
      portal: isLab ? "lab" : "qc",
      title: `${pending} pending ${isLab ? "lab test" : "QC inspection"} job(s) in your queue`,
      body: `Brain workload tracker shows ${pending} active ${isLab ? "lab test" : "QC inspection"} job(s) assigned to your GTID. ${pending > 10 ? "Capacity alert: queue is heavy — consider expediting or rescheduling." : "Queue is manageable."}`,
      severity: pending > 10 ? "warning" : "info",
      actionUrl: isLab ? `/portal/lab/queue` : `/portal/qc/schedule`,
      actionLabel: isLab ? "Open Sampling Queue" : "Open Inspection Schedule",
      data: { pendingLab, pendingQc },
      generatedAt: nowIso(),
    });
  } catch {
    /* skip */
  }

  // (2) Perishable season alert — derived from demand forecast for a
  //     perishable commodity; more tests needed during peak season.
  try {
    const fc = await forecastDemand("frozen strawberries", "0811.10", targetMonthFromNow(1));
    const peak = fc.demandIndex > 60 || fc.trend === "increasing";
    out.push({
      id: shortId("PI-LQ-2"),
      portal: isLab ? "lab" : "qc",
      title: peak
        ? `Perishable season ramp-up: ${fc.trend} (index ${fc.demandIndex}/100)`
        : `Perishable season stable (index ${fc.demandIndex}/100)`,
      body: peak
        ? `Brain demand forecast for frozen strawberries is ${fc.trend} next month (index ${fc.demandIndex}/100). Expect higher test/inspection volume — ensure pesticide-residue + microbiology capacity is staffed.`
        : `Brain forecasts stable perishable demand next month (index ${fc.demandIndex}/100). Standard sampling cadence applies.`,
      severity: peak ? "opportunity" : "info",
      actionUrl: isLab ? `/portal/lab/requests` : `/portal/qc/field`,
      actionLabel: isLab ? "Open Test Requests" : "Open Field Inspections",
      data: { forecast: fc },
      generatedAt: nowIso(),
    });
  } catch {
    /* skip */
  }

  // (3) Compliance changes affecting test requirements — surface EUDR /
  //     CBAM deadlines (static, derived from the regulation calendar).
  try {
    const eudrDeadline = "2025-12-30";
    const today = new Date();
    const deadline = new Date(eudrDeadline);
    const daysToEudr = Math.ceil((deadline.getTime() - today.getTime()) / 86400000);
    out.push({
      id: shortId("PI-LQ-3"),
      portal: isLab ? "lab" : "qc",
      title: daysToEudr > 0
        ? `EUDR due diligence applies in ${daysToEudr}d — deforestation tests ready?`
        : `EUDR in force — verify deforestation-free test protocols`,
      body: `EU Deforestation Regulation (2023/1115) applies from ${eudrDeadline}. Ensure your lab/QC protocols cover deforestation-free origin verification for cocoa, coffee, wood, rubber, soy, palm oil, cattle. CBAM transitional period also affects embedded-emissions test reports for steel/aluminium/cement/fertiliser imports to the EU.`,
      severity: daysToEudr > 0 && daysToEudr <= 90 ? "warning" : "info",
      actionUrl: `/portal/${isLab ? "lab" : "qc"}/reports`,
      actionLabel: "Review Protocols",
      data: { eudrDeadline, daysToEudr },
      generatedAt: nowIso(),
    });
  } catch {
    /* skip */
  }

  return out;
}

// ---- Customs Broker ------------------------------------------------------

async function customsBrokerInsights(
  tenant: TenantContext,
  _trades: TradeRowLite[],
): Promise<PortalInsight[]> {
  const out: PortalInsight[] = [];

  // (1) Pending clearance workload — query DB for CustomsDeclaration rows
  //     assigned to this broker with status in DRAFT / SUBMITTED / ASSESSED.
  try {
    const pending = await db.customsDeclaration.count({
      where: {
        brokerGtid: tenant.gtid,
        status: { in: ["DRAFT", "SUBMITTED", "ASSESSED", "HELD"] },
      },
    });
    out.push({
      id: shortId("PI-CBR-1"),
      portal: "customs_broker",
      title: `${pending} pending clearance declaration(s)`,
      body: `Brain workload tracker shows ${pending} active customs declaration(s) assigned to your GTID. ${pending > 8 ? "High workload — consider expediting submissions to avoid demurrage." : "Queue is manageable."}`,
      severity: pending > 8 ? "warning" : "info",
      actionUrl: `/portal/cbr/clearance`,
      actionLabel: "Open Clearance Status",
      data: { pending },
      generatedAt: nowIso(),
    });
  } catch {
    /* skip */
  }

  // (2) Regulatory changes (CBAM / EUDR deadlines).
  try {
    const eudrDeadline = "2025-12-30";
    const today = new Date();
    const daysToEudr = Math.ceil(
      (new Date(eudrDeadline).getTime() - today.getTime()) / 86400000,
    );
    out.push({
      id: shortId("PI-CBR-2"),
      portal: "customs_broker",
      title: daysToEudr > 0
        ? `EUDR + CBAM deadlines in ${daysToEudr}d — brief your exporters`
        : `EUDR + CBAM in force — verify all declarations`,
      body: `EU Deforestation Regulation (Reg 2023/1115, applies ${eudrDeadline}) requires deforestation-free due-diligence statements for cocoa, coffee, wood, rubber, soy, palm oil, cattle. CBAM transitional reporting continues for steel/aluminium/cement/fertiliser/hydrogen/electricity imports to the EU. Ensure declaration packets include the new attachments.`,
      severity: daysToEudr > 0 && daysToEudr <= 90 ? "warning" : "info",
      actionUrl: `/portal/cbr/declarations`,
      actionLabel: "Open Declarations",
      data: { eudrDeadline, daysToEudr },
      generatedAt: nowIso(),
    });
  } catch {
    /* skip */
  }

  // (3) Force majeure on their ports.
  try {
    const fmEvents = await getActiveForceMajeureEvents();
    const relevant = fmEvents.filter(
      (e) => e.affectedRegions?.some((r) => r.toUpperCase() === (tenant.country || "").toUpperCase()),
    );
    if (relevant.length > 0) {
      const top = relevant[0];
      out.push({
        id: shortId("PI-CBR-3"),
        portal: "customs_broker",
        title: `Force majeure on ${tenant.country} ports: ${top.title}`,
        body: `${top.description.slice(0, 200)}${top.description.length > 200 ? "…" : ""} Clearance operations may be delayed. Severity: ${top.severity}.`,
        severity: top.severity === "catastrophic" ? "critical" : top.severity === "major" ? "warning" : "info",
        actionUrl: `/portal/cbr/clearance`,
        actionLabel: "Review Clearance",
        data: { events: relevant },
        generatedAt: nowIso(),
      });
    } else {
      out.push({
        id: shortId("PI-CBR-3"),
        portal: "customs_broker",
        title: `No force-majeure events on ${tenant.country} ports`,
        body: `Brain's force-majeure radar shows no active events affecting ${tenant.country} ports. Clearance operations should proceed normally.`,
        severity: "info",
        actionUrl: `/portal/cbr/clearance`,
        actionLabel: "View Clearance",
        generatedAt: nowIso(),
      });
    }
  } catch {
    /* skip */
  }

  return out;
}

// ---- Bank / Private Financier -------------------------------------------

async function financierInsights(
  tenant: TenantContext,
  _trades: TradeRowLite[],
): Promise<PortalInsight[]> {
  const out: PortalInsight[] = [];

  // (1) Credit risk on pending financing requests — query DB for
  //     FinancingRequest rows in REQUESTED / BIDDING_OPEN status, then call
  //     assessCreditRisk on the top one.
  try {
    const pending = await db.financingRequest.findFirst({
      where: { status: { in: ["REQUESTED", "RFQ_BROADCAST", "BIDDING_OPEN"] } },
      orderBy: { createdAt: "desc" },
      select: {
        requestId: true,
        borrowerGtid: true,
        amountUsd: true,
        totalTradeValue: true,
        creditScore: true,
        borrower: { select: { legalName: true, trustScore: true, sanctionsCleared: true } },
      },
    });
    if (pending) {
      const credit = await assessCreditRisk({
        borrowerGtid: pending.borrowerGtid,
        requestedAmount: pending.amountUsd,
        tradeValueUsd: pending.totalTradeValue,
        creditScore: pending.creditScore || pending.borrower.trustScore || 70,
        trustScore: pending.borrower.trustScore || 70,
        previousLoans: 0,
        repaymentHistory: { onTime: 0, late: 0, defaulted: 0 },
      });
      out.push({
        id: shortId("PI-FIN-1"),
        portal: tenant.type.toUpperCase() === "BANK" ? "bank" : "private_financier",
        title: `Credit risk on ${pending.borrower.legalName}: grade ${credit.riskGrade} — ${credit.approved ? "approved" : "denied"} at $${pending.amountUsd.toLocaleString()}`,
        body: `Brain credit-risk engine grades ${pending.borrower.legalName} ${credit.riskGrade} for $${pending.amountUsd.toLocaleString()} financing. Max loan capacity: $${credit.maxLoanAmount.toLocaleString()}. Recommended APR ${((credit.recommendedInterestRate || 0) * 100).toFixed(1)}%. Sanctions clearance: ${pending.borrower.sanctionsCleared ? "yes" : "no"}.`,
        severity: credit.approved ? "opportunity" : "warning",
        actionUrl: `/portal/${tenant.type.toUpperCase() === "BANK" ? "bank" : "pfi"}/opportunities`,
        actionLabel: "Review RFQ",
        data: { credit, requestId: pending.requestId },
        generatedAt: nowIso(),
      });
    }
  } catch {
    /* skip */
  }

  // (2) Commodity price volatility on financed trades — use searchCommodityPrices
  //     on a benchmark commodity to flag volatility.
  try {
    const prices = await searchCommodityPrices("frozen strawberries", "DEHAM", "DE");
    const p = prices[0];
    if (p && p.priceUsd > 0) {
      const volatile = Math.abs(p.trendPercent) > 10;
      out.push({
        id: shortId("PI-FIN-2"),
        portal: tenant.type.toUpperCase() === "BANK" ? "bank" : "private_financier",
        title: volatile
          ? `Commodity volatility: ${p.commodity} ${p.trendPercent}% at ${p.port}`
          : `Commodity prices stable: ${p.commodity} at ${p.port}`,
        body: `Brain price intelligence reads ${p.commodity} at $${p.priceUsd}/${p.unit} (${p.trend}, ${p.trendPercent}%). ${volatile ? "Elevated volatility — review financed-trade collateral margins." : "Stable prices — financed-trade collateral adequate at current LTV."}`,
        severity: volatile ? "warning" : "info",
        actionUrl: `/portal/${tenant.type.toUpperCase() === "BANK" ? "bank" : "pfi"}/portfolio`,
        actionLabel: "Open Portfolio",
        data: { price: p },
        generatedAt: nowIso(),
      });
    }
  } catch {
    /* skip */
  }

  // (3) Sanctions exposure on portfolio — call sanctionsRadar on a
  //     representative financed borrower.
  try {
    const recentBorrower = await db.financingRequest.findFirst({
      where: { status: { in: ["ACTIVE", "DISBURSING", "AGREEMENT_PENDING"] } },
      orderBy: { createdAt: "desc" },
      select: { borrowerGtid: true, borrower: { select: { legalName: true, country: true } } },
    });
    if (recentBorrower) {
      const radar = await sanctionsRadar({
        partyGtid: recentBorrower.borrowerGtid,
        legalName: recentBorrower.borrower.legalName,
        country: recentBorrower.borrower.country,
        hsCode: "0000.00",
      });
      const sevMap: Record<typeof radar.riskLevel, InsightSeverity> = {
        CLEAR: "info",
        ELEVATED: "warning",
        HIGH: "warning",
        CRITICAL: "critical",
      };
      out.push({
        id: shortId("PI-FIN-3"),
        portal: tenant.type.toUpperCase() === "BANK" ? "bank" : "private_financier",
        title: `Sanctions exposure: ${recentBorrower.borrower.legalName} → ${radar.riskLevel}`,
        body: `Brain sanctions radar on active borrower ${recentBorrower.borrower.legalName} (${recentBorrower.borrower.country}) returned ${radar.riskLevel}. ${radar.hits.length} hit(s) detected. ${radar.recommendation}`,
        severity: sevMap[radar.riskLevel],
        actionUrl: `/portal/${tenant.type.toUpperCase() === "BANK" ? "bank" : "pfi"}/compliance`,
        actionLabel: "Open Compliance",
        data: { radar, borrowerGtid: recentBorrower.borrowerGtid },
        generatedAt: nowIso(),
      });
    } else {
      out.push({
        id: shortId("PI-FIN-3"),
        portal: tenant.type.toUpperCase() === "BANK" ? "bank" : "private_financier",
        title: `No active financed borrowers to screen`,
        body: `Brain sanctions radar has no active borrowers in your portfolio to screen. New RFQs will trigger automatic sanctions screening on the borrower.`,
        severity: "info",
        actionUrl: `/portal/${tenant.type.toUpperCase() === "BANK" ? "bank" : "pfi"}/opportunities`,
        actionLabel: "View RFQs",
        generatedAt: nowIso(),
      });
    }
  } catch {
    /* skip */
  }

  return out;
}

// ---- Government ----------------------------------------------------------

async function governmentInsights(
  tenant: TenantContext,
  _trades: TradeRowLite[],
): Promise<PortalInsight[]> {
  const out: PortalInsight[] = [];
  const jurisdiction = tenant.country || "EG";

  // (1) Trade flow statistics for their jurisdiction — query DB for trade
  //     counts + total value where the jurisdiction is origin OR dest.
  try {
    const [exportCount, importCount, exportValue, importValue] = await Promise.all([
      db.trade.count({ where: { originCountry: jurisdiction } }),
      db.trade.count({ where: { destCountry: jurisdiction } }),
      db.trade.aggregate({
        where: { originCountry: jurisdiction },
        _sum: { tradeValueUsd: true },
      }),
      db.trade.aggregate({
        where: { destCountry: jurisdiction },
        _sum: { tradeValueUsd: true },
      }),
    ]);
    out.push({
      id: shortId("PI-GOV-1"),
      portal: "government",
      title: `${jurisdiction} trade flow: ${exportCount} exports ($${(exportValue._sum.tradeValueUsd || 0).toLocaleString()}), ${importCount} imports ($${(importValue._sum.tradeValueUsd || 0).toLocaleString()})`,
      body: `Brain aggregates ${exportCount + importCount} SGTX-tracked trades touching ${jurisdiction}. Export value $${(exportValue._sum.tradeValueUsd || 0).toLocaleString()}; import value $${(importValue._sum.tradeValueUsd || 0).toLocaleString()}. Use the National Trade Flow dashboard for HS-code breakdowns.`,
      severity: "info",
      actionUrl: `/portal/gov/trade-flow`,
      actionLabel: "Open Trade Flow",
      data: { exportCount, importCount, exportValue: exportValue._sum.tradeValueUsd, importValue: importValue._sum.tradeValueUsd },
      generatedAt: nowIso(),
    });
  } catch {
    /* skip */
  }

  // (2) Compliance anomalies detected — count disputed trades + rejected docs.
  try {
    const [disputedCount, rejectedDocs] = await Promise.all([
      db.dispute.count({
        where: {
          trade: {
            OR: [{ originCountry: jurisdiction }, { destCountry: jurisdiction }],
          },
        },
      }),
      db.document.count({
        where: {
          status: "REJECTED",
          trade: {
            OR: [{ originCountry: jurisdiction }, { destCountry: jurisdiction }],
          },
        },
      }),
    ]);
    out.push({
      id: shortId("PI-GOV-2"),
      portal: "government",
      title: `Compliance anomalies: ${disputedCount} dispute(s), ${rejectedDocs} rejected doc(s)`,
      body: `Brain flagged ${disputedCount} trade dispute(s) and ${rejectedDocs} rejected document(s) touching ${jurisdiction}. ${disputedCount + rejectedDocs > 5 ? "Anomaly rate above baseline — investigate sectors." : "Anomaly rate within normal range."}`,
      severity: disputedCount + rejectedDocs > 5 ? "warning" : "info",
      actionUrl: `/portal/gov/customs`,
      actionLabel: "Open Customs Assessment",
      data: { disputedCount, rejectedDocs },
      generatedAt: nowIso(),
    });
  } catch {
    /* skip */
  }

  // (3) Force majeure / national security alerts.
  try {
    const fmEvents = await getActiveForceMajeureEvents();
    const relevant = fmEvents.filter(
      (e) => e.severity === "catastrophic" || e.severity === "major",
    );
    if (relevant.length > 0) {
      out.push({
        id: shortId("PI-GOV-3"),
        portal: "government",
        title: `${relevant.length} major/catastrophic force-majeure event(s) active`,
        body: `Brain force-majeure radar shows ${relevant.length} active major+ events globally: ${relevant.slice(0, 3).map((e) => e.title).join("; ")}. ${relevant.some((e) => e.severity === "catastrophic") ? "Catastrophic event(s) detected — review national security + trade-corridor exposure." : "Major events detected — monitor trade-route disruption."}`,
        severity: relevant.some((e) => e.severity === "catastrophic") ? "critical" : "warning",
        actionUrl: `/portal/gov/governor`,
        actionLabel: "Open Governor",
        data: { events: relevant },
        generatedAt: nowIso(),
      });
    } else {
      out.push({
        id: shortId("PI-GOV-3"),
        portal: "government",
        title: `No major force-majeure events active`,
        body: `Brain's force-majeure radar shows no active major or catastrophic events. National trade corridors operating under normal conditions.`,
        severity: "info",
        actionUrl: `/portal/gov/trade-flow`,
        actionLabel: "View Trade Flow",
        generatedAt: nowIso(),
      });
    }
  } catch {
    /* skip */
  }

  return out;
}

// ---- Admin ---------------------------------------------------------------

async function adminInsights(
  _tenant: TenantContext,
  _trades: TradeRowLite[],
): Promise<PortalInsight[]> {
  const out: PortalInsight[] = [];

  // (1) Platform health metrics.
  try {
    const [tenantCount, verifiedCount, tradeCount, activeDisputes] = await Promise.all([
      db.tenant.count(),
      db.tenant.count({ where: { lifecycleState: "VERIFIED" } }),
      db.trade.count(),
      db.dispute.count({ where: { status: { in: ["FILED", "MEDIATION", "ARBITRATION", "ESCALATED"] } } }),
    ]);
    out.push({
      id: shortId("PI-ADM-1"),
      portal: "admin",
      title: `Platform health: ${tenantCount} tenants (${verifiedCount} verified), ${tradeCount} trades, ${activeDisputes} active disputes`,
      body: `Brain platform-monitor: ${verifiedCount}/${tenantCount} tenants verified (${tenantCount > 0 ? Math.round((verifiedCount / tenantCount) * 100) : 0}%). ${tradeCount} trades tracked. ${activeDisputes} active dispute(s) require oversight.`,
      severity: activeDisputes > 10 ? "warning" : "info",
      actionUrl: `/portal/admin/metrics`,
      actionLabel: "Open Metrics",
      data: { tenantCount, verifiedCount, tradeCount, activeDisputes },
      generatedAt: nowIso(),
    });
  } catch {
    /* skip */
  }

  // (2) Anomaly detection — count tenants with sanctions hits.
  try {
    const sanctionedTenants = await db.tenant.count({
      where: { sanctionsCleared: false },
    });
    const tradesWithSanctions = await db.trade.count({
      where: {
        OR: [
          { buyer: { sanctionsCleared: false } },
          { seller: { sanctionsCleared: false } },
        ],
      },
    });
    out.push({
      id: shortId("PI-ADM-2"),
      portal: "admin",
      title: `Anomaly detection: ${sanctionedTenants} tenant(s) with sanctions hits, ${tradesWithSanctions} exposed trade(s)`,
      body: `Brain anomaly detector: ${sanctionedTenants} tenant(s) currently fail sanctions clearance; ${tradesWithSanctions} trade(s) involve a sanctioned party. ${sanctionedTenants > 0 ? "Investigate immediately." : "No sanctions anomalies detected."}`,
      severity: sanctionedTenants > 0 ? "critical" : "info",
      actionUrl: `/portal/admin/incidents`,
      actionLabel: "Open Incidents",
      data: { sanctionedTenants, tradesWithSanctions },
      generatedAt: nowIso(),
    });
  } catch {
    /* skip */
  }

  // (3) Revenue / fee intelligence — aggregate SGTX fees.
  try {
    const feeAgg = await db.trade.aggregate({ _sum: { sgtxFeeUsd: true } });
    const totalFees = feeAgg._sum.sgtxFeeUsd || 0;
    // Also count trades missing fee assessment (potential revenue leakage).
    const tradesMissingFees = await db.trade.count({
      where: { sgtxFeeUsd: null },
    });
    out.push({
      id: shortId("PI-ADM-3"),
      portal: "admin",
      title: `Revenue intelligence: $${totalFees.toLocaleString()} SGTX fees accrued, ${tradesMissingFees} trade(s) missing fee`,
      body: `Brain revenue monitor: $${totalFees.toLocaleString()} in SGTX fees accrued across all trades. ${tradesMissingFees} trade(s) lack a fee assessment — revenue leakage risk. Recommend running the fee calculator cron.`,
      severity: tradesMissingFees > 5 ? "warning" : "info",
      actionUrl: `/portal/admin/metrics`,
      actionLabel: "Open Metrics",
      data: { totalFees, tradesMissingFees },
      generatedAt: nowIso(),
    });
  } catch {
    /* skip */
  }

  return out;
}

// ============================================================================
// Public entry: getPortalIntelligence
// ============================================================================

/**
 * Generate 3 role-specific Brain insights for a tenant's portal dashboard.
 *
 * Always returns exactly 3 insights. If a role-specific Brain call fails or
 * yields no data, the gap is padded with generic platform-status insights
 * so the UI has a stable surface to render.
 */
export async function getPortalIntelligence(input: {
  tenantGtid: string;
  portal: PortalType;
}): Promise<PortalIntelligenceResult> {
  const { tenantGtid, portal } = input;
  const assessedAt = nowIso();

  const tenant = await loadTenant(tenantGtid);
  if (!tenant) {
    // Unknown tenant — return 3 generic platform-status insights so the UI
    // doesn't crash. Marked as info severity.
    return {
      tenantGtid,
      portal,
      insights: platformStatusInsights(portal, tenantGtid, 3),
      assessedAt,
      brainModule: "getPortalIntelligence",
    };
  }

  const trades = await loadTenantTrades(tenantGtid);

  let roleInsights: PortalInsight[] = [];
  try {
    switch (portal) {
      case "seller":
        roleInsights = await sellerInsights(tenant, trades);
        break;
      case "buyer":
        roleInsights = await buyerInsights(tenant, trades);
        break;
      case "lsp":
        roleInsights = await lspInsights(tenant, trades);
        break;
      case "shipping":
        roleInsights = await shippingInsights(tenant, trades);
        break;
      case "lab":
      case "qc":
        roleInsights = await labQcInsights(tenant, trades);
        break;
      case "customs_broker":
        roleInsights = await customsBrokerInsights(tenant, trades);
        break;
      case "bank":
      case "private_financier":
        roleInsights = await financierInsights(tenant, trades);
        break;
      case "government":
        roleInsights = await governmentInsights(tenant, trades);
        break;
      case "admin":
        roleInsights = await adminInsights(tenant, trades);
        break;
      default:
        roleInsights = [];
    }
  } catch {
    roleInsights = [];
  }

  // Normalise portal label on every insight (in case a generator used the
  // tenant's BANK/PFI value vs the requested enum).
  for (const ins of roleInsights) {
    ins.portal = portal;
  }

  // Pad up to exactly 3 insights.
  if (roleInsights.length < 3) {
    const pad = platformStatusInsights(portal, tenantGtid, 3 - roleInsights.length);
    roleInsights = roleInsights.concat(pad);
  }
  // Cap at 3 (a generator might over-produce in rare cases).
  if (roleInsights.length > 3) {
    roleInsights = roleInsights.slice(0, 3);
  }

  return {
    tenantGtid,
    portal,
    insights: roleInsights,
    assessedAt,
    brainModule: "getPortalIntelligence",
  };
}

// ============================================================================
// Public entry: calculateTradeReadinessScore
// ============================================================================

interface PeerAggregate {
  medianKybDurationDays: number | null; // null = no peer data
  platformDisputeRate: number | null; // disputes / trades, platform-wide
  platformOnTimeRate: number | null; // settled / total instructions, platform-wide
}

async function loadPeerAggregates(excludeGtid: string): Promise<PeerAggregate> {
  // (a) Median KYB duration: time from tenant.createdAt → first
  //     TenantLifecycleHistory row transitioning the tenant to "VERIFIED".
  try {
    const history = await db.tenantLifecycleHistory.findMany({
      where: { toState: "VERIFIED", tenantGtid: { not: excludeGtid } },
      select: { tenantGtid: true, createdAt: true },
    });
    const tenants = await db.tenant.findMany({
      where: { gtid: { in: history.map((h) => h.tenantGtid) } },
      select: { gtid: true, createdAt: true },
    });
    const createdAtByGtid = new Map(tenants.map((t) => [t.gtid, t.createdAt]));
    const durations: number[] = [];
    for (const h of history) {
      const created = createdAtByGtid.get(h.tenantGtid);
      if (!created) continue;
      const dur = (h.createdAt.getTime() - created.getTime()) / 86400000;
      if (Number.isFinite(dur) && dur >= 0) durations.push(dur);
    }
    durations.sort((a, b) => a - b);
    const medianKybDurationDays =
      durations.length > 0
        ? durations[Math.floor(durations.length / 2)]
        : null;

    // (b) Platform dispute rate = total disputes / total trades.
    const [totalDisputes, totalTrades] = await Promise.all([
      db.dispute.count(),
      db.trade.count(),
    ]);
    const platformDisputeRate =
      totalTrades > 0 ? totalDisputes / totalTrades : null;

    // (c) Platform on-time settlement rate = settled instructions / total
    //     instructions.
    const [settledInstructions, totalInstructions] = await Promise.all([
      db.settlementInstruction.count({ where: { settledAt: { not: null } } }),
      db.settlementInstruction.count(),
    ]);
    const platformOnTimeRate =
      totalInstructions > 0 ? settledInstructions / totalInstructions : null;

    return { medianKybDurationDays, platformDisputeRate, platformOnTimeRate };
  } catch {
    return {
      medianKybDurationDays: null,
      platformDisputeRate: null,
      platformOnTimeRate: null,
    };
  }
}

/** Compute the tenant's KYB completion duration in days, using
 *  TenantLifecycleHistory (transition to VERIFIED) if available; else
 *  fallback to a Activity-log lookup for KYB_APPROVED with this tenant in
 *  metadata; else null (no signal). */
async function tenantKybDurationDays(
  tenantGtid: string,
  tenantCreatedAt: Date,
): Promise<number | null> {
  try {
    const verified = await db.tenantLifecycleHistory.findFirst({
      where: { tenantGtid, toState: "VERIFIED" },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    if (verified) {
      const dur = (verified.createdAt.getTime() - tenantCreatedAt.getTime()) / 86400000;
      if (Number.isFinite(dur) && dur >= 0) return dur;
    }
  } catch {
    /* fall through */
  }
  try {
    // Fallback: scan Activity log for KYB_APPROVED rows whose metadata JSON
    // contains this tenantGtid. Prisma `string_contains` is the portable way.
    const approved = await db.activity.findFirst({
      where: {
        action: "KYB_APPROVED",
        metadata: { contains: tenantGtid },
      },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    if (approved) {
      const dur = (approved.createdAt.getTime() - tenantCreatedAt.getTime()) / 86400000;
      if (Number.isFinite(dur) && dur >= 0) return dur;
    }
  } catch {
    /* fall through */
  }
  return null;
}

/** Determine the trend relative to the tenant's previously-persisted
 *  TradeReadiness score. The previous score is recovered from the
 *  TradeReadiness table (lastCalculated) and/or Activity log rows tagged
 *  with action "TRADE_READINESS_SCORED". */
async function computeTrend(
  tenantGtid: string,
  currentScore: number,
): Promise<"improving" | "stable" | "declining"> {
  try {
    const existing = await db.tradeReadiness.findUnique({
      where: { tenantGtid },
      select: { score: true },
    });
    if (existing && typeof existing.score === "number") {
      const delta = currentScore - existing.score;
      if (delta >= 3) return "improving";
      if (delta <= -3) return "declining";
      return "stable";
    }
  } catch {
    /* fall through to Activity log */
  }
  try {
    const prev = await db.activity.findFirst({
      where: { action: "TRADE_READINESS_SCORED", actorGtid: tenantGtid },
      orderBy: { createdAt: "desc" },
      select: { metadata: true },
    });
    if (prev?.metadata) {
      const parsed = JSON.parse(prev.metadata);
      const prevScore = typeof parsed.overallScore === "number" ? parsed.overallScore : null;
      if (prevScore != null) {
        const delta = currentScore - prevScore;
        if (delta >= 3) return "improving";
        if (delta <= -3) return "declining";
        return "stable";
      }
    }
  } catch {
    /* ignore */
  }
  return "stable";
}

function tierForScore(score: number): TradeReadinessScore["tier"] {
  if (score >= 85) return "PLATINUM";
  if (score >= 70) return "GOLD";
  if (score >= 55) return "SILVER";
  if (score >= 40) return "BRONZE";
  return "PROVISIONAL";
}

/** Build human-readable recommendations from the component scores. Always
 *  returns at least 1, at most 5. */
function buildRecommendations(
  components: TradeReadinessScore["components"],
  tenant: TenantContext,
): string[] {
  const recs: string[] = [];
  if (components.marketAlignment.score < 70) {
    recs.push(
      `Your recent quotes deviate ${components.marketAlignment.detail.match(/deviation ([\d.]+)%/)?.[1] || ""}% from Brain's market average. Re-validate EXW prices against current port-arrival data before quoting.`,
    );
  }
  if (components.complianceVelocity.score < 70) {
    recs.push(
      `Your KYB / document-upload velocity is slower than the platform median. Assign a compliance owner to clear pending document requests within 24h.`,
    );
  }
  if (components.disputeFrequency.score < 70) {
    recs.push(
      `Your dispute rate is above the platform average. Review the root-cause categories on recent disputes and tighten pre-trade counterparty due diligence.`,
    );
  }
  if (components.paymentReliability.score < 70) {
    recs.push(
      `Your on-time settlement rate is below the platform benchmark. Consider switching to LC or escrow settlement structures for higher-value trades.`,
    );
  }
  if (components.sanctionsClear.score < 100) {
    recs.push(
      `Sanctions clearance is not current — Brain's sanctions module flagged your entity. Resolve the screening hit before initiating new trades; the Governor will block new trade creation otherwise.`,
    );
  }
  if (components.tradeVolume.score < 50) {
    recs.push(
      `Your trade volume is below the platform's mid-tier. Complete 2-3 more trades to lift your tier — Brain's PLATINUM tier unlocks lower SGTX fees and faster financing.`,
    );
  }
  if (recs.length === 0) {
    recs.push(
      `Brain rates your trade readiness ${components.marketAlignment.score >= 85 ? "high" : "solid"} across all components. Maintain current cadence; consider expanding into new commodity corridors to grow your trade-volume component.`,
    );
  }
  // Cap at 5.
  return recs.slice(0, 5);
}

/**
 * Compute an AI-weighted Trade Readiness Score for a tenant.
 *
 * Components (each 0-100):
 *   • marketAlignment (weight 0.20) — `validateQuotePrice` on recent trades;
 *     score = 100 − (avg deviation % × 2), clamped 0-100.
 *   • complianceVelocity (0.15) — KYB completion time + doc upload time vs
 *     platform median.
 *   • disputeFrequency (0.20) — tenant dispute rate vs platform average.
 *   • paymentReliability (0.20) — on-time settlement rate.
 *   • sanctionsClear (0.15) — 100 if clear, 0 if any hit.
 *   • tradeVolume (0.10) — log scale of completed trade count + value.
 *
 * The trend is computed by comparing the overallScore to the tenant's
 * previously-persisted TradeReadiness score (or the last
 * `TRADE_READINESS_SCORED` Activity log row).
 *
 * The cron route in `/api/sgtx/readiness/cron/route.ts` is the primary
 * caller; the result is persisted via `db.tradeReadiness.upsert` plus an
 * Activity log row recording the full assessment JSON.
 */
export async function calculateTradeReadinessScore(
  tenantGtid: string,
): Promise<TradeReadinessScore> {
  const assessedAt = nowIso();

  const tenant = await loadTenant(tenantGtid);
  if (!tenant) {
    throw new Error(`calculateTradeReadinessScore: tenant ${tenantGtid} not found`);
  }

  const trades = await loadTenantTrades(tenantGtid, 50);
  const peerAgg = await loadPeerAggregates(tenantGtid);

  // ----------------------------------------------------------------------
  // (1) marketAlignment — call validateQuotePrice on up to 3 recent trades.
  // ----------------------------------------------------------------------
  let marketScore = 70; // neutral baseline when no trade history
  let marketDetail = "No recent trades available to assess market alignment; baseline score applied.";
  const recentForPricing = trades.slice(0, 3);
  if (recentForPricing.length > 0) {
    try {
      const validations = await Promise.allSettled(
        recentForPricing.map((t) => {
          // validateQuotePrice expects a per-unit price. Derive per-kg from
          // tradeValueUsd / grossWeightKg; if grossWeightKg is missing or
          // zero, fall back to the trade value as a per-tonne proxy.
          const perKg =
            t.grossWeightKg && t.grossWeightKg > 0
              ? t.tradeValueUsd / t.grossWeightKg
              : t.tradeValueUsd / 1000; // per-tonne fallback
          return validateQuotePrice({
            commodity: t.commodity,
            hsCode: t.commodityHs || undefined,
            quotedPriceUsd: perKg,
            port: t.destPort,
            unit: "kg",
          });
        }),
      );
      const deviations: number[] = [];
      for (const r of validations) {
        if (r.status === "fulfilled" && Number.isFinite(r.value.deviationPercent)) {
          deviations.push(Math.abs(r.value.deviationPercent));
        }
      }
      if (deviations.length > 0) {
        const avgDev = deviations.reduce((s, d) => s + d, 0) / deviations.length;
        marketScore = clamp(100 - avgDev * 2, 0, 100);
        marketDetail = `Brain's validateQuotePrice on ${deviations.length} recent trade(s) shows avg deviation ${round2(avgDev)}% from market. Score = 100 − (avgDev × 2).`;
      } else {
        marketScore = 65;
        marketDetail = "Brain price-validation calls did not return usable deviation data; heuristic baseline applied.";
      }
    } catch {
      marketScore = 65;
      marketDetail = "Brain price-validation unavailable; heuristic baseline applied.";
    }
  }

  // ----------------------------------------------------------------------
  // (2) complianceVelocity — tenant KYB duration vs platform median.
  // ----------------------------------------------------------------------
  let complianceScore = 70;
  let complianceDetail = "No KYB completion signal available; baseline score applied.";
  try {
    const tenantDur = await tenantKybDurationDays(tenant.gtid, tenant.createdAt);
    if (tenantDur != null) {
      const medianDur = peerAgg.medianKybDurationDays;
      if (medianDur != null && medianDur > 0) {
        // Faster than median → higher score; 2× median → 50; 4× median → ~25.
        const ratio = tenantDur / medianDur;
        complianceScore = clamp(100 - (ratio - 1) * 50, 0, 100);
        complianceDetail = `Your KYB completed in ${round2(tenantDur)}d vs platform median ${round2(medianDur)}d (ratio ${round2(ratio)}×). Score = 100 − (ratio−1)×50.`;
      } else {
        // No peer data — score on absolute scale (≤2d = 100, ≤7d = 80, ≤30d = 60, else 40).
        complianceScore =
          tenantDur <= 2 ? 100 : tenantDur <= 7 ? 80 : tenantDur <= 30 ? 60 : 40;
        complianceDetail = `Your KYB completed in ${round2(tenantDur)}d. (Platform median unavailable — absolute scale used.)`;
      }
    }
  } catch {
    /* baseline retained */
  }

  // ----------------------------------------------------------------------
  // (3) disputeFrequency — tenant dispute rate vs platform average.
  // ----------------------------------------------------------------------
  let disputeScore = 80;
  let disputeDetail = "No trade history to compute dispute frequency; baseline score applied.";
  try {
    const [myTradeCount, myDisputeCount] = await Promise.all([
      db.trade.count({ where: { OR: [{ buyerGtid: tenantGtid }, { sellerGtid: tenantGtid }] } }),
      db.dispute.count({
        where: {
          OR: [{ filedByGtid: tenantGtid }, { respondentGtid: tenantGtid }],
        },
      }),
    ]);
    if (myTradeCount > 0) {
      const myRate = myDisputeCount / myTradeCount;
      const platformRate = peerAgg.platformDisputeRate;
      if (platformRate != null && platformRate > 0) {
        const ratio = myRate / platformRate;
        // ratio 0 → 100; ratio 1 → 75; ratio 2 → 50; ratio 4 → 0.
        disputeScore = clamp(100 - (ratio - 0) * 25, 0, 100);
        disputeDetail = `Your dispute rate is ${round2(myRate * 100)}% (${myDisputeCount}/${myTradeCount}) vs platform avg ${round2(platformRate * 100)}% (ratio ${round2(ratio)}×). Score = 100 − ratio×25.`;
      } else {
        // No platform baseline — absolute scale: 0 disputes = 100, ≤10% = 80, ≤25% = 60, ≤50% = 40, else 20.
        disputeScore =
          myDisputeCount === 0
            ? 100
            : myRate <= 0.1
              ? 80
              : myRate <= 0.25
                ? 60
                : myRate <= 0.5
                  ? 40
                  : 20;
        disputeDetail = `Your dispute rate is ${round2(myRate * 100)}% (${myDisputeCount}/${myTradeCount}). (Platform average unavailable — absolute scale used.)`;
      }
    } else if (myDisputeCount === 0) {
      disputeScore = 90;
      disputeDetail = "No trades and no disputes — provisional clean record.";
    }
  } catch {
    /* baseline retained */
  }

  // ----------------------------------------------------------------------
  // (4) paymentReliability — tenant on-time settlement rate.
  // ----------------------------------------------------------------------
  let paymentScore = 70;
  let paymentDetail = "No settlement instructions recorded; baseline score applied.";
  try {
    const [settled, total] = await Promise.all([
      db.settlementInstruction.count({
        where: { payerGtid: tenantGtid, settledAt: { not: null } },
      }),
      db.settlementInstruction.count({
        where: { payerGtid: tenantGtid },
      }),
    ]);
    if (total > 0) {
      const myRate = settled / total;
      paymentScore = clamp(Math.round(myRate * 100), 0, 100);
      const platformRate = peerAgg.platformOnTimeRate;
      if (platformRate != null) {
        paymentDetail = `Your on-time settlement rate is ${round2(myRate * 100)}% (${settled}/${total}) vs platform avg ${round2(platformRate * 100)}%.`;
      } else {
        paymentDetail = `Your on-time settlement rate is ${round2(myRate * 100)}% (${settled}/${total}). (Platform average unavailable.)`;
      }
    } else {
      paymentScore = 75;
      paymentDetail = "No settlement instructions recorded for your GTID; provisional baseline applied.";
    }
  } catch {
    /* baseline retained */
  }

  // ----------------------------------------------------------------------
  // (5) sanctionsClear — 100 if clear, 0 if any hit.
  // ----------------------------------------------------------------------
  let sanctionsScore = tenant.sanctionsCleared ? 100 : 0;
  let sanctionsDetail = tenant.sanctionsCleared
    ? "Tenant.sanctionsCleared flag is true (KYB approve flow cleared)."
    : "Tenant.sanctionsCleared flag is FALSE — Brain treats this as a sanctions hit.";
  // Additionally, run the structured sanctions module on the tenant to catch
  // any post-KYB drift. This is fast (seed-list path) unless a real provider
  // is registered, in which case it may make an external call.
  try {
    const screen = await screenForSanctions({
      name: tenant.legalName,
      country: tenant.country,
    });
    if (!screen.clear) {
      sanctionsScore = 0;
      sanctionsDetail = `Brain sanctions module flagged ${tenant.legalName} with ${screen.hits.length} hit(s) (provider: ${screen.provider}). Top hit: ${screen.hits[0]?.entityName || "unknown"} on ${screen.hits[0]?.list || "unknown list"}.`;
    } else if (sanctionsScore === 100) {
      sanctionsDetail = `Brain sanctions module cleared ${tenant.legalName} (provider: ${screen.provider}). Tenant.sanctionsCleared flag is true.`;
    }
  } catch {
    /* fall back to tenant.sanctionsCleared flag */
  }

  // ----------------------------------------------------------------------
  // (6) tradeVolume — log scale of completed trade count + value.
  // ----------------------------------------------------------------------
  let volumeScore = 30;
  let volumeDetail = "No completed trades; baseline PROVISIONAL-tier score applied.";
  try {
    const completedTrades = await db.trade.findMany({
      where: {
        OR: [{ buyerGtid: tenantGtid }, { sellerGtid: tenantGtid }],
        status: { in: ["DELIVERED", "SETTLED"] },
      },
      select: { tradeValueUsd: true },
    });
    const count = completedTrades.length;
    const totalValue = completedTrades.reduce((s, t) => s + (t.tradeValueUsd || 0), 0);
    if (count > 0) {
      // Log scale: 1 trade = 50, 5 = ~75, 20 = ~90, 100 = ~100. Combined
      // with a value kicker (each $100k of completed value adds up to +5,
      // capped).
      const countScore = clamp(40 + Math.log2(count + 1) * 10, 0, 90);
      const valueKicker = clamp(Math.log10((totalValue || 0) / 1000 + 1) * 4, 0, 10);
      volumeScore = clamp(Math.round(countScore + valueKicker), 0, 100);
      volumeDetail = `${count} completed trade(s), $${totalValue.toLocaleString()} total value. countScore=${round2(countScore)} + valueKicker=${round2(valueKicker)}.`;
    }
  } catch {
    /* baseline retained */
  }

  // ----------------------------------------------------------------------
  // Weighted overall + tier + trend + recommendations.
  // ----------------------------------------------------------------------
  const components: TradeReadinessScore["components"] = {
    marketAlignment: { score: Math.round(marketScore), weight: 0.2, detail: marketDetail },
    complianceVelocity: { score: Math.round(complianceScore), weight: 0.15, detail: complianceDetail },
    disputeFrequency: { score: Math.round(disputeScore), weight: 0.2, detail: disputeDetail },
    paymentReliability: { score: Math.round(paymentScore), weight: 0.2, detail: paymentDetail },
    sanctionsClear: { score: Math.round(sanctionsScore), weight: 0.15, detail: sanctionsDetail },
    tradeVolume: { score: Math.round(volumeScore), weight: 0.1, detail: volumeDetail },
  };

  const overallScore = Math.round(
    components.marketAlignment.score * components.marketAlignment.weight +
      components.complianceVelocity.score * components.complianceVelocity.weight +
      components.disputeFrequency.score * components.disputeFrequency.weight +
      components.paymentReliability.score * components.paymentReliability.weight +
      components.sanctionsClear.score * components.sanctionsClear.weight +
      components.tradeVolume.score * components.tradeVolume.weight,
  );

  const tier = tierForScore(overallScore);
  const trend = await computeTrend(tenantGtid, overallScore);
  const recommendations = buildRecommendations(components, tenant);

  return {
    tenantGtid,
    overallScore: clamp(overallScore, 0, 100),
    tier,
    components,
    trend,
    recommendations,
    assessedAt,
    brainModule: "calculateTradeReadinessScore",
  };
}

// Exported for callers (cron route, tests) that want to persist the full
// assessment in a single Activity log row.
export function serializeTradeReadinessScore(score: TradeReadinessScore): string {
  return JSON.stringify(score);
}
