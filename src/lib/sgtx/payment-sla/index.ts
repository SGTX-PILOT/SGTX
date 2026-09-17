// @ts-nocheck
/**
 * SGTX v18 §13.11 — Payment SLA Monitoring
 * ===========================================================================
 *
 * Five SLA targets, each measured per payment leg:
 *
 *   • MANIFEST_GENERATION   — target 1s
 *   • BANK_DISPATCH         — target 5s
 *   • BANK_ACKNOWLEDGMENT   — target 30s (pain.002)
 *   • EGP_SETTLEMENT        — target 2h
 *   • USD_SETTLEMENT        — target 4h
 *
 * Breaches surface as Smart Inbox items to operations and feed the Trade
 * Health Score. SLA credits accrue on breaches (e.g. 1 credit per breach;
 * cumulative credits per trade surface in the Trade Health Score panel).
 *
 * Each SLA is recorded in ConfigurationHistory under `pay_sla:{ustn}:{legId}:{slaType}`
 * with the start/end timestamps, breach status, and credit count so the full
 * SLA lifecycle is recoverable per leg per USTN.
 *
 * All DB writes are defensive (try/catch).
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §13.11 Constants ============

export type SlaType =
  | "MANIFEST_GENERATION"
  | "BANK_DISPATCH"
  | "BANK_ACKNOWLEDGMENT"
  | "EGP_SETTLEMENT"
  | "USD_SETTLEMENT";

export interface SlaTarget {
  slaType: SlaType;
  label: string;
  targetMs: number;
  creditOnBreach: number;
}

export const SLA_TARGETS: Record<SlaType, SlaTarget> = {
  MANIFEST_GENERATION: {
    slaType: "MANIFEST_GENERATION",
    label: "Manifest generation < 1s",
    targetMs: 1_000,
    creditOnBreach: 1,
  },
  BANK_DISPATCH: {
    slaType: "BANK_DISPATCH",
    label: "Bank dispatch < 5s",
    targetMs: 5_000,
    creditOnBreach: 1,
  },
  BANK_ACKNOWLEDGMENT: {
    slaType: "BANK_ACKNOWLEDGMENT",
    label: "Bank acknowledgment (pain.002) < 30s",
    targetMs: 30_000,
    creditOnBreach: 2,
  },
  EGP_SETTLEMENT: {
    slaType: "EGP_SETTLEMENT",
    label: "EGP settlement < 2h",
    targetMs: 2 * 60 * 60 * 1000,
    creditOnBreach: 3,
  },
  USD_SETTLEMENT: {
    slaType: "USD_SETTLEMENT",
    label: "USD settlement < 4h",
    targetMs: 4 * 60 * 60 * 1000,
    creditOnBreach: 3,
  },
};

export const ALL_SLA_TYPES = Object.keys(SLA_TARGETS) as SlaType[];

// ============ Types ============

export interface RecordSlaStartInput {
  ustn: string;
  legId: string;
  slaType: SlaType;
}

export interface RecordSlaStartResult {
  slaId: string;
  ustn: string;
  legId: string;
  slaType: SlaType;
  startedAt: string;
  targetDuration: number; // ms
}

export interface RecordSlaEndResult {
  slaId: string;
  ustn: string;
  legId: string;
  slaType: SlaType;
  endedAt: string;
  duration: number;       // ms
  breached: boolean;
  creditsAccrued: number;
}

export interface SlaStatusByLeg {
  legId: string;
  slaId: string;
  slaType: SlaType;
  startedAt: string;
  endedAt: string | null;
  duration: number | null;
  targetMs: number;
  breached: boolean;
  creditsAccrued: number;
  label: string;
}

export interface SlaStatusByUstn {
  ustn: string;
  by_leg: SlaStatusByLeg[];
  breaches: SlaStatusByLeg[];
  credits_accrued: number;
}

export interface SlaBreachFilters {
  ustn?: string;
  legId?: string;
  slaType?: SlaType;
  sinceIso?: string;
  limit?: number;
}

export interface SlaBreachesResult {
  breaches: SlaStatusByLeg[];
  count: number;
}

export interface NotifySlaBreachResult {
  notified: boolean;
  inboxItemId: string | null;
  creditCount: number;
}

// ============ Helpers ============

function nowIso(): string {
  return new Date().toISOString();
}

function slaConfigKey(ustn: string, legId: string, slaType: SlaType): string {
  return `pay_sla:${ustn}:${legId}:${slaType}`;
}

function makeSlaId(ustn: string, legId: string, slaType: SlaType): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SLA-${slaType.slice(0, 3)}-${legId.slice(-6)}-${ts}-${rand}`;
}

async function findOpsAdmin(): Promise<{ gtid: string; legalName: string } | null> {
  try {
    const admin = await db.tenant.findFirst({
      where: { OR: [{ type: "ADM" }, { type: "GOV" }] },
      select: { gtid: true, legalName: true },
    });
    return admin ?? null;
  } catch {
    return null;
  }
}

// ============ §13.11.1 recordSlaStart ============

export async function recordSlaStart(
  input: RecordSlaStartInput,
): Promise<RecordSlaStartResult> {
  const { ustn, legId, slaType } = input;
  const target = SLA_TARGETS[slaType];
  if (!target) throw new Error(`Unknown SLA type: ${slaType}`);

  const startedAt = nowIso();
  const slaId = makeSlaId(ustn, legId, slaType);
  const newValue = JSON.stringify({
    slaId,
    ustn,
    legId,
    slaType,
    startedAt,
    endedAt: null,
    duration: null,
    targetMs: target.targetMs,
    breached: false,
    creditsAccrued: 0,
    label: target.label,
  });

  try {
    await db.configurationHistory.create({
      data: {
        configKey: slaConfigKey(ustn, legId, slaType),
        oldValue: null,
        newValue,
        changedByGtid: "SGTX-SLA-WORKER",
        changeReason: `payment_sla:start:${slaType}:${legId}`,
        version: 1,
      },
    });
  } catch (e: any) {
    logger.error("[payment-sla] recordSlaStart persist failed", {
      ustn, legId, slaType, error: e?.message,
    });
  }

  return {
    slaId,
    ustn,
    legId,
    slaType,
    startedAt,
    targetDuration: target.targetMs,
  };
}

// ============ §13.11.2 recordSlaEnd ============

export async function recordSlaEnd(
  ustn: string,
  legId: string,
  slaType: SlaType,
): Promise<RecordSlaEndResult> {
  const target = SLA_TARGETS[slaType];
  if (!target) throw new Error(`Unknown SLA type: ${slaType}`);

  const endedAt = nowIso();
  const key = slaConfigKey(ustn, legId, slaType);

  // Read the most recent start record
  let startRow: any = null;
  try {
    startRow = await db.configurationHistory.findFirst({
      where: { configKey: key },
      orderBy: { version: "desc" },
    });
  } catch (e: any) {
    logger.warn("[payment-sla] recordSlaEnd read failed", {
      ustn, legId, slaType, error: e?.message,
    });
  }

  if (!startRow || !startRow.newValue) {
    throw new Error(`No SLA start record found for ${key}`);
  }

  const parsed = JSON.parse(startRow.newValue);
  if (parsed.endedAt) {
    // SLA already closed — return existing
    return {
      slaId: parsed.slaId,
      ustn,
      legId,
      slaType,
      endedAt: parsed.endedAt,
      duration: parsed.duration,
      breached: parsed.breached,
      creditsAccrued: parsed.creditsAccrued,
    };
  }

  const startMs = new Date(parsed.startedAt).getTime();
  const endMs = new Date(endedAt).getTime();
  const duration = Math.max(0, endMs - startMs);
  const breached = duration > target.targetMs;
  const creditsAccrued = breached ? target.creditOnBreach : 0;
  const slaId = parsed.slaId;

  const updatedValue = JSON.stringify({
    ...parsed,
    endedAt,
    duration,
    breached,
    creditsAccrued,
  });

  try {
    await db.configurationHistory.create({
      data: {
        configKey: key,
        oldValue: startRow.newValue,
        newValue: updatedValue,
        changedByGtid: "SGTX-SLA-WORKER",
        changeReason: `payment_sla:end:${slaType}:${legId}:breached=${breached}`,
        version: (startRow.version ?? 1) + 1,
      },
    });
  } catch (e: any) {
    logger.error("[payment-sla] recordSlaEnd persist failed", {
      ustn, legId, slaType, error: e?.message,
    });
  }

  // If breached → notify operations + record credit
  if (breached) {
    await notifySlaBreach(ustn, legId, slaType, duration);
  }

  return {
    slaId,
    ustn,
    legId,
    slaType,
    endedAt,
    duration,
    breached,
    creditsAccrued,
  };
}

// ============ §13.11.3 getSlaStatus ============

export async function getSlaStatus(ustn: string): Promise<SlaStatusByUstn> {
  // Find all SLA records for this USTN. We do a startsWith scan over the
  // configKey prefix `pay_sla:{ustn}:` — SQLite supports this efficiently.
  const prefix = `pay_sla:${ustn}:`;
  let rows: any[] = [];
  try {
    rows = await db.configurationHistory.findMany({
      where: { configKey: { startsWith: prefix } },
      orderBy: { version: "desc" },
    });
  } catch (e: any) {
    logger.warn("[payment-sla] getSlaStatus findMany failed", { ustn, error: e?.message });
    return { ustn, by_leg: [], breaches: [], credits_accrued: 0 };
  }

  // Deduplicate by configKey (keep most recent version per key)
  const byKey = new Map<string, any>();
  for (const r of rows) {
    if (!byKey.has(r.configKey)) byKey.set(r.configKey, r);
  }

  const by_leg: SlaStatusByLeg[] = [];
  const breaches: SlaStatusByLeg[] = [];
  let credits_accrued = 0;

  for (const r of byKey.values()) {
    if (!r.newValue) continue;
    try {
      const p = JSON.parse(r.newValue);
      const entry: SlaStatusByLeg = {
        legId: p.legId,
        slaId: p.slaId,
        slaType: p.slaType,
        startedAt: p.startedAt,
        endedAt: p.endedAt ?? null,
        duration: p.duration ?? null,
        targetMs: p.targetMs,
        breached: p.breached ?? false,
        creditsAccrued: p.creditsAccrued ?? 0,
        label: p.label ?? SLA_TARGETS[p.slaType as SlaType]?.label ?? p.slaType,
      };
      by_leg.push(entry);
      if (entry.breached) {
        breaches.push(entry);
        credits_accrued += entry.creditsAccrued;
      }
    } catch {
      // skip malformed
    }
  }

  return { ustn, by_leg, breaches, credits_accrued };
}

// ============ §13.11.4 getSlaBreaches ============

export async function getSlaBreaches(filters: SlaBreachFilters = {}): Promise<SlaBreachesResult> {
  const limit = Math.min(filters.limit ?? 100, 500);
  // Scan all SLA records (startsWith `pay_sla:`). SQLite handles this with
  // the index on configKey. We filter in-memory after JSON parse.
  let rows: any[] = [];
  try {
    rows = await db.configurationHistory.findMany({
      where: { configKey: { startsWith: "pay_sla:" } },
      orderBy: { version: "desc" },
    });
  } catch (e: any) {
    logger.warn("[payment-sla] getSlaBreaches findMany failed", { error: e?.message });
    return { breaches: [], count: 0 };
  }

  const byKey = new Map<string, any>();
  for (const r of rows) {
    if (!byKey.has(r.configKey)) byKey.set(r.configKey, r);
  }

  const breaches: SlaStatusByLeg[] = [];
  for (const r of byKey.values()) {
    if (!r.newValue) continue;
    try {
      const p = JSON.parse(r.newValue);
      if (!p.breached) continue;
      if (filters.ustn && p.ustn !== filters.ustn) continue;
      if (filters.legId && p.legId !== filters.legId) continue;
      if (filters.slaType && p.slaType !== filters.slaType) continue;
      if (filters.sinceIso && p.endedAt && new Date(p.endedAt) < new Date(filters.sinceIso)) continue;
      breaches.push({
        legId: p.legId,
        slaId: p.slaId,
        slaType: p.slaType,
        startedAt: p.startedAt,
        endedAt: p.endedAt ?? null,
        duration: p.duration ?? null,
        targetMs: p.targetMs,
        breached: true,
        creditsAccrued: p.creditsAccrued ?? 0,
        label: p.label ?? SLA_TARGETS[p.slaType as SlaType]?.label ?? p.slaType,
      });
    } catch {
      // skip malformed
    }
  }

  const sliced = breaches.slice(0, limit);
  return { breaches: sliced, count: breaches.length };
}

// ============ §13.11.5 notifySlaBreach ============

export async function notifySlaBreach(
  ustn: string,
  legId: string,
  slaType: SlaType,
  breachDuration: number,
): Promise<NotifySlaBreachResult> {
  const target = SLA_TARGETS[slaType];
  if (!target) {
    return { notified: false, inboxItemId: null, creditCount: 0 };
  }

  const creditCount = target.creditOnBreach;
  const admin = await findOpsAdmin();
  let inboxItemId: string | null = null;

  if (admin) {
    try {
      const inbox = await db.inboxItem.create({
        data: {
          tenantGtid: admin.gtid,
          category: "COMPLIANCE",
          priority: 90,
          title: `SLA breach — ${target.label} (leg ${legId})`,
          description:
            `Payment SLA breached for USTN ${ustn}, leg ${legId}. ` +
            `SLA: ${target.label}. Target: ${target.targetMs} ms. ` +
            `Actual: ${breachDuration} ms (overshoot: ${breachDuration - target.targetMs} ms). ` +
            `Credits accrued: ${creditCount}.`,
          ctaLabel: "Investigate Leg",
        },
      });
      inboxItemId = inbox.id;
    } catch (e: any) {
      logger.warn("[payment-sla] notifySlaBreach inbox failed", {
        ustn, legId, slaType, error: e?.message,
      });
    }
  }

  // Record the credit accrual in ConfigurationHistory so it feeds the
  // Trade Health Score (cumulative breach credits per USTN).
  try {
    await db.configurationHistory.create({
      data: {
        configKey: `pay_sla_credits:${ustn}`,
        oldValue: null,
        newValue: JSON.stringify({
          ustn,
          legId,
          slaType,
          breachDuration,
          creditsAccrued: creditCount,
          creditedAt: nowIso(),
          label: target.label,
        }),
        changedByGtid: "SGTX-SLA-WORKER",
        changeReason: `payment_sla:credit:${slaType}:${legId}`,
        version: Math.floor(Date.now() / 1000),
      },
    });
  } catch (e: any) {
    logger.warn("[payment-sla] credit persist failed", {
      ustn, legId, slaType, error: e?.message,
    });
  }

  return { notified: inboxItemId !== null, inboxItemId, creditCount };
}

// ============ §13.11.6 listSlaTargets (pure helper) ============

export function listSlaTargets(): SlaTarget[] {
  return ALL_SLA_TYPES.map((t) => SLA_TARGETS[t]);
}

/**
 * Total accrued credits across all breaches for a USTN. Reads the
 * `pay_sla_credits:{ustn}` log entries and sums them.
 */
export async function getTotalSlaCredits(ustn: string): Promise<number> {
  try {
    const rows = await db.configurationHistory.findMany({
      where: { configKey: `pay_sla_credits:${ustn}` },
    });
    let total = 0;
    for (const r of rows) {
      if (!r.newValue) continue;
      try {
        const p = JSON.parse(r.newValue);
        if (typeof p.creditsAccrued === "number") total += p.creditsAccrued;
      } catch {
        // skip
      }
    }
    return total;
  } catch (e: any) {
    logger.warn("[payment-sla] getTotalSlaCredits failed", { ustn, error: e?.message });
    return 0;
  }
}
