// @ts-nocheck
/**
 * SGTX Part 68 — Smart Timeline Engine
 * ===========================================================================
 *
 * Unified timeline across all 11 trade-event domains. Pulls events from:
 *   COMMERCIAL, REGULATORY, CUSTOMS, LOGISTICS, GOVERNMENT, FINANCIAL,
 *   SECURITY, PHYSICAL, DELIVERY, CLAIMS, POST_CLEARANCE
 *
 * For every event, six timestamps are tracked (per §68):
 *   eventTime       — when the event conceptually happened
 *   sourceTime      — the timestamp reported by the upstream source system
 *   ingestionTime   — when SGTX ingested the event into its event spine
 *   physicalTime    — when the underlying physical action occurred (gate-out,
 *                     vessel departure, container stuff, etc.)
 *   legalTime       — when the event became legally effective (release notice
 *                     publication, LC issuance, customs acceptance)
 *   systemTime      — when the SGTX database row was committed (createdAt)
 *
 * The merger is defensive: each domain source is wrapped in its own try/catch
 * so one failed domain never breaks the rest. The final timeline is sorted
 * chronologically by eventTime (falling back to ingestionTime when missing).
 *
 * All DB calls are try/catch-wrapped with safe defaults. The engine never
 * throws into API routes.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §68 Constants ============

export const TIMELINE_DOMAINS = [
  "COMMERCIAL",
  "REGULATORY",
  "CUSTOMS",
  "LOGISTICS",
  "GOVERNMENT",
  "FINANCIAL",
  "SECURITY",
  "PHYSICAL",
  "DELIVERY",
  "CLAIMS",
  "POST_CLEARANCE",
] as const;

export type TimelineDomain = (typeof TIMELINE_DOMAINS)[number];

export interface TimelineEvent {
  ustn: string;
  domain: TimelineDomain;
  eventType: string;
  description: string;
  actor?: string | null;
  source?: string | null;
  eventTime: string;
  sourceTime?: string | null;
  ingestionTime?: string | null;
  physicalTime?: string | null;
  legalTime?: string | null;
  systemTime?: string | null;
  metadata?: Record<string, any> | null;
}

function safeParse(s: any): Record<string, any> | null {
  try {
    return typeof s === "string" ? JSON.parse(s) : (s ?? null);
  } catch {
    return null;
  }
}

function iso(d: any): string | null {
  try {
    if (!d) return null;
    if (typeof d === "string") return d;
    if (typeof d.toISOString === "function") return d.toISOString();
    return new Date(d).toISOString();
  } catch {
    return null;
  }
}

// ============ §68 Domain Extractors ============

async function extractCommercial(ustn: string): Promise<TimelineEvent[]> {
  try {
    const rows = await db.tradeEvent.findMany({
      where: { ustn },
      orderBy: { createdAt: "asc" },
      take: 500,
    });
    return rows.map((r: any) => {
      const t = iso(r.createdAt) || new Date().toISOString();
      return {
        ustn,
        domain: "COMMERCIAL",
        eventType: r.eventType,
        description: r.eventDescription || r.eventType,
        actor: r.actorGtid,
        source: r.source,
        eventTime: t,
        ingestionTime: t,
        systemTime: t,
        metadata: r.eventMetadata ? safeParse(r.eventMetadata) : null,
      };
    });
  } catch (err: any) {
    logger.warn("[smart-timeline] COMMERCIAL extraction failed", { error: err?.message });
    return [];
  }
}

async function extractRegulatory(ustn: string): Promise<TimelineEvent[]> {
  try {
    const rows = await db.regulatorySnapshot.findMany({
      where: { ustn },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return rows.map((r: any) => ({
      ustn,
      domain: "REGULATORY",
      eventType: "REGULATORY_SNAPSHOT",
      description: `Snapshot ${r.snapshotVersion || ""} for ${r.jurisdiction || ""}`.trim(),
      source: "RegulatorySnapshot",
      eventTime: iso(r.createdAt) || new Date().toISOString(),
      legalTime: iso(r.effectiveAt),
      systemTime: iso(r.createdAt),
      metadata: r.snapshot ? safeParse(r.snapshot) : null,
    }));
  } catch (err: any) {
    logger.warn("[smart-timeline] REGULATORY extraction failed", { error: err?.message });
    return [];
  }
}

async function extractCustoms(ustn: string): Promise<TimelineEvent[]> {
  try {
    const rows = await db.customsDeclaration.findMany({
      where: { ustn },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return rows.map((r: any) => ({
      ustn,
      domain: "CUSTOMS",
      eventType: `CUSTOMS_DECLARATION_${(r.status || "FILED").toString().toUpperCase()}`,
      description: `Declaration ${r.declarationNumber || r.id} — ${r.countryCode || ""} ${r.procedure || ""}`.trim(),
      source: "CustomsDeclaration",
      eventTime: iso(r.acceptedAt) || iso(r.createdAt) || new Date().toISOString(),
      legalTime: iso(r.acceptedAt),
      systemTime: iso(r.createdAt),
    }));
  } catch (err: any) {
    logger.warn("[smart-timeline] CUSTOMS extraction failed", { error: err?.message });
    return [];
  }
}

async function extractLogistics(ustn: string): Promise<TimelineEvent[]> {
  try {
    const rows = await db.transportLeg.findMany({
      where: { transportGraph: { ustn } },
      orderBy: { createdAt: "asc" },
      take: 200,
      include: { transportGraph: true },
    });
    return (rows as any[]).map((r) => ({
      ustn,
      domain: "LOGISTICS",
      eventType: `LEG_${(r.status || "PLANNED").toString().toUpperCase()}`,
      description: `${r.mode || "TRANSPORT"} leg ${r.origin || "?"}→${r.destination || "?"} ${r.carrierName || ""}`.trim(),
      source: "TransportLeg",
      physicalTime: iso(r.actualDeparture),
      eventTime: iso(r.actualDeparture) || iso(r.eta) || iso(r.createdAt) || new Date().toISOString(),
      systemTime: iso(r.createdAt),
    }));
  } catch (err: any) {
    logger.warn("[smart-timeline] LOGISTICS extraction failed", { error: err?.message });
    return [];
  }
}

async function extractGovernment(ustn: string): Promise<TimelineEvent[]> {
  try {
    const rows = await db.integrationConnectorLog.findMany({
      where: { ustn },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return rows.map((r: any) => ({
      ustn,
      domain: "GOVERNMENT",
      eventType: `GOV_${(r.apiName || "CALL").toString().toUpperCase()}_${(r.status || "PENDING").toString().toUpperCase()}`,
      description: `${r.apiName || "Government call"} → ${r.endpoint || ""} [${r.status || "PENDING"}]`.trim(),
      source: r.apiName,
      eventTime: iso(r.createdAt) || new Date().toISOString(),
      systemTime: iso(r.createdAt),
    }));
  } catch (err: any) {
    logger.warn("[smart-timeline] GOVERNMENT extraction failed", { error: err?.message });
    return [];
  }
}

async function extractFinancial(ustn: string): Promise<TimelineEvent[]> {
  try {
    const rows = await db.payment.findMany({
      where: { ustn },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return rows.map((r: any) => ({
      ustn,
      domain: "FINANCIAL",
      eventType: `PAYMENT_${(r.status || "INITIATED").toString().toUpperCase()}`,
      description: `Payment ${r.paymentId || r.id} — ${r.currency || ""} ${r.amount || 0} [${r.status || "INITIATED"}]`.trim(),
      source: "Payment",
      legalTime: iso(r.settledAt),
      eventTime: iso(r.initiatedAt) || iso(r.createdAt) || new Date().toISOString(),
      systemTime: iso(r.createdAt),
    }));
  } catch (err: any) {
    logger.warn("[smart-timeline] FINANCIAL extraction failed", { error: err?.message });
    return [];
  }
}

async function extractSecurity(ustn: string): Promise<TimelineEvent[]> {
  try {
    const rows = await db.securityScreening.findMany({
      where: { ustn },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return rows.map((r: any) => ({
      ustn,
      domain: "SECURITY",
      eventType: `SCREENING_${(r.outcome || "PENDING").toString().toUpperCase()}`,
      description: `Screening ${r.subject || ""} → ${r.outcome || "PENDING"} (score ${r.riskScore ?? "n/a"})`.trim(),
      source: "SecurityScreening",
      eventTime: iso(r.screenedAt) || iso(r.createdAt) || new Date().toISOString(),
      systemTime: iso(r.createdAt),
    }));
  } catch (err: any) {
    logger.warn("[smart-timeline] SECURITY extraction failed", { error: err?.message });
    return [];
  }
}

async function extractPhysical(ustn: string): Promise<TimelineEvent[]> {
  try {
    const rows = await db.containerEvent.findMany({
      where: { ustn },
      orderBy: { eventAt: "asc" },
      take: 200,
    });
    return rows.map((r: any) => ({
      ustn,
      domain: "PHYSICAL",
      eventType: (r.eventType || "CONTAINER_EVENT").toString().toUpperCase(),
      description: `Container ${r.containerNumber || ""} — ${r.eventType || ""} @ ${r.location || ""}`.trim(),
      source: "ContainerEvent",
      physicalTime: iso(r.eventAt),
      eventTime: iso(r.eventAt) || iso(r.createdAt) || new Date().toISOString(),
      systemTime: iso(r.createdAt),
    }));
  } catch (err: any) {
    logger.warn("[smart-timeline] PHYSICAL extraction failed", { error: err?.message });
    return [];
  }
}

async function extractDelivery(ustn: string): Promise<TimelineEvent[]> {
  try {
    const rows = await db.deliveryAcceptance.findMany({
      where: { ustn },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return rows.map((r: any) => ({
      ustn,
      domain: "DELIVERY",
      eventType: `DELIVERY_${(r.status || "PENDING").toString().toUpperCase()}`,
      description: `Delivery acceptance ${r.acceptanceId || r.id} — ${r.status || "PENDING"}`.trim(),
      source: "DeliveryAcceptance",
      physicalTime: iso(r.deliveredAt),
      legalTime: iso(r.acceptedAt),
      eventTime: iso(r.deliveredAt) || iso(r.createdAt) || new Date().toISOString(),
      systemTime: iso(r.createdAt),
    }));
  } catch (err: any) {
    logger.warn("[smart-timeline] DELIVERY extraction failed", { error: err?.message });
    return [];
  }
}

async function extractClaims(ustn: string): Promise<TimelineEvent[]> {
  try {
    const rows = await db.insuranceClaim.findMany({
      where: { ustn },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return rows.map((r: any) => ({
      ustn,
      domain: "CLAIMS",
      eventType: `CLAIM_${(r.status || "FILED").toString().toUpperCase()}`,
      description: `Claim ${r.claimNumber || r.id} — ${r.claimType || ""} ${r.amount || 0} [${r.status || "FILED"}]`.trim(),
      source: "InsuranceClaim",
      legalTime: iso(r.settledAt),
      eventTime: iso(r.filedAt) || iso(r.createdAt) || new Date().toISOString(),
      systemTime: iso(r.createdAt),
    }));
  } catch (err: any) {
    logger.warn("[smart-timeline] CLAIMS extraction failed", { error: err?.message });
    return [];
  }
}

async function extractPostClearance(ustn: string): Promise<TimelineEvent[]> {
  try {
    const rows = await db.postClearanceAudit.findMany({
      where: { ustn },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return rows.map((r: any) => ({
      ustn,
      domain: "POST_CLEARANCE",
      eventType: (r.auditType || "POST_CLEARANCE_AUDIT").toString().toUpperCase(),
      description: `Post-clearance ${r.auditType || ""} — ${r.outcome || "OPEN"}`.trim(),
      source: "PostClearanceAudit",
      legalTime: iso(r.effectiveAt),
      eventTime: iso(r.completedAt) || iso(r.createdAt) || new Date().toISOString(),
      systemTime: iso(r.createdAt),
    }));
  } catch (err: any) {
    logger.warn("[smart-timeline] POST_CLEARANCE extraction failed", { error: err?.message });
    return [];
  }
}

// ============ §68 Sort + Merge ============

function sortByEventTime(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((a, b) => {
    const ta = new Date(a.eventTime || a.ingestionTime || a.systemTime || 0).getTime();
    const tb = new Date(b.eventTime || b.ingestionTime || b.systemTime || 0).getTime();
    if (ta !== tb) return ta - tb;
    return (a.domain || "").localeCompare(b.domain || "");
  });
}

// ============ §68 Main API ============

export async function getSmartTimeline(ustn: string): Promise<TimelineEvent[]> {
  if (!ustn) return [];
  try {
    const [commercial, regulatory, customs, logistics, government, financial,
           security, physical, delivery, claims, postClearance] = await Promise.all([
      extractCommercial(ustn),
      extractRegulatory(ustn),
      extractCustoms(ustn),
      extractLogistics(ustn),
      extractGovernment(ustn),
      extractFinancial(ustn),
      extractSecurity(ustn),
      extractPhysical(ustn),
      extractDelivery(ustn),
      extractClaims(ustn),
      extractPostClearance(ustn),
    ]);
    const merged = [
      ...commercial, ...regulatory, ...customs, ...logistics, ...government,
      ...financial, ...security, ...physical, ...delivery, ...claims, ...postClearance,
    ];
    const sorted = sortByEventTime(merged);
    logger.info("[smart-timeline] merged timeline", {
      ustn, total: sorted.length,
      byDomain: {
        COMMERCIAL: commercial.length, REGULATORY: regulatory.length,
        CUSTOMS: customs.length, LOGISTICS: logistics.length,
        GOVERNMENT: government.length, FINANCIAL: financial.length,
        SECURITY: security.length, PHYSICAL: physical.length,
        DELIVERY: delivery.length, CLAIMS: claims.length,
        POST_CLEARANCE: postClearance.length,
      },
    });
    return sorted;
  } catch (err: any) {
    logger.error("[smart-timeline] getSmartTimeline failed", { ustn, error: err?.message });
    return [];
  }
}

export async function getTimelineByDomain(
  ustn: string,
  domain: TimelineDomain,
): Promise<TimelineEvent[]> {
  try {
    const all = await getSmartTimeline(ustn);
    return all.filter((e) => e.domain === domain);
  } catch {
    return [];
  }
}

export function listTimelineDomains(): readonly TimelineDomain[] {
  return TIMELINE_DOMAINS;
}
