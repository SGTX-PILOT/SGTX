// @ts-nocheck
/**
 * SGTX Part 67 + 106 + 107 — Next Required Actions / Trade Blocker / What Happens Next
 * ===========================================================================
 *
 * Three related advisory primitives:
 *
 *   • Part 67  — getNextRequiredActions(ustn): the deterministic ranked
 *                list of actions required to advance the trade, each
 *                with: action, owner, deadline, dependency, blocker,
 *                evidence, source, legal basis, next system/API/portal.
 *
 *   • Part 106 — getTradeBlocker(ustn): the BLOCKER → DEPENDENCY →
 *                REQUIRED ACTION → OWNER → DEADLINE → SOURCE → LEGAL
 *                BASIS → CONSEQUENCE chain. Used by the "Why Is This
 *                Trade Blocked?" portal query. Returns ONLY the first
 *                (highest-priority) blocking chain — operators resolve
 *                one blocker at a time.
 *
 *   • Part 107 — getWhatHappensNext(ustn): the deterministic next-step
 *                sequence based on the current trade state. Returns the
 *                ordered list of NEXT milestones the trade will pass
 *                through. Purely informational — does NOT mutate state.
 *
 * Authority: A1/A2 advisory. The Governor gate re-validates each action
 * before any external API call is made.
 *
 * The engine derives its inputs from existing state (obligation-graph,
 * workflow/index, evidence-package, payment-engine) — it does NOT
 * re-implement their logic.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ Types ============

export interface RequiredAction {
  action: string;
  owner: string;
  deadline: Date;
  dependency?: string;
  blocker?: string;
  evidence?: string;
  source: string;
  legalBasis: string;
  nextSystem?: string;
  nextApi?: string;
  nextPortal?: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
}

export interface BlockerExplanation {
  ustn: string;
  blocker: string;
  dependency: string;
  requiredAction: string;
  owner: string;
  deadline: string;
  source: string;
  legalBasis: string;
  consequence: string;
  resolvedBy: string;
}

export interface NextStep {
  step: string;
  state: string;
  actor: string;
  system?: string;
  estimatedDurationHours: number;
  deterministic: boolean;
}

// ============ Loaders ============

async function loadTradeState(ustn: string): Promise<any | null> {
  try {
    return await db.trade.findUnique({
      where: { ustn },
      include: {
        shipments: true, invoices: true, contracts: true,
        customsOperations: true, transportDocuments: true, packingLists: true,
        certificatesOfOrigin: true, exportLicenses: true, governmentReferences: true,
        globalPayments: true, deliveryAcceptances: true, events: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    }).catch(() => null);
  } catch (err: any) {
    logger.warn("[next-actions] load failed", { ustn, error: err?.message });
    return null;
  }
}

// ============ §67 — Action derivation ============

function deriveActions(trade: any): RequiredAction[] {
  const actions: RequiredAction[] = [];
  if (!trade) return actions;
  try {
    const now = Date.now();
    const addDays = (d: number) => new Date(now + d * 86400_000);

    if (!trade.invoices?.length) {
      actions.push({
        action: "Issue commercial invoice", owner: "SELLER", deadline: addDays(1),
        dependency: "Contract execution", source: "Trade contract record",
        legalBasis: "UCP 600 Art 18", nextSystem: "INVOICE_GENERATOR",
        priority: "CRITICAL",
      });
    }
    if (!trade.packingLists?.length) {
      actions.push({
        action: "Prepare packing list", owner: "SELLER", deadline: addDays(1),
        dependency: "Invoice issuance", source: "Invoice record",
        legalBasis: "UCP 600 Art 18(g)", nextSystem: "PACKING_LIST_GENERATOR",
        priority: "HIGH",
      });
    }
    if (!trade.transportDocuments?.length) {
      actions.push({
        action: "Issue BL/AWB", owner: "CARRIER", deadline: addDays(2),
        dependency: "Cargo loaded", source: "Shipment record",
        legalBasis: "Hague-Visby / Montreal Convention", nextApi: "carrier-apis",
        priority: "CRITICAL",
      });
    }
    if (!trade.certificatesOfOrigin?.length) {
      actions.push({
        action: "Obtain Certificate of Origin", owner: "SELLER", deadline: addDays(5),
        dependency: "Invoice + packing list", source: "Chamber of Commerce",
        legalBasis: "WCO Kyoto Convention Annex C", nextPortal: "CHAMBER_OF_COMMERCE_PORTAL",
        priority: "HIGH",
      });
    }
    if (!trade.customsOperations?.length) {
      actions.push({
        action: "File customs declaration", owner: "BROKER", deadline: addDays(2),
        dependency: "BL + invoice + COO", source: "Customs regulation",
        legalBasis: "WCO Revised Kyoto Convention", nextApi: "government-connector",
        priority: "CRITICAL",
      });
    }
    const unpaidDuty = (trade.globalPayments || []).some((p: any) => /DUTY|CUSTOMS|VAT/i.test(p.paymentType || "") && p.status !== "PAID" && p.status !== "SETTLED");
    if (trade.customsOperations?.length && unpaidDuty) {
      actions.push({
        action: "Pay customs duty/VAT", owner: "BUYER (FINANCE)", deadline: addDays(1),
        dependency: "Customs assessment", blocker: "Duty unpaid — cargo will not release",
        source: "Customs assessment notice", legalBasis: "National customs code",
        nextApi: "payment-engine", priority: "CRITICAL",
      });
    }
    if (!trade.deliveryAcceptances?.length && trade.customsOperations?.length) {
      actions.push({
        action: "Arrange truck pickup + delivery acceptance", owner: "FORWARDER",
        deadline: addDays(2), dependency: "Customs release",
        source: "Terminal free time", legalBasis: "Incoterms 2020",
        nextApi: "carrier-apis", priority: "HIGH",
      });
    }
  } catch {}
  return actions;
}

// ============ Public API ============

export async function getNextRequiredActions(ustn: string): Promise<RequiredAction[]> {
  try {
    const trade = await loadTradeState(ustn);
    const actions = deriveActions(trade);
    return actions.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
  } catch (err: any) {
    logger.error("[next-actions] getNextRequiredActions failed", { ustn, error: err?.message });
    return [];
  }
}

export async function getTradeBlocker(ustn: string): Promise<BlockerExplanation | null> {
  try {
    const trade = await loadTradeState(ustn);
    const actions = deriveActions(trade);
    const blocker = actions.find((a) => a.priority === "CRITICAL");
    if (!blocker) return null;
    return {
      ustn,
      blocker: blocker.blocker || `${blocker.action} not yet performed`,
      dependency: blocker.dependency || "Prior workflow step",
      requiredAction: blocker.action,
      owner: blocker.owner,
      deadline: blocker.deadline.toISOString(),
      source: blocker.source,
      legalBasis: blocker.legalBasis,
      consequence: deriveConsequence(blocker),
      resolvedBy: `Perform "${blocker.action}" before ${blocker.deadline.toISOString()}`,
    };
  } catch (err: any) {
    logger.error("[next-actions] getTradeBlocker failed", { ustn, error: err?.message });
    return null;
  }
}

function deriveConsequence(a: RequiredAction): string {
  try {
    if (/customs/i.test(a.action)) return "Customs will hold cargo; demurrage accrues daily past free time.";
    if (/duty|VAT|payment/i.test(a.action)) return "Cargo will not be released by customs; demurrage accrues.";
    if (/BL|AWB/i.test(a.action)) return "Title cannot transfer; payment under LC cannot be triggered.";
    if (/COO|certificate/i.test(a.action)) return "Preferential duty rate forfeited; full MFN duty applies.";
    if (/invoice/i.test(a.action)) return "LC presentation fails; payment refused by issuing bank.";
    return "Trade cannot advance to the next workflow milestone.";
  } catch {
    return "Trade cannot advance.";
  }
}

export async function getWhatHappensNext(ustn: string): Promise<NextStep[]> {
  try {
    const trade = await loadTradeState(ustn);
    if (!trade) return [];
    const steps: NextStep[] = [];
    const has = (arr?: any[]) => (arr?.length || 0) > 0;

    if (!has(trade.contracts)) steps.push(step("Contract execution", "NEGOTIATION", "SELLER+BUYER", undefined, 24));
    if (!has(trade.invoices)) steps.push(step("Invoice issuance", "PRE_CARGO", "SELLER", "INVOICE_GENERATOR", 4));
    if (!has(trade.packingLists)) steps.push(step("Packing list", "PRE_CARGO", "SELLER", "PACKING_LIST_GENERATOR", 2));
    if (!has(trade.transportDocuments)) steps.push(step("BL/AWB issuance", "AT_LOAD", "CARRIER", "carrier-apis", 8));
    if (!has(trade.certificatesOfOrigin)) steps.push(step("COO issuance", "PRE_CUSTOMS", "CHAMBER", "CHAMBER_PORTAL", 120));
    if (!has(trade.customsOperations)) steps.push(step("Customs declaration", "CUSTOMS", "BROKER", "government-connector", 48));
    steps.push(step("Duty/VAT payment", "CUSTOMS", "BUYER", "payment-engine", 24));
    steps.push(step("Cargo release", "POST_CUSTOMS", "CUSTOMS", "government-connector", 12));
    if (!has(trade.deliveryAcceptances)) steps.push(step("Delivery acceptance", "DELIVERY", "FORWARDER", "carrier-apis", 24));
    steps.push(step("Evidence package sealing", "CLOSURE", "SGTX", "evidence-package", 1));
    steps.push(step("Trade closure", "CLOSED", "GOVERNOR", "trade-closure", 1));
    return steps;
  } catch (err: any) {
    logger.error("[next-actions] getWhatHappensNext failed", { ustn, error: err?.message });
    return [];
  }
}

function step(name: string, state: string, actor: string, system?: string, hours: number = 24): NextStep {
  return { step: name, state, actor, system, estimatedDurationHours: hours, deterministic: true };
}

function priorityRank(p: string): number {
  return { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }[p] ?? 4;
}
