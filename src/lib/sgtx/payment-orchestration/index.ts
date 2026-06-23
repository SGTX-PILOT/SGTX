// SGTX Part 6 — One-Click Payment Orchestration & Government Fee Collection
// Stage 1 (pre-shipment) + Stage 2 (post-departure) PSP split payments,
// FeeLock state machine, government API orchestration, deferred payment guarantee
// expiry handling, late fee calculation, PSP responsibility matrix.

import { db } from "@/lib/db";
import crypto from "crypto";

export const LATE_FEE_RATE_PER_DAY = 0.001; // 0.1%
export const LATE_FEE_CAP = 1.0; // 100% of original fee
export const SGTX_FEE_RATE = 0.015; // 1.5%
export const DEFERRED_GUARANTEE_DEFAULT_DAYS = 30;
export const DEFERRED_REMINDER_DAYS = 7;
export const DEFERRED_ALERT_DAYS = 1;

// ============ 6.1: Stage 1 Split Instruction Generator ============
export interface SplitPayee {
  payee_gtid: string;
  amount: number;
  description: string;
  terms?: string; // MANDATORY | CREDIT
  due_date?: string;
}

export async function generateStage1Split(input: {
  ustn: string;
  payerGtid: string;
  invoiceValueUsd: number;
}): Promise<{ totalAmount: number; splits: SplitPayee[]; payeeCount: number }> {
  const trade = await db.trade.findUnique({ where: { ustn: input.ustn }, include: { quotations: true } });
  if (!trade) throw new Error("Trade not found");

  const splits: SplitPayee[] = [];

  // 1. SGTX platform fee (1.5%)
  splits.push({ payee_gtid: "SGTX-PLATFORM", amount: +(input.invoiceValueUsd * SGTX_FEE_RATE).toFixed(2), description: "SGTX platform fee (1.5%)" });

  // 2. Customs inspection fee (per container)
  splits.push({ payee_gtid: "EG-CUSTOMS", amount: 200, description: "Customs inspection fee" });

  // 3. Phytosanitary certificate fee
  if (trade.commodityHs?.startsWith("08")) {
    splits.push({ payee_gtid: "EG-PLANT-QUARANTINE", amount: 50, description: "Phytosanitary certificate" });
    splits.push({ payee_gtid: "EG-NFSA", amount: 40, description: "Health certificate" });
  }

  // 4. Certificate of Origin
  splits.push({ payee_gtid: "EG-CHAMBER", amount: 25, description: "Certificate of Origin" });

  // 5. Service quotations (lab, broker, trucking, QC)
  for (const q of trade.quotations) {
    if (q.status === "ACCEPTED") {
      const payeeMap: Record<string, string> = { LAB: "lab", BROKER: "broker", QC: "qc", LOGISTICS: "lsp" };
      const payeeGtid = q.providerGtid;
      const descMap: Record<string, string> = { LAB: "Laboratory test", BROKER: "Broker certification", QC: "QC inspection", LOGISTICS: "Trucking" };
      splits.push({ payee_gtid: payeeGtid, amount: q.feeUsd, description: descMap[q.serviceType] || q.serviceType });
    }
  }

  // 6. Port charges (THC)
  splits.push({ payee_gtid: "EG-PORT", amount: 150, description: "Terminal Handling Charge" });

  // 7. CargoX ACI filing
  splits.push({ payee_gtid: "CARGOX", amount: 30, description: "ACI filing" });

  // 8. Insurance (if cold chain / high value)
  if (trade.coldChain || trade.tradeValueUsd > 50000) {
    splits.push({ payee_gtid: "INSURECO", amount: 200, description: "Cargo insurance" });
  }

  const totalAmount = +splits.reduce((s, p) => s + p.amount, 0).toFixed(2);
  return { totalAmount, splits, payeeCount: splits.length };
}

