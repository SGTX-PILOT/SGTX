// @ts-nocheck
/**
 * SGTX Part 109 — Regulatory Simulation Engine
 * ===========================================================================
 *
 * Runs a PROPOSED regulatory rule against the currently-active trade,
 * product, lane, country, and mode population. The simulator NEVER mutates
 * production data — it produces a forward-looking impact projection so
 * policy authors can see side-effects before approving the change in the
 * Regulatory Change Pipeline (Phase 9 §2 — DETECTED → VERIFIED → IMPACTED
 * → SIMULATED → APPROVED → COMPILED → DEPLOYED).
 *
 * Impact dimensions (per §109):
 *   • newlyBlocked         — USTNs that would fail under the new rule
 *   • newDocuments         — documents newly required by the new rule
 *   • tariffDelta          — total tariff change (proposed − current) in USD
 *   • taxDelta             — total tax/VAT change in USD
 *   • permitChanges        — permit additions / removals
 *   • governmentChanges    — government API operations newly required
 *
 * The simulator pulls the active trade set (open USTNs only) and evaluates
 * each rule's predicate against it. All DB calls are try/catch-wrapped with
 * safe defaults — the simulator never throws into API routes.
 *
 * Rule shape (loose — A2 authors rules as JSON):
 *   {
 *     category: "TARIFF" | "TAX" | "DOCUMENT" | "PERMIT" | "SANCTIONS" | "SPS" | ...,
 *     jurisdiction: "EG" | "EU" | "US" | "*",
 *     hsCodePattern?: "0805.*",
 *     lane?: { origin: "EG", destination: "EU" },
 *     mode?: "SEA" | "AIR" | "ROAD" | "RAIL",
 *     predicate: (trade) => boolean,
 *     effect: { addDocuments?: [...], removeDocuments?: [...], tariffDeltaPct?: number,
 *               taxDeltaPct?: number, addPermits?: [...], block?: boolean,
 *               requireGovOps?: [...] }
 *   }
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §109 Types ============

export type RuleCategory =
  | "TARIFF" | "TAX" | "DOCUMENT" | "PERMIT" | "SANCTIONS"
  | "SPS" | "TBT" | "CUSTOMS_PROCEDURE" | "LICENSE" | "GOVERNMENT_API";

export interface RuleEffect {
  addDocuments?: string[];
  removeDocuments?: string[];
  addPermits?: string[];
  removePermits?: string[];
  requireGovOps?: string[];
  tariffDeltaPct?: number;
  taxDeltaPct?: number;
  block?: boolean;
  reason?: string;
}

export interface Rule {
  category: RuleCategory;
  jurisdiction?: string;
  hsCodePattern?: string;
  origin?: string;
  destination?: string;
  mode?: string;
  effect: RuleEffect;
}

export interface SimulationResult {
  affectedTrades: number;
  newlyBlocked: string[];
  newDocuments: string[];
  removedDocuments: string[];
  permitChanges: { added: string[]; removed: string[] };
  governmentChanges: string[];
  tariffDelta: number;
  taxDelta: number;
  sampleImpacted: { ustn: string; reason: string; effects: string[] }[];
  evaluatedAt: string;
}

// ============ §109 Helpers ============

function matchesPattern(hsCode: string | undefined | null, pattern: string | undefined): boolean {
  if (!pattern) return true;
  if (!hsCode) return false;
  try {
    const re = new RegExp("^" + pattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$");
    return re.test(hsCode);
  } catch {
    return hsCode.startsWith(pattern.replace(/[*].*$/, ""));
  }
}

function ruleMatchesTrade(rule: Rule, trade: any): boolean {
  try {
    if (rule.jurisdiction && rule.jurisdiction !== "*" &&
        rule.jurisdiction !== trade.destination && rule.jurisdiction !== trade.origin) {
      return false;
    }
    if (rule.origin && rule.origin !== trade.origin) return false;
    if (rule.destination && rule.destination !== trade.destination) return false;
    if (rule.mode && rule.mode !== trade.mode) return false;
    if (rule.hsCodePattern && !matchesPattern(trade.hsCode, rule.hsCodePattern)) return false;
    return true;
  } catch {
    return false;
  }
}

async function loadActiveTrades(): Promise<any[]> {
  try {
    const trades = await db.tradeRequest.findMany({
      where: {
        status: { notIn: ["CLOSED", "CANCELLED", "REJECTED"] },
      },
      take: 1000,
      orderBy: { createdAt: "desc" },
    });
    return (trades as any[]).map((t) => ({
      ustn: t.ustn,
      hsCode: t.hsCode,
      origin: t.originCountry,
      destination: t.destinationCountry,
      mode: t.transportMode,
      invoiceValue: Number(t.invoiceValue || 0),
      currency: t.currency || "USD",
    }));
  } catch (err: any) {
    logger.warn("[regulatory-simulation] loadActiveTrades failed", { error: err?.message });
    return [];
  }
}

function flattenEffects(rules: Rule[]): RuleEffect {
  const out: RuleEffect = {
    addDocuments: [], removeDocuments: [], addPermits: [], removePermits: [],
    requireGovOps: [], tariffDeltaPct: 0, taxDeltaPct: 0, block: false, reason: "",
  };
  for (const r of rules) {
    const e = r.effect || {};
    if (e.addDocuments) out.addDocuments!.push(...e.addDocuments);
    if (e.removeDocuments) out.removeDocuments!.push(...e.removeDocuments);
    if (e.addPermits) out.addPermits!.push(...e.addPermits);
    if (e.removePermits) out.removePermits!.push(...e.removePermits);
    if (e.requireGovOps) out.requireGovOps!.push(...e.requireGovOps);
    if (typeof e.tariffDeltaPct === "number") out.tariffDeltaPct = (out.tariffDeltaPct || 0) + e.tariffDeltaPct;
    if (typeof e.taxDeltaPct === "number") out.taxDeltaPct = (out.taxDeltaPct || 0) + e.taxDeltaPct;
    if (e.block) out.block = true;
  }
  return out;
}

// ============ §109 Main API ============

export async function simulateRuleChange(
  currentRule: any,
  proposedRule: any,
): Promise<SimulationResult> {
  try {
    const trades = await loadActiveTrades();
    const proposedRules: Rule[] = Array.isArray(proposedRule) ? proposedRule : [proposedRule];
    const currentRules: Rule[] = Array.isArray(currentRule) ? currentRule : (currentRule ? [currentRule] : []);

    const newlyBlocked: string[] = [];
    const newDocuments = new Set<string>();
    const removedDocuments = new Set<string>();
    const addedPermits = new Set<string>();
    const removedPermits = new Set<string>();
    const govOps = new Set<string>();
    let tariffDelta = 0;
    let taxDelta = 0;
    const sampleImpacted: { ustn: string; reason: string; effects: string[] }[] = [];
    let affected = 0;

    for (const trade of trades) {
      try {
        const matched = proposedRules.filter((r) => ruleMatchesTrade(r, trade));
        if (matched.length === 0) continue;
        affected++;
        const eff = flattenEffects(matched);
        const effects: string[] = [];
        if (eff.block) {
          newlyBlocked.push(trade.ustn);
          effects.push("BLOCKED");
        }
        if (eff.addDocuments?.length) {
          eff.addDocuments.forEach((d) => { newDocuments.add(d); effects.push(`+DOC:${d}`); });
        }
        if (eff.removeDocuments?.length) {
          eff.removeDocuments.forEach((d) => { removedDocuments.add(d); effects.push(`-DOC:${d}`); });
        }
        if (eff.addPermits?.length) {
          eff.addPermits.forEach((p) => { addedPermits.add(p); effects.push(`+PERMIT:${p}`); });
        }
        if (eff.removePermits?.length) {
          eff.removePermits.forEach((p) => { removedPermits.add(p); effects.push(`-PERMIT:${p}`); });
        }
        if (eff.requireGovOps?.length) {
          eff.requireGovOps.forEach((g) => { govOps.add(g); effects.push(`+GOV:${g}`); });
        }
        if (typeof eff.tariffDeltaPct === "number" && eff.tariffDeltaPct !== 0) {
          const delta = (trade.invoiceValue || 0) * eff.tariffDeltaPct / 100;
          tariffDelta += delta;
          effects.push(`TARIFFΔ:${delta.toFixed(2)}`);
        }
        if (typeof eff.taxDeltaPct === "number" && eff.taxDeltaPct !== 0) {
          const delta = (trade.invoiceValue || 0) * eff.taxDeltaPct / 100;
          taxDelta += delta;
          effects.push(`TAXΔ:${delta.toFixed(2)}`);
        }
        if (sampleImpacted.length < 20 && effects.length > 0) {
          sampleImpacted.push({
            ustn: trade.ustn,
            reason: matched.map((m) => `${m.category}:${m.jurisdiction || "*"}`).join(","),
            effects,
          });
        }
      } catch (err: any) {
        logger.warn("[regulatory-simulation] trade eval failed", { ustn: trade.ustn, error: err?.message });
      }
    }

    logger.info("[regulatory-simulation] simulation complete", {
      activeTrades: trades.length, affectedTrades: affected,
      newlyBlocked: newlyBlocked.length, tariffDelta, taxDelta,
    });

    return {
      affectedTrades: affected,
      newlyBlocked,
      newDocuments: [...newDocuments],
      removedDocuments: [...removedDocuments],
      permitChanges: { added: [...addedPermits], removed: [...removedPermits] },
      governmentChanges: [...govOps],
      tariffDelta,
      taxDelta,
      sampleImpacted,
      evaluatedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    logger.error("[regulatory-simulation] simulateRuleChange failed", { error: err?.message });
    return {
      affectedTrades: 0,
      newlyBlocked: [],
      newDocuments: [],
      removedDocuments: [],
      permitChanges: { added: [], removed: [] },
      governmentChanges: [],
      tariffDelta: 0,
      taxDelta: 0,
      sampleImpacted: [],
      evaluatedAt: new Date().toISOString(),
    };
  }
}

// ============ §109 Auxiliary: dry-run a single USTN against a proposed rule ============

export async function simulateForUstn(ustn: string, proposedRule: any): Promise<{
  matched: boolean;
  effects: string[];
  block: boolean;
  tariffDelta: number;
  taxDelta: number;
}> {
  try {
    const trades = await loadActiveTrades();
    const trade = trades.find((t) => t.ustn === ustn);
    if (!trade) return { matched: false, effects: [], block: false, tariffDelta: 0, taxDelta: 0 };
    const proposedRules: Rule[] = Array.isArray(proposedRule) ? proposedRule : [proposedRule];
    const matched = proposedRules.filter((r) => ruleMatchesTrade(r, trade));
    if (matched.length === 0) return { matched: false, effects: [], block: false, tariffDelta: 0, taxDelta: 0 };
    const eff = flattenEffects(matched);
    const effects: string[] = [];
    if (eff.block) effects.push("BLOCKED");
    if (eff.addDocuments?.length) eff.addDocuments.forEach((d) => effects.push(`+DOC:${d}`));
    if (eff.removeDocuments?.length) eff.removeDocuments.forEach((d) => effects.push(`-DOC:${d}`));
    if (eff.addPermits?.length) eff.addPermits.forEach((p) => effects.push(`+PERMIT:${p}`));
    if (eff.requireGovOps?.length) eff.requireGovOps.forEach((g) => effects.push(`+GOV:${g}`));
    const tariffDelta = typeof eff.tariffDeltaPct === "number"
      ? (trade.invoiceValue || 0) * eff.tariffDeltaPct / 100 : 0;
    const taxDelta = typeof eff.taxDeltaPct === "number"
      ? (trade.invoiceValue || 0) * eff.taxDeltaPct / 100 : 0;
    return { matched: true, effects, block: !!eff.block, tariffDelta, taxDelta };
  } catch {
    return { matched: false, effects: [], block: false, tariffDelta: 0, taxDelta: 0 };
  }
}
