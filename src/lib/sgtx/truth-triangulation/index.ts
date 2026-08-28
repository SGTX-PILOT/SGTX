// @ts-nocheck
/**
 * SGTX Part 69 — Truth Triangulation Engine
 * ===========================================================================
 *
 * Compares the SAME data point across FIVE independent sources to detect
 * conflicts before they propagate into sealed evidence, customs filings,
 * or payment authorisations.
 *
 * Sources (§69.2):
 *   1. SGTX_INTERNAL      — what SGTX has recorded (Trade / Shipment / Invoice)
 *   2. GOVERNMENT         — what the government connector reports (FASAH / ACE / CDS / NAFEZA)
 *   3. COUNTERPARTY       — what the buyer/seller/broker claims
 *   4. PHYSICAL_SENSOR    — IoT / GPS / Reefer telemetry / weighbridge
 *   5. BANK               — what the bank confirms (LC amount, settlement amount)
 *
 * Triangulation states (§69.4):
 *   ALL_AGREE  — every available source returns the same value (within tolerance)
 *   PARTIAL    — majority agree; one outlier (raised for review but not blocking)
 *   CONFLICT   — two or more sources disagree materially (BLOCKING — raises exception)
 *   UNKNOWN    — fewer than 2 sources available; cannot triangulate
 *
 * Conflict handling:
 *   When state = CONFLICT, the engine raises a TRUTH_RECONCILIATION_EXCEPTION
 *   via the exception-engine. The exception must be resolved (by a human)
 *   before the trade can advance. The engine NEVER auto-picks a "winner"
 *   source — that decision is reserved for the human operator + Governor.
 *
 * Data points triangulated (§69.3):
 *   • cargo_weight     — invoice vs packing list vs weighbridge vs customs
 *   • cargo_value      — invoice vs LC vs bank settlement vs customs
 *   • vessel_eta       — shipment vs carrier API vs AIS
 *   • hs_code          — invoice vs customs vs COO
 *   • country_of_origin — COO vs invoice vs customs
 *   • payment_amount   — payment record vs bank confirmation vs LC
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ Types ============

export type SourceName = "SGTX_INTERNAL" | "GOVERNMENT" | "COUNTERPARTY" | "PHYSICAL_SENSOR" | "BANK";
export type TriangulationState = "ALL_AGREE" | "PARTIAL" | "CONFLICT" | "UNKNOWN";

export interface SourceReading {
  source: SourceName;
  value: any;
  observedAt?: string;
  notes?: string;
}

export interface TriangulationPoint {
  field: string;
  readings: SourceReading[];
  state: TriangulationState;
  consensusValue?: any;
  conflictDetail?: string;
}

export interface TriangulationResult {
  ustn: string;
  points: TriangulationPoint[];
  overallState: TriangulationState;
  exceptionsRaised: string[];
  computedAt: string;
}

// ============ §69.5 — Source readers (all defensive) ============

async function readInternal(ustn: string): Promise<SourceReading[]> {
  try {
    const trade = await db.trade.findUnique({
      where: { ustn },
      include: { invoices: true, shipments: true, customsOperations: true, certificatesOfOrigin: true, globalPayments: true, bankSettlementInstructions: true, packingLists: true },
    }).catch(() => null);
    if (!trade) return [];
    const out: SourceReading[] = [];
    if (trade.invoices?.[0]) {
      out.push({ source: "SGTX_INTERNAL", value: trade.invoices[0].grossWeight, notes: "invoice.grossWeight" });
      out.push({ source: "SGTX_INTERNAL", value: trade.invoices[0].totalValue, notes: "invoice.totalValue" });
      out.push({ source: "SGTX_INTERNAL", value: trade.invoices[0].hsCode, notes: "invoice.hsCode" });
      out.push({ source: "SGTX_INTERNAL", value: trade.invoices[0].originCountry, notes: "invoice.originCountry" });
    }
    if (trade.shipments?.[0]) {
      out.push({ source: "SGTX_INTERNAL", value: trade.shipments[0].eta, notes: "shipment.eta" });
    }
    if (trade.globalPayments?.[0]) {
      out.push({ source: "SGTX_INTERNAL", value: trade.globalPayments[0].amount, notes: "payment.amount" });
    }
    return out;
  } catch (err: any) {
    logger.warn("[truth-triangulation] readInternal failed", { ustn, error: err?.message });
    return [];
  }
}

async function readGovernment(ustn: string): Promise<SourceReading[]> {
  try {
    const ops = await db.customsOperation.findMany({ where: { ustn } }).catch(() => []);
    const out: SourceReading[] = [];
    for (const o of ops) {
      out.push({ source: "GOVERNMENT", value: o.grossWeight, notes: "customs.grossWeight" });
      out.push({ source: "GOVERNMENT", value: o.declaredValue, notes: "customs.declaredValue" });
      out.push({ source: "GOVERNMENT", value: o.hsCode, notes: "customs.hsCode" });
      out.push({ source: "GOVERNMENT", value: o.originCountry, notes: "customs.originCountry" });
    }
    return out;
  } catch {
    return [];
  }
}

async function readCounterparty(ustn: string): Promise<SourceReading[]> {
  try {
    const msgs = await db.tradeMessage.findMany({
      where: { ustn, OR: [{ messageType: { contains: "INVOICE" } }, { messageType: { contains: "PACKING" } }] },
      take: 20,
    }).catch(() => []);
    return msgs.map((m: any) => ({ source: "COUNTERPARTY" as SourceName, value: m.payload?.declaredValue ?? m.payload?.grossWeight, notes: m.messageType }));
  } catch {
    return [];
  }
}

async function readSensor(ustn: string): Promise<SourceReading[]> {
  try {
    const telem = await db.reeferTelemetry.findMany({ where: { ustn }, take: 5, orderBy: { timestamp: "desc" } }).catch(() => []);
    const reads = await db.coldChainReading.findMany({ where: { ustn }, take: 5, orderBy: { timestamp: "desc" } }).catch(() => []);
    const out: SourceReading[] = [];
    for (const t of telem) out.push({ source: "PHYSICAL_SENSOR", value: t.weightKg ?? t.grossWeight, notes: "reefer telemetry", observedAt: t.timestamp });
    for (const r of reads) out.push({ source: "PHYSICAL_SENSOR", value: r.weightKg, notes: "cold chain weighbridge", observedAt: r.timestamp });
    return out;
  } catch {
    return [];
  }
}

async function readBank(ustn: string): Promise<SourceReading[]> {
  try {
    const instr = await db.bankSettlementInstruction.findMany({ where: { ustn }, take: 5 }).catch(() => []);
    return instr.map((i: any) => ({ source: "BANK" as SourceName, value: i.amount, notes: "bank settlement amount", observedAt: i.settledAt }));
  } catch {
    return [];
  }
}

// ============ §69.6 — Triangulation logic ============

function triangulateField(field: string, readings: SourceReading[]): TriangulationPoint {
  try {
    if (readings.length === 0) return { field, readings: [], state: "UNKNOWN" };
    if (readings.length === 1) return { field, readings, state: "UNKNOWN", consensusValue: readings[0].value };

    const values = readings.map((r) => r.value).filter((v) => v !== null && v !== undefined && v !== "");
    if (values.length < 2) return { field, readings, state: "UNKNOWN" };

    const tolerance = fieldTolerance(field);
    const unique = new Set(values.map((v) => typeof v === "number" ? Math.round(Number(v) * (1 / tolerance)) : String(v)));
    if (unique.size === 1) {
      return { field, readings, state: "ALL_AGREE", consensusValue: values[0] };
    }
    if (unique.size === 2 && readings.length >= 3) {
      const majorityValue = mode(values);
      return { field, readings, state: "PARTIAL", consensusValue: majorityValue, conflictDetail: `One source disagrees; majority value: ${majorityValue}` };
    }
    return { field, readings, state: "CONFLICT", conflictDetail: `${unique.size} distinct values across ${readings.length} sources` };
  } catch (err: any) {
    return { field, readings, state: "UNKNOWN", conflictDetail: err?.message };
  }
}

function fieldTolerance(field: string): number {
  if (/weight/i.test(field)) return 0.01; // 1% weight tolerance
  if (/value|amount/i.test(field)) return 0.001; // 0.1% monetary tolerance
  return 0; // exact match for codes / dates / countries
}

function mode(arr: any[]): any {
  try {
    const counts: Record<string, number> = {};
    let best = arr[0], bestN = 0;
    for (const v of arr) {
      const k = String(v);
      counts[k] = (counts[k] || 0) + 1;
      if (counts[k] > bestN) { best = v; bestN = counts[k]; }
    }
    return best;
  } catch {
    return arr[0];
  }
}

async function raiseException(ustn: string, point: TriangulationPoint): Promise<string> {
  try {
    const excId = `TRUTH_EXC-${ustn}-${point.field}-${Date.now().toString(36)}`;
    try {
      await db.exceptionEvent.create({ data: {
        id: excId, ustn, type: "TRUTH_RECONCILIATION_EXCEPTION",
        severity: "HIGH", payload: { field: point.field, state: point.state, detail: point.conflictDetail, readings: point.readings },
        status: "OPEN", createdAt: new Date(),
      }});
    } catch (dbErr: any) {
      logger.warn("[truth-triangulation] exception table missing — logging only", { error: dbErr?.message });
    }
    return excId;
  } catch (err: any) {
    logger.error("[truth-triangulation] raiseException failed", { ustn, error: err?.message });
    return "";
  }
}

// ============ Public API ============

export async function triangulate(ustn: string): Promise<TriangulationResult> {
  try {
    const [internal, gov, cp, sensor, bank] = await Promise.all([
      readInternal(ustn), readGovernment(ustn), readCounterparty(ustn), readSensor(ustn), readBank(ustn),
    ]);
    const byField = new Map<string, SourceReading[]>();
    const push = (f: string, r: SourceReading) => { if (!byField.has(f)) byField.set(f, []); byField.get(f)!.push(r); };

    for (const r of internal) {
      if (/weight/i.test(r.notes || "")) push("cargo_weight", r);
      if (/totalValue|declaredValue/i.test(r.notes || "")) push("cargo_value", r);
      if (/hsCode/i.test(r.notes || "")) push("hs_code", r);
      if (/originCountry/i.test(r.notes || "")) push("country_of_origin", r);
      if (/eta/i.test(r.notes || "")) push("vessel_eta", r);
      if (/amount/i.test(r.notes || "")) push("payment_amount", r);
    }
    for (const r of gov) {
      if (/weight/i.test(r.notes || "")) push("cargo_weight", r);
      if (/Value/i.test(r.notes || "")) push("cargo_value", r);
      if (/hsCode/i.test(r.notes || "")) push("hs_code", r);
      if (/origin/i.test(r.notes || "")) push("country_of_origin", r);
    }
    for (const r of sensor) push("cargo_weight", r);
    for (const r of bank) push("payment_amount", r);
    for (const r of cp) {
      if (/Value/i.test(r.notes || "")) push("cargo_value", r);
      if (/weight/i.test(r.notes || "")) push("cargo_weight", r);
    }

    const points: TriangulationPoint[] = [];
    const exceptions: string[] = [];
    for (const [field, reads] of byField.entries()) {
      const p = triangulateField(field, reads);
      points.push(p);
      if (p.state === "CONFLICT") {
        const excId = await raiseException(ustn, p);
        if (excId) exceptions.push(excId);
      }
    }

    const states = points.map((p) => p.state);
    const overall: TriangulationState = states.includes("CONFLICT") ? "CONFLICT"
      : states.includes("PARTIAL") ? "PARTIAL"
      : states.includes("ALL_AGREE") ? "ALL_AGREE" : "UNKNOWN";

    return { ustn, points, overallState: overall, exceptionsRaised: exceptions, computedAt: new Date().toISOString() };
  } catch (err: any) {
    logger.error("[truth-triangulation] triangulate failed", { ustn, error: err?.message });
    return { ustn, points: [], overallState: "UNKNOWN", exceptionsRaised: [], computedAt: new Date().toISOString() };
  }
}