// ============ 6.2: Stage 2 Split (Post-Departure) ============
export async function generateStage2Split(input: {
  ustn: string;
  payerGtid: string;
  oceanFreightUsd: number;
  destinationChargesUsd?: number;
  creditTerms?: boolean;
  dueDate?: Date;
}): Promise<{ totalAmount: number; splits: SplitPayee[] }> {
  const trade = await db.trade.findUnique({ where: { ustn: input.ustn } });
  if (!trade) throw new Error("Trade not found");

  const splits: SplitPayee[] = [];

  // Ocean freight
  splits.push({
    payee_gtid: trade.shipments?.[0]?.carrierGtid || "SGTX-EG-SHP-000031-9E8F",
    amount: input.oceanFreightUsd,
    description: "Ocean freight",
    terms: input.creditTerms ? "CREDIT" : "MANDATORY",
    due_date: input.dueDate?.toISOString().slice(0, 10),
  });

  // Destination charges (for DAP/DDP)
  if (input.destinationChargesUsd && input.destinationChargesUsd > 0) {
    splits.push({ payee_gtid: "DESTINATION-PORT", amount: input.destinationChargesUsd, description: "Destination THC" });
  }

  const totalAmount = +splits.reduce((s, p) => s + p.amount, 0).toFixed(2);
  return { totalAmount, splits };
}

