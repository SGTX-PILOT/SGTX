// @ts-nocheck
/**
 * SGTX Part 74 + 75 + 108 — Connector Risk / Outage Impact / Active Trade Impact
 * ===========================================================================
 *
 * Three related primitives for connector (government API, carrier API,
 * bank API, PSP API) risk management:
 *
 *   • Part 74 — getConnectorRiskProfile(connectorId):
 *       Tracks each connector's API uptime, response latency, change
 *       frequency, certification complexity, and political risk. Returns
 *       a single RiskProfile that the platform uses to prioritise
 *       diversification (e.g. don't route all EU declarations through a
 *       single member-state customs gateway).
 *
 *   • Part 75 — getOutageImpact(connectorId):
 *       When a connector goes down (or is degraded), this returns the
 *       full impact chain: OUTAGE → PROCEDURES AFFECTED → COUNTRIES
 *       AFFECTED → LANES AFFECTED → USTNs AFFECTED → SEVERITY → LEGAL
 *       FALLBACK → TASK → ESCALATION. Used by the platform's
 *       incident-response dashboard.
 *
 *   • Part 108 — getActiveTradeImpact(connectorId):
 *       For a connector outage, returns the list of currently-active
 *       trades that depend on this connector. Each trade is annotated
 *       with the milestone it will fail to reach if the outage persists.
 *
 * NON-MARKETPLACE GUARANTEE:
 *   When SGTX identifies a single-connector dependency, it surfaces the
 *   risk but does NOT auto-switch the trade to a different connector
 *   (e.g. switching from FASAH-EG to a non-FASAH route). Operator +
 *   Governor must approve any lane change.
 *
 * Risk scoring (§74.6):
 *   composite = (uptime_score * 0.3) + (latency_score * 0.2) +
 *               (stability_score * 0.2) + (certification_score * 0.15) +
 *               (political_score * 0.15)
 *   Each sub-score is 0..1; composite is also 0..1.
 *   Risk band: <0.4 LOW | 0.4-0.7 MEDIUM | 0.7-0.9 HIGH | >0.9 CRITICAL
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ Types ============

export interface RiskProfile {
  connectorId: string;
  connectorName: string;
  connectorType: string;
  countries: string[];
  uptimeScore: number;
  latencyScore: number;
  stabilityScore: number;
  certificationScore: number;
  politicalScore: number;
  compositeRisk: number;
  riskBand: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  lastIncident?: string;
  knownIssues: string[];
  assessedAt: string;
}

export interface OutageImpact {
  connectorId: string;
  connectorName: string;
  outage: boolean;
  proceduresAffected: string[];
  countriesAffected: string[];
  lanesAffected: Array<{ origin: string; destination: string }>;
  ustnsAffected: string[];
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  legalFallback: string;
  task: string;
  escalation: string;
  assessedAt: string;
}

export interface TradeImpact {
  ustn: string;
  currentMilestone: string;
  failingMilestone: string;
  hoursUntilBlocked: number;
  recommendedAction: string;
}

// ============ §74.5 — Static + dynamic risk data ============

const STATIC_PROFILES: Record<string, Partial<RiskProfile>> = {
  "FASAH-AE": { connectorName: "FASAH UAE", connectorType: "CUSTOMS", countries: ["AE"], uptimeScore: 0.92, latencyScore: 0.85, stabilityScore: 0.88, certificationScore: 0.65, politicalScore: 0.25, knownIssues: ["Occasional SOAP envelope rejection", "TLS rotation required yearly"] },
  "FASAH-SA": { connectorName: "FASAH Saudi (ZATCA)", connectorType: "CUSTOMS", countries: ["SA"], uptimeScore: 0.88, latencyScore: 0.78, stabilityScore: 0.82, certificationScore: 0.55, politicalScore: 0.30, knownIssues: ["SASO CoC prerequisite", "FASAH e-invoice integration"] },
  "ACE-US": { connectorName: "US ACE (CBP)", connectorType: "CUSTOMS", countries: ["US"], uptimeScore: 0.96, latencyScore: 0.92, stabilityScore: 0.95, certificationScore: 0.40, politicalScore: 0.10, knownIssues: ["ABI certification complex", "Quarterly ANSI X.12 updates"] },
  "CDS-GB": { connectorName: "UK CDS (HMRC)", connectorType: "CUSTOMS", countries: ["GB"], uptimeScore: 0.91, latencyScore: 0.84, stabilityScore: 0.86, certificationScore: 0.55, politicalScore: 0.15, knownIssues: ["GVMS parallel system", "SAD box mapping errors"] },
  "NAFEZA-EG": { connectorName: "Egypt Nafeza (ACI)", connectorType: "CUSTOMS", countries: ["EG"], uptimeScore: 0.85, latencyScore: 0.70, stabilityScore: 0.78, certificationScore: 0.60, politicalScore: 0.40, knownIssues: ["CargoX blockchain prereq", "ACI pre-registration mandatory 48h"] },
  "ICS2-EU": { connectorName: "EU ICS2", connectorType: "CUSTOMS", countries: ["EU"], uptimeScore: 0.93, latencyScore: 0.88, stabilityScore: 0.90, certificationScore: 0.50, politicalScore: 0.20, knownIssues: ["Phased rollout 2023-2025", "ENS schema v3 breaking changes"] },
  "GACC-CN": { connectorName: "China GACC Single Window", connectorType: "CUSTOMS", countries: ["CN"], uptimeScore: 0.90, latencyScore: 0.75, stabilityScore: 0.83, certificationScore: 0.45, politicalScore: 0.55, knownIssues: ["GACC registration lengthy", "Mandarin-only field labels"] },
};

const LEGAL_FALLBACK: Record<string, string> = {
  "FASAH-AE": "Manual FASAH submission via licensed broker; cargo held until filed.",
  "FASAH-SA": "Manual ZATCA filing via broker; SASO CoC still required.",
  "ACE-US": "Manual CBP 3461 + 7501 paper filing via broker; cargo at port held.",
  "CDS-GB": "Manual CDS submission via HMRC portal; GVMS reference required for road.",
  "NAFEZA-EG": "Manual ACI filing via broker; CargoX registration still mandatory.",
  "ICS2-EU": "Member-state customs portal fallback (ATLAS/DELTA/AIDA); ENS still mandatory.",
  "GACC-CN": "Manual GACC filing via broker; port authority pre-approval required.",
};

// ============ Public API ============

export async function getConnectorRiskProfile(connectorId: string): Promise<RiskProfile> {
  try {
    const staticProfile = STATIC_PROFILES[connectorId];
    let dynamic: any = null;
    try {
      dynamic = await db.connectorHealth.findFirst({ where: { connectorId }, orderBy: { measuredAt: "desc" } });
    } catch {}
    const uptime = dynamic?.uptimePct ? Number(dynamic.uptimePct) / 100 : (staticProfile?.uptimeScore ?? 0.9);
    const latency = dynamic?.latencyMs ? Math.max(0, 1 - Number(dynamic.latencyMs) / 5000) : (staticProfile?.latencyScore ?? 0.8);
    const composite = (uptime * 0.3) + (latency * 0.2) + ((staticProfile?.stabilityScore ?? 0.85) * 0.2) +
      ((staticProfile?.certificationScore ?? 0.5) * 0.15) + ((staticProfile?.politicalScore ?? 0.2) * 0.15);
    const riskBand: RiskProfile["riskBand"] = composite < 0.4 ? "LOW" : composite < 0.7 ? "MEDIUM" : composite < 0.9 ? "HIGH" : "CRITICAL";

    return {
      connectorId,
      connectorName: staticProfile?.connectorName || connectorId,
      connectorType: staticProfile?.connectorType || "UNKNOWN",
      countries: staticProfile?.countries || [],
      uptimeScore: uptime,
      latencyScore: latency,
      stabilityScore: staticProfile?.stabilityScore ?? 0.85,
      certificationScore: staticProfile?.certificationScore ?? 0.5,
      politicalScore: staticProfile?.politicalScore ?? 0.2,
      compositeRisk: composite,
      riskBand,
      lastIncident: dynamic?.lastIncidentAt,
      knownIssues: staticProfile?.knownIssues || [],
      assessedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    logger.error("[connector-risk] getConnectorRiskProfile failed", { connectorId, error: err?.message });
    return {
      connectorId, connectorName: connectorId, connectorType: "UNKNOWN", countries: [],
      uptimeScore: 0, latencyScore: 0, stabilityScore: 0, certificationScore: 0, politicalScore: 0,
      compositeRisk: 1, riskBand: "CRITICAL", knownIssues: ["Assessment failed — treat as critical"],
      assessedAt: new Date().toISOString(),
    };
  }
}

export async function getOutageImpact(connectorId: string): Promise<OutageImpact> {
  try {
    const profile = await getConnectorRiskProfile(connectorId);
    let outageDetected = false;
    try {
      const recent = await db.connectorHealth.findFirst({ where: { connectorId }, orderBy: { measuredAt: "desc" } });
      outageDetected = recent?.status === "DOWN" || recent?.uptimePct < 50;
    } catch {}

    const procedures = deriveProcedures(profile.connectorType);
    const countries = profile.countries;
    const lanes = deriveLanes(countries);
    const ustns = await findAffectedUstns(connectorId, countries);
    const severity = ustns.length > 50 ? "CRITICAL" : ustns.length > 10 ? "HIGH" : ustns.length > 0 ? "MEDIUM" : "LOW";
    const fallback = LEGAL_FALLBACK[connectorId] || "Manual filing via licensed broker; trade-specific procedure applies.";

    return {
      connectorId,
      connectorName: profile.connectorName,
      outage: outageDetected,
      proceduresAffected: procedures,
      countriesAffected: countries,
      lanesAffected: lanes,
      ustnsAffected: ustns,
      severity,
      legalFallback: fallback,
      task: `Notify broker; switch affected trades to "${fallback}" if outage persists >2h.`,
      escalation: severity === "CRITICAL" ? "ESCALATE_TO_PLATFORM_OPS + NOTIFY_ALL_AFFECTED_OPERATORS" : severity === "HIGH" ? "ESCALATE_TO_PLATFORM_OPS" : "LOG_AND_MONITOR",
      assessedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    logger.error("[connector-risk] getOutageImpact failed", { connectorId, error: err?.message });
    return {
      connectorId, connectorName: connectorId, outage: true,
      proceduresAffected: [], countriesAffected: [], lanesAffected: [], ustnsAffected: [],
      severity: "HIGH", legalFallback: "Manual filing via licensed broker",
      task: "Manual assessment required", escalation: "ESCALATE_TO_PLATFORM_OPS",
      assessedAt: new Date().toISOString(),
    };
  }
}

export async function getActiveTradeImpact(connectorId: string): Promise<TradeImpact[]> {
  try {
    const impact = await getOutageImpact(connectorId);
    const ustns = impact.ustnsAffected;
    const out: TradeImpact[] = [];
    for (const ustn of ustns) {
      try {
        const trade = await db.trade.findUnique({
          where: { ustn },
          select: { ustn: true, status: true, shipments: true, customsOperations: true, deliveryAcceptances: true },
        }).catch(() => null);
        if (!trade) continue;
        const milestone = trade.customsOperations?.length ? "POST_CUSTOMS" : "PRE_CUSTOMS";
        const failing = impact.proceduresAffected[0] || "CUSTOMS_FILING";
        out.push({
          ustn,
          currentMilestone: milestone,
          failingMilestone: failing,
          hoursUntilBlocked: 48,
          recommendedAction: `Switch to manual fallback: ${impact.legalFallback}`,
        });
      } catch {}
    }
    return out;
  } catch (err: any) {
    logger.error("[connector-risk] getActiveTradeImpact failed", { connectorId, error: err?.message });
    return [];
  }
}

// ============ Helpers ============

function deriveProcedures(type: string): string[] {
  try {
    const map: Record<string, string[]> = {
      CUSTOMS: ["CUSTOMS_DECLARATION", "DUTY_PAYMENT", "CARGO_RELEASE", "INSPECTION_COORDINATION"],
      CARRIER: ["BOOKING", "BL_ISSUANCE", "TRACKING", "GATE_IN_OUT"],
      BANK: ["LC_ISSUANCE", "LC_PRESENTATION", "BANK_SETTLEMENT", "MT799_CONFIRMATION"],
      PSP: ["PAYMENT_CAPTURE", "FEE_SPLIT", "REFUND_PROCESSING"],
    };
    return map[type] || ["UNKNOWN"];
  } catch {
    return [];
  }
}

function deriveLanes(countries: string[]): Array<{ origin: string; destination: string }> {
  try {
    const out: Array<{ origin: string; destination: string }> = [];
    for (const c of countries) {
      out.push({ origin: c, destination: "*" });
      out.push({ origin: "*", destination: c });
    }
    return out;
  } catch {
    return [];
  }
}

async function findAffectedUstns(connectorId: string, countries: string[]): Promise<string[]> {
  try {
    const orClauses = countries.flatMap((c) => [{ originCountry: c }, { destinationCountry: c }]);
    const trades = await db.trade.findMany({
      where: { AND: [{ status: { notIn: ["CLOSED", "COMPLETED", "CANCELLED"] } }, { OR: orClauses }] },
      select: { ustn: true },
      take: 200,
    }).catch(() => []);
    return trades.map((t: any) => t.ustn);
  } catch {
    return [];
  }
}
