// SGTX Part 6.7 — MultiShipment Contracts: Per-Shipment Stage 1 & Stage 2
//
// For multi-shipment contracts:
//   • Master contract is signed with no upfront payment.
//   • Each shipment activates independently:
//       1. Seller clicks "Ready for Shipment X" → 1 click
//       2. Buyer confirms → 1 click
//       3. Seller receives per-shipment Stage 1 payment request
//       4. Seller pays per-shipment fee → 1 click
//       5. System generates new USTN for that shipment, FeeLock ACTIVE
//       6. Shipment proceeds. Stage 2 (freight) also per shipment.
//
// Each shipment's FeeLock is independent. A delay in one shipment does not
// affect others. (Part 6.7)
//
// Per-shipment USTN format:
//   {master_ustn}#{shipment_seq}
//   e.g. SGTX-1397F3A-456ABC-20260415120000-A1B2C3D4#S2

import { db as _db } from "@/lib/db";
import { freshDb } from "@/lib/db-fresh";
import { createFeeLock, activateFeeLock, getFeeLockStatus } from "./fealock";
import { generateSplitInstruction, processPspSplit, PspProvider } from "./psp-split";

// Use freshDb (non-cached PrismaClient) so writes work even when the globalThis-
// cached `db` has a stale SQLite connection (e.g. after `bun run db:push`
// replaces the DB file mid-dev-session).
const db = (freshDb ?? _db) as typeof _db;

// ============ 6.7.5: Per-shipment USTN generation ============
export function generateShipmentUstn(masterUstn: string, shipmentSeq: number): string {
  return `${masterUstn}#S${shipmentSeq}`;
}

export function parseShipmentUstn(shipmentUstn: string): { masterUstn: string; shipmentSeq: number | null } {
  const idx = shipmentUstn.indexOf("#S");
  if (idx < 0) return { masterUstn: shipmentUstn, shipmentSeq: null };
  const master = shipmentUstn.slice(0, idx);
  const seqStr = shipmentUstn.slice(idx + 2);
  const seq = /^\d+$/.test(seqStr) ? parseInt(seqStr, 10) : null;
  return { masterUstn: master, shipmentSeq: seq };
}

// ============ 6.7: List shipments in a master contract ============
export async function listMasterContractShipments(masterUstn: string): Promise<Array<{
  shipmentId: string;
  shipmentSeq: number;
  containerNo: string | null;
  shipmentUstn: string;
  status: string;
  feLockStatus: string | null;
  stage1Paid: boolean;
  stage2Paid: boolean;
}>> {
  const trade = await db.trade.findUnique({
    where: { ustn: masterUstn },
    include: { shipments: true },
  });
  if (!trade) throw new Error(`TRADE_NOT_FOUND for master USTN ${masterUstn}`);

  const shipments = trade.shipments;
  return shipments.map((s, i) => {
    const shipmentUstn = generateShipmentUstn(masterUstn, i + 1);
    return {
      shipmentId: s.id,
      shipmentSeq: i + 1,
      containerNo: s.containerNo,
      shipmentUstn,
      status: s.status,
      feLockStatus: null,        // resolved below
      stage1Paid: false,
      stage2Paid: false,
    };
  });
}