// ============ 6.1.2: Orchestrate Stage 1 Payment ============
export async function orchestrateStage1Payment(input: {
  ustn: string;
  payerGtid: string;
  invoiceValueUsd: number;
}): Promise<{ ok: true; requestId: string; totalAmount: number; splits: SplitPayee[]; governmentApiCalls: any } | { ok: false; reason: string; code?: string }> {
  // 1. Governor validates conditions
  const trade = await db.trade.findUnique({ where: { ustn: input.ustn }, include: { quotations: true } });
  if (!trade) return { ok: false, code: "NOT_FOUND", reason: "Trade not found." };
  if (!["LOCKED", "IN_EXECUTION", "CONTRACT_SIGNED"].includes(trade.status)) {
    return { ok: false, code: "NOT_LOCKED", reason: "Trade must be locked before Stage 1 payment." };
  }

  // 2. Generate split instruction
  const { totalAmount, splits } = await generateStage1Split({ ustn: input.ustn, payerGtid: input.payerGtid, invoiceValueUsd: input.invoiceValueUsd });

  // 3. Create FeePaymentRequest
  const requestId = `FPR-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 900 + 100)}`;
  const dueDate = new Date(Date.now() + 7 * 86400 * 1000); // 7 days from now

  // 4. PSP Router selects optimal PSP (simulated — uses existing PspHealthLog)
  const psp = await db.pspHealthLog.findFirst({ orderBy: { healthScore: "desc" } });
  const pspSelected = psp?.pspName || "SWIFT_BANK";

  // 5. Simulate PSP processing + split
  const pspReference = `PSP-S1-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;

  // 6. Government API calls (simulated)
  const governmentApiCalls = {
    cargox: { acid: `ACI${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 9000 + 1000)}`, status: "ACCEPTED" },
    nafeza: { declarationId: `NAFEZA-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`, status: "ACCEPTED" },
    eta: { uuid: crypto.randomUUID(), status: "VALID" },
  };

  const fpr = await db.feePaymentRequest.create({
    data: {
      requestId, ustn: input.ustn, tradeId: trade.id,
      stage: "STAGE1", payerGtid: input.payerGtid,
      totalAmountUsd: totalAmount, currency: "USD",
      splits: JSON.stringify(splits),
      pspSelected, pspReference,
      feeLockStatus: "ACTIVE", status: "PAID",
      dueDate, paidAt: new Date(),
      governmentApiCalls: JSON.stringify(governmentApiCalls),
    },
  });

  // 7. Smart Inbox notification
  await db.inboxItem.create({
    data: {
      tenantGtid: input.payerGtid, tradeId: trade.id,
      category: "NEW_OFFER", priority: 95,
      title: `Stage 1 payment successful — ${requestId}`,
      description: `Total: $${totalAmount.toFixed(2)} split across ${splits.length} payees via ${pspSelected}. FeeLock ACTIVE. ACID: ${governmentApiCalls.cargox.acid}. Nafeza: ${governmentApiCalls.nafeza.declarationId}. Container release authorised.`,
      ctaLabel: "View Details",
    },
  });

  return { ok: true, requestId, totalAmount, splits, governmentApiCalls };
}

// ============ 6.8: Deferred Payment Guarantee Expiry Handling ============
export async function checkDeferredGuaranteeExpiry(): Promise<{ checked: number; reminded: number; alerted: number; expired: number }> {
  const deferredFees = await db.feePaymentRequest.findMany({
    where: { deferred: true, deferredStatus: "GUARANTEE_HELD", status: "PAID" },
  });

  let reminded = 0, alerted = 0, expired = 0;
  for (const fee of deferredFees) {
    if (!fee.guaranteeExpiry) continue;
    const daysToExpiry = Math.ceil((fee.guaranteeExpiry.getTime() - Date.now()) / 86400000);

    if (daysToExpiry <= 0 && fee.expiryActionTaken !== "expired_charged" && fee.expiryActionTaken !== "expired_blocked") {
      // Step 3: Expiry
      if (fee.autoChargeAuthorised) {
        // Auto-charge
        await db.feePaymentRequest.update({ where: { id: fee.id }, data: { deferredStatus: "PAID", expiryActionTaken: "expired_charged" } });
      } else {
        // Block
        await db.feePaymentRequest.update({ where: { id: fee.id }, data: { deferredStatus: "EXPIRED", expiryActionTaken: "expired_blocked" } });
        await db.inboxItem.create({
          data: { tenantGtid: fee.payerGtid, tradeId: fee.tradeId, category: "SHIPMENT_ALERT", priority: 100,
            title: `CRITICAL: Deferred payment guarantee expired — ${fee.requestId}`,
            description: "Guarantee expired. Container release permanently blocked until fee is paid. A dispute (non-payment) has been automatically created.",
            ctaLabel: "Pay Now" },
        });
      }
      expired++;
    } else if (daysToExpiry <= DEFERRED_ALERT_DAYS && fee.expiryActionTaken !== "alerted" && fee.expiryActionTaken !== "expired_charged") {
      // Step 2: Alert (1 day before)
      await db.feePaymentRequest.update({ where: { id: fee.id }, data: { expiryActionTaken: "alerted" } });
      await db.inboxItem.create({
        data: { tenantGtid: fee.payerGtid, tradeId: fee.tradeId, category: "SHIPMENT_ALERT", priority: 90,
          title: `Deferred payment guarantee expires in 24h — ${fee.requestId}`,
          description: "Click here to pay now and avoid release block.",
          ctaLabel: "Convert to Immediate Payment" },
      });
      alerted++;
    } else if (daysToExpiry <= DEFERRED_REMINDER_DAYS && !fee.expiryActionTaken) {
      // Step 1: Reminder (7 days before)
      await db.feePaymentRequest.update({ where: { id: fee.id }, data: { expiryActionTaken: "reminded" } });
      await db.inboxItem.create({
        data: { tenantGtid: fee.payerGtid, tradeId: fee.tradeId, category: "NEEDS_APPROVAL", priority: 70,
          title: `Deferred payment guarantee expires in ${daysToExpiry} days — ${fee.requestId}`,
          description: "Please ensure customs clearance is completed before expiry.",
          ctaLabel: "View Details" },
      });
      reminded++;
    }
  }

  return { checked: deferredFees.length, reminded, alerted, expired };
}

export async function convertDeferredToImmediate(input: {
  feePaymentRequestId: string;
}): Promise<{ ok: true; pspReference: string } | { ok: false; reason: string }> {
  const fee = await db.feePaymentRequest.findUnique({ where: { id: input.feePaymentRequestId } });
  if (!fee) return { ok: false, reason: "Fee payment request not found." };
  if (!fee.deferred) return { ok: false, reason: "This fee is not deferred." };

  // Charge PSP immediately
  const pspReference = `PSP-CONV-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
  await db.feePaymentRequest.update({
    where: { id: input.feePaymentRequestId },
    data: { deferredStatus: "CONVERTED", expiryActionTaken: "expired_charged", pspReference },
  });

  return { ok: true, pspReference };
}