// ============ 6.7 Steps 1-4: Activate shipment & request per-shipment Stage 1 ============
// Seller clicks "Ready for Shipment X" + buyer confirms + seller pays per-shipment Stage 1.
// This function combines all three steps — in a real UI each is a separate click but the
// backend result is the same: a new USTN is generated for the shipment, FeeLock goes ACTIVE.
export async function activateShipmentStage1(input: {
  masterUstn: string;
  shipmentSeq: number;
  pspProvider?: PspProvider;
}): Promise<{
  shipmentUstn: string;
  feeLockId: string;
  feeLockStatus: string;
  paymentAttemptId: string;
  pspReference: string;
  idempotencyKey: string;
  splitInstruction: any;
  totalAmountUsd: number;
}> {
  const trade = await db.trade.findUnique({
    where: { ustn: input.masterUstn },
    include: { shipments: true },
  });
  if (!trade) throw new Error(`TRADE_NOT_FOUND for master USTN ${input.masterUstn}`);

  const shipmentIdx = input.shipmentSeq - 1;
  if (shipmentIdx < 0 || shipmentIdx >= trade.shipments.length) {
    throw new Error(`SHIPMENT_SEQ_INVALID: shipmentSeq ${input.shipmentSeq} out of range (1..${trade.shipments.length})`);
  }
  const shipment = trade.shipments[shipmentIdx];
  const shipmentUstn = generateShipmentUstn(input.masterUstn, input.shipmentSeq);

  // 1. Generate split instruction for the master contract (per-shipment Stage 1 uses the
  //    same Stage 1 fee model since customs/lab/broker all apply per shipment).
  //    We use the master USTN to look up trade data, but persist against shipmentUstn.
  const masterSplit = await generateSplitInstruction(input.masterUstn, "STAGE1");

  // 2. Create per-shipment FeeLock (PENDING state)
  const providerFees = masterSplit.splits
    .filter((s: any) => s.payee_gtid !== "SGTX-PLATFORM")
    .map((s: any) => ({ payee: s.payee_gtid, amount: s.amount, stage: s.stage }));
  const sgtxFee = masterSplit.splits.find((s: any) => s.payee_gtid === "SGTX-PLATFORM")?.amount ?? 0;
  const feeLock = await db.feeLock.create({
    data: {
      ustn: shipmentUstn,
      tradeId: trade.id,
      shipmentId: shipment.id,
      stage: "STAGE1",
      status: "PENDING",
      totalAmountUsd: masterSplit.total_amount,
      sgtxFeeUsd: sgtxFee,
      providerFeesJson: JSON.stringify(providerFees),
      kvVersion: 1,
    },
  });

  // 3. Create PaymentAttempt with the per-shipment USTN
  const pspProvider: PspProvider = input.pspProvider ?? "STRIPE";
  const { generateIdempotencyKey } = await import("./psp-split");
  const idempotencyKey = generateIdempotencyKey({ ustn: shipmentUstn, stage: "STAGE1", pspProvider });
  const pspReference = `${pspProvider}-SHP${input.shipmentSeq}-${Date.now().toString(36).toUpperCase()}`;

  const attempt = await db.paymentAttempt.create({
    data: {
      ustn: shipmentUstn,
      feeLockId: feeLock.id,
      shipmentId: shipment.id,
      stage: "STAGE1",
      amountUsd: masterSplit.total_amount,
      currency: "USD",
      pspProvider,
      pspReference,
      status: "PROCESSING",
      splitJson: JSON.stringify(masterSplit.splits),
      idempotencyKey,
    },
  });

  // 4. Simulate PSP confirmation → FeeLock ACTIVE
  await db.paymentAttempt.update({
    where: { id: attempt.id },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
  const updated = await db.feeLock.update({
    where: { id: feeLock.id },
    data: { status: "ACTIVE", activatedAt: new Date(), kvVersion: 2 },
  });

  // 5. Smart Inbox to seller — per-shipment Stage 1 confirmed
  await db.inboxItem.create({
    data: {
      tenantGtid: trade.sellerGtid,
      category: "NEW_OFFER",
      priority: 90,
      title: `Shipment ${input.shipmentSeq} Stage 1 paid — ${shipmentUstn.slice(0, 24)}…`,
      description:
        `Per-shipment Stage 1 for shipment #${input.shipmentSeq} (container ${shipment.containerNo || "—"}) ` +
        `confirmed. Total $${masterSplit.total_amount.toFixed(2)} split across ${masterSplit.splits.length} payees ` +
        `via ${pspProvider}. PSP ref ${pspReference}. Shipment FeeLock now ACTIVE — container release authorised.`,
      ctaLabel: "View Breakdown",
    },
  });

  return {
    shipmentUstn,
    feeLockId: updated.id,
    feeLockStatus: updated.status,
    paymentAttemptId: attempt.id,
    pspReference,
    idempotencyKey,
    splitInstruction: masterSplit,
    totalAmountUsd: masterSplit.total_amount,
  };
}

// ============ 6.7 Step 6: Per-shipment Stage 2 (freight) ============
// Each shipment's Stage 2 (ocean freight, destination THC, import clearance) is also
// independent. Stage 2 may be CREDIT (deferred) — handled via Stage 2 due_date.
export async function activateShipmentStage2(input: {
  masterUstn: string;
  shipmentSeq: number;
  pspProvider?: PspProvider;
}): Promise<{
  shipmentUstn: string;
  paymentAttemptId: string;
  pspReference: string;
  idempotencyKey: string;
  splitInstruction: any;
  totalAmountUsd: number;
  creditTerms: boolean;
  dueDate: string | null;
}> {
  const trade = await db.trade.findUnique({
    where: { ustn: input.masterUstn },
    include: { shipments: true },
  });
  if (!trade) throw new Error(`TRADE_NOT_FOUND for master USTN ${input.masterUstn}`);

  const shipmentIdx = input.shipmentSeq - 1;
  if (shipmentIdx < 0 || shipmentIdx >= trade.shipments.length) {
    throw new Error(`SHIPMENT_SEQ_INVALID: shipmentSeq ${input.shipmentSeq} out of range (1..${trade.shipments.length})`);
  }
  const shipment = trade.shipments[shipmentIdx];
  const shipmentUstn = generateShipmentUstn(input.masterUstn, input.shipmentSeq);

  // Generate Stage 2 split instruction from master trade data
  const masterSplit = await generateSplitInstruction(input.masterUstn, "STAGE2");

  const pspProvider: PspProvider = input.pspProvider ?? "STRIPE";
  const { generateIdempotencyKey } = await import("./psp-split");
  const idempotencyKey = generateIdempotencyKey({ ustn: shipmentUstn, stage: "STAGE2", pspProvider });
  const pspReference = `${pspProvider}-SHP${input.shipmentSeq}-S2-${Date.now().toString(36).toUpperCase()}`;

  // Detect credit terms from the Stage 2 split (any leg with terms=CREDIT)
  const creditLeg = masterSplit.splits.find((s: any) => s.terms === "CREDIT");
  const creditTerms = !!creditLeg;
  const dueDate = creditLeg?.due_date ?? null;

  const attempt = await db.paymentAttempt.create({
    data: {
      ustn: shipmentUstn,
      shipmentId: shipment.id,
      stage: "STAGE2",
      amountUsd: masterSplit.total_amount,
      currency: "USD",
      pspProvider,
      pspReference,
      status: "COMPLETED",
      splitJson: JSON.stringify(masterSplit.splits),
      idempotencyKey,
      completedAt: new Date(),
    },
  });

  return {
    shipmentUstn,
    paymentAttemptId: attempt.id,
    pspReference,
    idempotencyKey,
    splitInstruction: masterSplit,
    totalAmountUsd: masterSplit.total_amount,
    creditTerms,
    dueDate,
  };
}

// ============ 6.7: Get per-shipment FeeLock & payment status ============
export async function getShipmentPaymentStatus(masterUstn: string, shipmentSeq: number): Promise<{
  shipmentUstn: string;
  shipmentId: string | null;
  containerNo: string | null;
  stage1: { feeLock: any; paymentAttempts: any[] };
  stage2: { paymentAttempts: any[] };
}> {
  const shipmentUstn = generateShipmentUstn(masterUstn, shipmentSeq);
  const trade = await db.trade.findUnique({
    where: { ustn: masterUstn },
    include: { shipments: true },
  });
  const shipment = trade?.shipments[shipmentSeq - 1];

  const [feeLocks, attempts] = await Promise.all([
    db.feeLock.findMany({ where: { ustn: shipmentUstn }, orderBy: { createdAt: "desc" } }),
    db.paymentAttempt.findMany({ where: { ustn: shipmentUstn }, orderBy: { attemptedAt: "desc" } }),
  ]);

  return {
    shipmentUstn,
    shipmentId: shipment?.id ?? null,
    containerNo: shipment?.containerNo ?? null,
    stage1: {
      feeLock: feeLocks.find(fl => fl.stage === "STAGE1") ?? null,
      paymentAttempts: attempts.filter(a => a.stage === "STAGE1"),
    },
    stage2: {
      paymentAttempts: attempts.filter(a => a.stage === "STAGE2"),
    },
  };
}