// ============ 6.9: Late Fee Calculation ============
export async function calculateLateFees(): Promise<{ checked: number; penalized: number }> {
  const overdue = await db.feePaymentRequest.findMany({
    where: { status: "PENDING", dueDate: { not: null, lt: new Date() } },
  });

  let penalized = 0;
  for (const fee of overdue) {
    if (!fee.dueDate) continue;
    const daysLate = Math.floor((Date.now() - fee.dueDate.getTime()) / 86400000);
    if (daysLate <= 0) continue;

    const cappedDays = Math.min(daysLate, Math.floor(LATE_FEE_CAP / LATE_FEE_RATE_PER_DAY));
    const lateFee = +(fee.totalAmountUsd * LATE_FEE_RATE_PER_DAY * cappedDays).toFixed(2);
    const totalDue = +(fee.totalAmountUsd + lateFee).toFixed(2);

    await db.feePaymentRequest.update({
      where: { id: fee.id },
      data: { lateFeeAccrued: lateFee },
    });

    await db.lateFeeEvent.create({
      data: { feePaymentRequestId: fee.id, ustn: fee.ustn, daysLate, lateFeeAmount: lateFee, totalDue },
    });

    // Smart Inbox reminder (priority 90)
    await db.inboxItem.create({
      data: { tenantGtid: fee.payerGtid, tradeId: fee.tradeId, category: "NEEDS_PAYMENT", priority: 90,
        title: `Late fee reminder — ${fee.requestId} (${daysLate}d overdue)`,
        description: `Late fee: $${lateFee.toFixed(2)}. Total due: $${totalDue.toFixed(2)}.`,
        ctaLabel: "Pay Now" },
    });
    penalized++;
  }

  return { checked: overdue.length, penalized };
}

// ============ 6.6.1: FeeLock State Machine ============
export const FEELOCK_STATES = ["PENDING", "ACTIVE", "PARTIALLY_RELEASED", "DISPUTED", "CANCELLED"] as const;

export function transitionFeeLock(currentStatus: string, event: string): { newStatus: string; valid: boolean } {
  const transitions: Record<string, Record<string, string>> = {
    PENDING: { PAYMENT_CONFIRMED: "ACTIVE", CANCEL: "CANCELLED", DISPUTE_FILED: "DISPUTED" },
    ACTIVE: { DISPUTE_FILED: "DISPUTED", RELEASE: "PARTIALLY_RELEASED" },
    PARTIALLY_RELEASED: { DISPUTE_FILED: "DISPUTED", FULL_RELEASE: "ACTIVE" },
    DISPUTED: { RESOLVED: "ACTIVE", CANCEL: "CANCELLED" },
    CANCELLED: {},
  };
  const newStatus = transitions[currentStatus]?.[event];
  return { newStatus: newStatus || currentStatus, valid: !!newStatus };
}

// ============ 6.11: PSP Responsibility Matrix ============
export const PSP_RESPONSIBILITY_MATRIX = {
  sgtx_shall_not: [
    "Hold customer funds",
    "Issue e-money",
    "Accept deposits",
    "Perform banking activities",
    "Operate an escrow account",
    "Provide payment initiation services",
    "Execute settlement without PSP/bank",
  ],
  psp_shall: [
    "Hold funds (customer and merchant)",
    "Transfer funds between accounts",
    "Issue receipts and confirmations",
    "Conduct AML/KYC on payers",
    "Report suspicious transactions to CBE",
    "Execute payment instructions from SGTX",
  ],
  legal_disclaimer: "SGTX is not a bank or payment service provider. All funds are held and transferred by licensed PSPs (e.g., Fawry, PayMob, CBE IPN). SGTX only provides instructions and reconciliation data. Your relationship with the PSP is separate and governed by their terms.",
  responsibility_matrix: [
    { operation: "Fee calculation", sgtx: true, psp: false, cbe: false },
    { operation: "Split instruction generation", sgtx: true, psp: false, cbe: false },
    { operation: "Authentication of payer", sgtx: false, psp: true, cbe: false },
    { operation: "Fund holding", sgtx: false, psp: true, cbe: false },
    { operation: "Fund transfer execution", sgtx: false, psp: true, cbe: false },
    { operation: "AML screening", sgtx: false, psp: true, cbe: true },
    { operation: "Reporting to CBE", sgtx: false, psp: true, cbe: true },
    { operation: "Dispute resolution (payment)", sgtx: false, psp: true, cbe: false },
  ],
};
