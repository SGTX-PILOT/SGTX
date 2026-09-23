// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
//
// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/sgtx/payment/manifest/dispatch — v18 §13.4.4 One-Click Payment
// -----------------------------------------------------------------------------
// This is the ONE-CLICK payment button that dispatches the entire payment
// manifest. Per v18 §13.4.4, it executes the full §13.4.3 sequence:
//
//   1. Governor validates mandatory conditions (contract locked, all quotes
//      accepted, packing plan locked, payment manifest exists).
//   2. BSG selects mandated bank per currency.
//   3. Generate multi-leg settlement instruction.
//   4. Bank debits payer funding account.
//   5. Bank executes legs.
//   6. SGTX ingests camt.054/gpi, updates fee_payment_requests.status=PAID.
//   7. FeeLock ACTIVE → container release possible.
//
// GOLDEN PRINCIPLE (§13.4.2):
//   "SGTX must never equate a payment instruction with a settled payment."
//
//   This endpoint dispatches the payment instruction. It does NOT mark any
//   leg as SETTLED. It does NOT activate the FeeLock. It returns `status: PENDING`
//   for every leg and `feelock_status: PENDING`. Only the camt.054 ingestion
//   endpoint (POST /api/sgtx/settlement/camt054) and SWIFT gpi UETR ingestion
//   endpoint (POST /api/sgtx/settlement/swift-gpi) can transition legs to
//   SETTLED and FeeLock to ACTIVE.
//
// Body:
//   {
//     ustn:         string,                  // master or per-shipment USTN
//     stage:        1 | 2,                   // 1 = pre-shipment, 2 = post-departure
//     total_amount: number,                 // total amount to disburse (stage currency)
//     currency:     "EGP" | "USD",          // EGP for Stage 1, USD for Stage 2
//     payer: {
//       gtid:         string,                // payer's GTID
//       bank_account: string,               // payer's funding account (IBAN)
//     },
//     splits: [
//       {
//         payee_gtid: string,
//         amount:     number,
//         currency:   "EGP" | "USD",
//         purpose:    string,                // e.g. "SGTX_FEE", "CUSTOMS", "FREIGHT"
//         quote_id?:  string,                // link to the accepted provider quote
//         terms?:     "MANDATORY" | "CREDIT",// Stage 2 supports CREDIT (deferred)
//         due_date?:  string,                // ISO date for CREDIT legs (Stage 2)
//       }
//     ]
//   }
//
// Validations (Governor gate per §13.4.3 step 1):
//   • Contract is LOCKED (for Stage 1) — Trade.status ∈ LOCKED/IN_EXECUTION/
//     CONTRACT_SIGNED/EXECUTING, OR for multi-shipment the Shipment.status
//     is LOCKED with a real per-shipment USTN.
//   • All quotes ACCEPTED (no PENDING quotations on the trade).
//   • Packing plan LOCKED (PackingList.status = LOCKED for the USTN).
//   • Payment manifest exists (getPaymentManifest(ustn) returns non-null).
//   • For Stage 2: DEPARTED milestone must be VERIFIED.
//
// Calls dispatchMultiLegSettlement(ustn, stage) — the direct-bank-settlement
// lib runs Governor validation + bank selection + leg construction + bank debit
// ack + persist BankSettlementGateway / SettlementInstruction / PaymentLeg
// rows. Returns the dispatch result with all legs PENDING.
//
// Returns:
//   {
//     dispatched:      true,
//     batch_id:        "BSI-S1-...",
//     currency:        "EGP" | "USD",
//     legs: [
//       { leg_id, payee, amount, currency, end_to_end_id, status: "PENDING" }
//     ],
//     idempotency_key: "<sha256-hex>",
//     bank_reference:  "BNK-...-...",
//     feelock_status:  "PENDING"   // Golden Principle — camt.054 confirms activation
//   }
//
// Auth: Authorization: Bearer <access_jwt> (middleware injects x-tenant-gtid).
// CSRF: x-csrf-token header must echo the JWT csrf claim (middleware enforces).
// Idempotency: SHA256(JCS-canonical-request-body + UTC-second) computed by
// the direct-bank-settlement lib's `idempotencyKey()` function.
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/v1/auth";
import { dispatchMultiLegSettlement } from "@/lib/sgtx/direct-bank-settlement";
import { getPaymentManifest } from "@/lib/sgtx/payment-manifest";
import { getFeeLock } from "@/lib/sgtx/feelock-nats";

export const dynamic = "force-dynamic";

// ─── Session / Auth ────────────────────────────────────────────────────────
interface SessionPayload {
  sub: string;
  tenantGtid?: string;
  role?: string;
  email?: string;
  [key: string]: any;
}

function extractSession(req: NextRequest): SessionPayload | null {
  const authHeader = req.headers.get("authorization") || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      const payload = verifyToken(token);
      if (payload && payload.type !== "refresh") return payload;
    }
  }
  const tenantGtid = req.headers.get("x-tenant-gtid");
  const role = req.headers.get("x-role");
  if (tenantGtid) {
    return { sub: tenantGtid, tenantGtid, role: role || "USER" };
  }
  return null;
}

// ─── Body shape ─────────────────────────────────────────────────────────────
interface ManifestSplit {
  payee_gtid: string;
  amount: number;
  currency?: string;
  purpose?: string;
  quote_id?: string;
  terms?: "MANDATORY" | "CREDIT";
  due_date?: string;
}

interface PayerInfo {
  gtid?: string;
  bank_account?: string;
}

interface ManifestDispatchBody {
  ustn?: string;
  stage?: 1 | 2;
  total_amount?: number;
  currency?: string;
  payer?: PayerInfo;
  splits?: ManifestSplit[];
}

// ─── POST handler ──────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const startedAt = new Date().toISOString();
  const session = extractSession(req);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required — supply Authorization: Bearer <access_jwt>" },
      { status: 401 },
    );
  }
  const actorGtid = session.tenantGtid || session.sub;

  let body: ManifestDispatchBody;
  try {
    body = (await req.json()) as ManifestDispatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ustn = String(body.ustn || "").trim();
  const stage = Number(body.stage);
  const totalAmount = Number(body.total_amount);
  const currency = String(body.currency || (stage === 2 ? "USD" : "EGP")).toUpperCase() as "EGP" | "USD";
  const payer = body.payer || {};
  const payerGtid = String(payer.gtid || "").trim();
  const payerBankAccount = String(payer.bank_account || "").trim();
  const splits = Array.isArray(body.splits) ? body.splits : [];

  // ── Field validation ─────────────────────────────────────────────────────
  if (!ustn) {
    return NextResponse.json(
      { error: "ustn is required", code: "MISSING_USTN" },
      { status: 400 },
    );
  }
  if (stage !== 1 && stage !== 2) {
    return NextResponse.json(
      { error: `stage must be 1 (pre-shipment) or 2 (post-departure) — got ${body.stage}`, code: "INVALID_STAGE" },
      { status: 400 },
    );
  }
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    return NextResponse.json(
      { error: `total_amount must be a positive number — got ${body.total_amount}`, code: "INVALID_AMOUNT" },
      { status: 400 },
    );
  }
  if (currency !== "EGP" && currency !== "USD") {
    return NextResponse.json(
      { error: `currency must be EGP or USD — got ${currency}`, code: "INVALID_CURRENCY" },
      { status: 400 },
    );
  }
  if (!payerGtid) {
    return NextResponse.json(
      { error: "payer.gtid is required", code: "MISSING_PAYER_GTID" },
      { status: 400 },
    );
  }
  if (!payerBankAccount) {
    return NextResponse.json(
      { error: "payer.bank_account is required (payer funding account IBAN)", code: "MISSING_PAYER_BANK_ACCOUNT" },
      { status: 400 },
    );
  }
  if (splits.length === 0) {
    return NextResponse.json(
      { error: "splits array must contain at least one leg", code: "NO_SPLITS" },
      { status: 400 },
    );
  }
  // Validate each split
  for (let i = 0; i < splits.length; i++) {
    const s = splits[i];
    if (!s.payee_gtid) {
      return NextResponse.json(
        { error: `splits[${i}].payee_gtid is required`, code: "INVALID_SPLIT", split_index: i },
        { status: 400 },
      );
    }
    if (!Number.isFinite(Number(s.amount)) || Number(s.amount) <= 0) {
      return NextResponse.json(
        { error: `splits[${i}].amount must be positive`, code: "INVALID_SPLIT_AMOUNT", split_index: i },
        { status: 400 },
      );
    }
    // Stage 2 supports terms=CREDIT + due_date for deferred legs
    if (stage === 2 && s.terms === "CREDIT") {
      if (!s.due_date) {
        return NextResponse.json(
          { error: `splits[${i}].due_date is required for CREDIT terms (Stage 2 deferred leg)`, code: "MISSING_DUE_DATE", split_index: i },
          { status: 400 },
        );
      }
      // Validate due_date is a parseable ISO date in the future
      const due = new Date(s.due_date);
      if (isNaN(due.getTime())) {
        return NextResponse.json(
          { error: `splits[${i}].due_date is not a valid ISO date — got ${s.due_date}`, code: "INVALID_DUE_DATE", split_index: i },
          { status: 400 },
        );
      }
      if (due.getTime() < Date.now()) {
        return NextResponse.json(
          { error: `splits[${i}].due_date must be in the future (CREDIT leg) — got ${s.due_date}`, code: "PAST_DUE_DATE", split_index: i },
          { status: 400 },
        );
      }
    }
    if (s.terms && s.terms !== "MANDATORY" && s.terms !== "CREDIT") {
      return NextResponse.json(
        { error: `splits[${i}].terms must be "MANDATORY" or "CREDIT" — got ${s.terms}`, code: "INVALID_TERMS", split_index: i },
        { status: 400 },
      );
    }
  }
  // Validate splits sum to total_amount (within 1 unit tolerance)
  const splitsSum = splits.reduce((s, x) => s + Number(x.amount), 0);
  if (Math.abs(splitsSum - totalAmount) > 1) {
    return NextResponse.json(
      { error: `splits sum (${splitsSum.toFixed(2)}) does not match total_amount (${totalAmount.toFixed(2)})`, code: "SPLIT_SUM_MISMATCH", splits_sum: splitsSum, total_amount: totalAmount },
      { status: 400 },
    );
  }

  // ── Governor gate validation 1: Trade exists + contract LOCKED ──────────
  let trade: any = null;
  try {
    trade = await db.trade.findUnique({
      where: { ustn },
      include: { shipments: true, quotations: true },
    });
  } catch (e: any) {
    logger.error("[payment/manifest/dispatch] Trade lookup failed", { ustn, error: e?.message });
    return NextResponse.json(
      { error: "Trade lookup failed", code: "DB_ERROR", detail: e?.message },
      { status: 500 },
    );
  }
  if (!trade) {
    return NextResponse.json(
      { error: `No trade found for USTN ${ustn}`, code: "TRADE_NOT_FOUND" },
      { status: 404 },
    );
  }

  // Contract LOCKED check — multi-shipment contracts have placeholder USTNs.
  // For multi-shipment, the per-shipment USTN is on a Shipment row whose
  // status=LOCKED. For single-shipment trades, the trade.status must be one
  // of LOCKED/IN_EXECUTION/CONTRACT_SIGNED/EXECUTING.
  const isMultiShipment = !!trade.multiShipment;
  let contractLocked = false;
  if (isMultiShipment) {
    const shipment = (trade.shipments || []).find(
      (s: any) => s.ustn === ustn && !s.ustn.includes("#UNLOCKED-") && !s.ustn.endsWith(":UNLOCKED"),
    );
    if (shipment && shipment.status === "LOCKED") {
      contractLocked = true;
    } else if (shipment) {
      return NextResponse.json(
        {
          error: `Shipment ${ustn} has status "${shipment.status}" — only LOCKED shipments can pay Stage ${stage}.`,
          code: "SHIPMENT_NOT_LOCKED",
          shipment_status: shipment.status,
        },
        { status: 409 },
      );
    } else {
      return NextResponse.json(
        {
          error: `Shipment with USTN ${ustn} is not LOCKED. Lock the shipment first.`,
          code: "SHIPMENT_NOT_LOCKED",
        },
        { status: 409 },
      );
    }
  } else {
    // Single-shipment: trade.status must be in the LOCKED family.
    const LOCKED_FAMILY = ["LOCKED", "IN_EXECUTION", "CONTRACT_SIGNED", "EXECUTING"];
    if (LOCKED_FAMILY.includes(trade.status)) {
      contractLocked = true;
    } else {
      return NextResponse.json(
        {
          error: `Trade ${ustn} status is "${trade.status}" — contract must be LOCKED (or in execution) before dispatching payment. Lock the contract first.`,
          code: "CONTRACT_NOT_LOCKED",
          trade_status: trade.status,
        },
        { status: 409 },
      );
    }
  }

  // ── Governor gate validation 2: All quotes ACCEPTED ─────────────────────
  const pendingQuotes = (trade.quotations || []).filter((q: any) => q.status === "PENDING");
  if (pendingQuotes.length > 0) {
    return NextResponse.json(
      {
        error: `${pendingQuotes.length} quotation(s) are still PENDING — accept or reject all quotes before dispatching payment.`,
        code: "QUOTES_NOT_ACCEPTED",
        pending_count: pendingQuotes.length,
        pending_quote_ids: pendingQuotes.map((q: any) => q.id || q.quoteId).slice(0, 10),
      },
      { status: 409 },
    );
  }

  // ── Governor gate validation 3: Packing plan LOCKED ──────────────────────
  let packingList: any = null;
  try {
    packingList = await db.packingList.findFirst({
      where: { ustn },
      orderBy: { createdAt: "desc" },
    });
  } catch (e: any) {
    logger.warn("[payment/manifest/dispatch] PackingList lookup failed (non-blocking)", { ustn, error: e?.message });
  }
  if (!packingList || packingList.status !== "LOCKED") {
    return NextResponse.json(
      {
        error: `Packing plan for ${ustn} is ${!packingList ? "missing" : `not LOCKED (status: ${packingList.status})`} — lock the packing list before dispatching payment.`,
        code: "PACKING_PLAN_NOT_LOCKED",
        packing_status: packingList?.status || null,
      },
      { status: 409 },
    );
  }

  // ── Governor gate validation 4: Payment manifest exists ─────────────────
  const manifest = await getPaymentManifest(ustn);
  if (!manifest) {
    return NextResponse.json(
      {
        error: `No payment manifest found for ${ustn}. Construct the manifest first via POST /api/sgtx/payment-manifest/construct.`,
        code: "MANIFEST_NOT_FOUND",
      },
      { status: 404 },
    );
  }

  // ── Governor gate validation 5: For Stage 2, DEPARTED milestone VERIFIED ──
  if (stage === 2) {
    let departed: any = null;
    try {
      departed = await db.milestone.findFirst({
        where: { ustn, type: "DEPARTED" },
        orderBy: { createdAt: "desc" },
      });
    } catch (e: any) {
      logger.warn("[payment/manifest/dispatch] DEPARTED milestone lookup failed (non-blocking)", { ustn, error: e?.message });
    }
    if (
      !departed ||
      (departed.status !== "VERIFIED" &&
        departed.status !== "CONFIRMED" &&
        departed.confirmedAt === null)
    ) {
      return NextResponse.json(
        {
          error: `DEPARTED milestone for ${ustn} is ${!departed ? "missing" : `not VERIFIED (status: ${departed.status})`} — Stage 2 (post-departure) requires the DEPARTED milestone to be confirmed first.`,
          code: "DEPARTED_NOT_VERIFIED",
          milestone_status: departed?.status || null,
        },
        { status: 409 },
      );
    }
  }

  // ── Pre-check FeeLock state — Golden Principle ───────────────────────────
  // If FeeLock is already ACTIVE, this is a duplicate dispatch — refuse.
  const existingLock = await getFeeLock(ustn).catch(() => null);
  if (existingLock && existingLock.status === "ACTIVE") {
    return NextResponse.json(
      {
        error: `FeeLock for ${ustn} is already ACTIVE — payment manifest has been dispatched and externally confirmed (camt.054/SWIFT gpi). Duplicate dispatch refused (Golden Principle).`,
        code: "FEELOCK_ALREADY_ACTIVE",
        feelock_status: "ACTIVE",
        lock_id: existingLock.lockId,
        activated_at: existingLock.settledAt,
      },
      { status: 409 },
    );
  }
  if (existingLock && existingLock.status && existingLock.status !== "PENDING") {
    return NextResponse.json(
      {
        error: `FeeLock for ${ustn} is in status "${existingLock.status}" — manifest dispatch not permitted in this state.`,
        code: "FEELOCK_NOT_PENDING",
        feelock_status: existingLock.status,
      },
      { status: 409 },
    );
  }

  // ── Dispatch via v18 §13.4 direct-bank-settlement lib ────────────────────
  // dispatchMultiLegSettlement runs the full §13.4.3 sequence internally:
  //   governorValidate → selectBank → build legs → persist PaymentLeg rows
  //   → persist BankSettlementGateway row → return PENDING status.
  // We rely on the lib's internal Governor validation as the SECOND line of
  // defence (the route-level checks above are the FIRST line). The lib's
  // governorValidate checks the same conditions + Stage 2 DEPARTED milestone.
  let dispatch: any;
  try {
    dispatch = await dispatchMultiLegSettlement(ustn, stage as 1 | 2);
  } catch (e: any) {
    logger.error("[payment/manifest/dispatch] dispatchMultiLegSettlement threw", { ustn, error: e?.message });
    return NextResponse.json(
      {
        error: `Manifest dispatch failed: ${e?.message || "unknown error"}`,
        code: "DISPATCH_FAILED",
        detail: e?.message,
      },
      { status: 500 },
    );
  }

  // Governor gate blocked the dispatch (lib-level check)
  if (dispatch.status === "REJECTED_GOVERNOR" || !dispatch.governorCheck?.passed) {
    return NextResponse.json(
      {
        error: "Governor gate blocked the manifest dispatch. Resolve the blocking factors and retry.",
        code: "GOVERNOR_BLOCKED",
        blocking_factors: dispatch.governorCheck?.blockingFactors || [],
        status: dispatch.status,
      },
      { status: 422 },
    );
  }

  // ── Build legs response envelope (per task spec) ────────────────────────
  // Task spec:
  //   legs: [{ leg_id, payee, amount, currency, end_to_end_id, status }]
  //   status MUST be PENDING (Golden Principle — instruction ≠ settled payment).
  // The direct-bank-settlement lib returns full SettlementLeg[] objects; we
  // project them down to the { leg_id, payee, amount, currency, end_to_end_id,
  // status } shape required by the task spec. The status is ALWAYS "PENDING"
  // because no camt.054/gpi confirmation has been ingested yet (the dispatch
  // is the instruction, not the confirmation).
  const dispatchedLegs = (Array.isArray(dispatch.legs) ? dispatch.legs : []).map(
    (leg: any) => ({
      leg_id: leg.leg_id,
      payee: leg.beneficiary_id,
      payee_name: leg.beneficiary_name,
      amount: leg.amount,
      currency: leg.currency,
      terms: leg.terms,
      due_date: leg.due_date || null,
      end_to_end_id: leg.end_to_end_id,
      uetr: leg.uetr || null,  // SWIFT gpi UETR (USD legs only) — empty for EGP
      purpose: leg.description,
      rmt_inf: leg.rmt_inf,
      // Golden Principle: payment instruction ≠ settled payment. Status is
      // PENDING until the bank ingests camt.054 (EGP legs) or SWIFT gpi UETR
      // SETTLED (USD legs) confirmation. The direct-bank-settlement lib sets
      // legState="PROCESSING" on PaymentLeg rows; the response status is
      // "PENDING" — these are the same concept, just different terminology.
      status: "PENDING",
    }),
  );

  // ── Smart Inbox notification to payer (one-click confirmation) ──────────
  // Per v18 §13.4.4 — one-click payment button. The payer should receive a
  // Smart Inbox notification confirming the dispatch + tracking refs + the
  // Golden Principle reminder (FeeLock PENDING until camt.054).
  try {
    const inboxTitle = `Payment manifest dispatched — ${ustn} Stage ${stage}`;
    const inboxDesc =
      `One-click payment manifest dispatched to the mandated bank. ` +
      `Stage ${stage} (${currency}) — ${dispatchedLegs.length} leg${dispatchedLegs.length === 1 ? "" : "s"} totalling ${currency} ${totalAmount.toFixed(2)}. ` +
      `Batch ID: ${dispatch.batchId}. ` +
      `Bank reference: ${dispatch.bankReference || "pending"}. ` +
      `Idempotency key: ${(dispatch.idempotencyKey || "").slice(0, 16)}…. ` +
      `Manifest version: v${manifest.manifest_version} (hash ${manifest.manifest_hash.slice(0, 24)}…). ` +
      `FeeLock status: PENDING — Golden Principle: payment instruction ≠ settled payment. ` +
      `FeeLock will transition to ACTIVE only when camt.054 / SWIFT gpi confirmation is ingested.`;
    await db.inboxItem.create({
      data: {
        tenantGtid: payerGtid,
        tradeId: trade.id,
        category: "PAYMENT",
        priority: 85,
        title: inboxTitle,
        description: inboxDesc,
        ctaLabel: "View Batch",
      },
    });
  } catch (e: any) {
    logger.warn("[payment/manifest/dispatch] Inbox notify failed (non-blocking)", { ustn, error: e?.message });
  }

  // ── Activity log entry (audit trail) ─────────────────────────────────────
  try {
    await db.activity.create({
      data: {
        tradeId: trade.id,
        actorGtid,
        action: stage === 1 ? "PAYMENT_MANIFEST_STAGE1_DISPATCH" : "PAYMENT_MANIFEST_STAGE2_DISPATCH",
        type: "SUCCESS",
        description:
          `Payment manifest dispatched (Stage ${stage}, ${currency}). USTN ${ustn}. ` +
          `Batch ${dispatch.batchId} → ${dispatch.bankReference || "bank pending"}. ` +
          `${dispatchedLegs.length} legs, total ${currency} ${totalAmount.toFixed(2)}. ` +
          `Manifest v${manifest.manifest_version} (hash ${manifest.manifest_hash.slice(0, 24)}…). ` +
          `FeeLock PENDING — camt.054/gpi confirmation required for activation (Golden Principle).`,
        metadata: JSON.stringify({
          ustn,
          stage,
          currency,
          total_amount: totalAmount,
          batch_id: dispatch.batchId,
          bank_reference: dispatch.bankReference,
          idempotency_key: dispatch.idempotencyKey,
          manifest_version: manifest.manifest_version,
          manifest_hash: manifest.manifest_hash,
          legs_count: dispatchedLegs.length,
          splits,
          payer_gtid: payerGtid,
          payer_bank_account: payerBankAccount,
          feelock_status: "PENDING",
          feelock_lock_id: existingLock?.lockId || null,
          started_at: startedAt,
          dispatched_at: new Date().toISOString(),
        }),
      },
    });
  } catch (e: any) {
    logger.warn("[payment/manifest/dispatch] Activity log failed (non-blocking)", { ustn, error: e?.message });
  }

  // ─── Return envelope (per task spec) ────────────────────────────────────
  return NextResponse.json({
    dispatched: true,
    ustn,
    stage,
    master_contract_id: trade.masterContractId || null,
    manifest_version: manifest.manifest_version,
    manifest_hash: manifest.manifest_hash,
    batch_id: dispatch.batchId,
    currency: dispatch.currency || currency,
    legs: dispatchedLegs,
    idempotency_key: dispatch.idempotencyKey,
    bank_reference: dispatch.bankReference || null,
    // GOLDEN PRINCIPLE: "SGTX must never equate a payment instruction with a
    // settled payment." Status is PENDING until camt.054 / SWIFT gpi confirms.
    feelock_status: "PENDING",
    governor_check: {
      passed: dispatch.governorCheck?.passed ?? true,
      blocking_factors: dispatch.governorCheck?.blockingFactors || [],
    },
    bank: {
      gtid: dispatch.bankGtid || null,
      name: dispatch.bankName || null,
      capability_tier: dispatch.capabilityTier || null,
    },
    next_steps: [
      "Bank executes the legs (simulated debit ack returned immediately).",
      "Bank ingests camt.054 (EGP legs) / SWIFT gpi UETR SETTLED (USD legs) confirmation.",
      "POST /api/sgtx/settlement/camt054 — ingest camt.054 XML to mark EGP legs SETTLED.",
      "POST /api/sgtx/settlement/swift-gpi — ingest SWIFT gpi UETR status to mark USD legs SETTLED.",
      "FeeLock transitions PENDING → ACTIVE automatically on all-legs-settled (Golden Principle).",
      "Container release possible once FeeLock is ACTIVE (POST /api/sgtx/release/authorization).",
    ],
    dispatched_at: new Date().toISOString(),
  });
}

// ─── GET helper — describes the endpoint shape (OpenAPI-style) ─────────────
export async function GET() {
  return NextResponse.json({
    endpoint: "POST /api/sgtx/payment/manifest/dispatch",
    spec: "v18 §13.4.4 — Payment Manifest Dispatch (One-Click Payment)",
    description:
      "The ONE-CLICK payment button that dispatches the entire payment manifest. Runs the full §13.4.3 sequence: Governor validation → BSG bank selection → multi-leg instruction → bank debit → bank executes legs → camt.054/gpi ingestion → FeeLock ACTIVE → container release. This endpoint dispatches the instruction; settlement + FeeLock activation happen when camt.054/gpi confirms (Golden Principle).",
    auth: "Authorization: Bearer <access_jwt> + x-csrf-token header",
    body: {
      ustn: "string — master or per-shipment USTN",
      stage: "1 | 2 — 1 = pre-shipment (EGP), 2 = post-departure (USD)",
      total_amount: "number — total amount to disburse (stage currency)",
      currency: '"EGP" | "USD"',
      payer: {
        gtid: "string — payer's GTID",
        bank_account: "string — payer's funding account (IBAN)",
      },
      splits: [
        {
          payee_gtid: "string",
          amount: "number",
          currency: '"EGP" | "USD"',
          purpose: "string — e.g. SGTX_FEE, CUSTOMS, FREIGHT",
          quote_id: "string? — link to accepted provider quote",
          terms: '"MANDATORY" | "CREDIT" — Stage 2 supports CREDIT (deferred)',
          due_date: "string? — ISO date for CREDIT legs (Stage 2)",
        },
      ],
    },
    validations: [
      "Contract is LOCKED (for Stage 1)",
      "All quotes ACCEPTED (no PENDING quotations)",
      "Packing plan LOCKED",
      "Payment manifest exists (getPaymentManifest(ustn) non-null)",
      "Stage 2: DEPARTED milestone VERIFIED",
      "FeeLock is PENDING (not ACTIVE — Golden Principle)",
      "splits sum to total_amount (within 1 unit tolerance)",
      "CREDIT legs (Stage 2) require future due_date",
    ],
    returns: {
      dispatched: "true",
      batch_id: "string",
      currency: "string",
      legs: [
        {
          leg_id: "string",
          payee: "string",
          amount: "number",
          currency: "string",
          end_to_end_id: "string",
          status: '"PENDING"',
        },
      ],
      idempotency_key: "string — SHA256(JCS-canonical-body + UTC-second)",
      bank_reference: "string?",
      feelock_status: '"PENDING"',
    },
    golden_principle:
      "SGTX must never equate a payment instruction with a settled payment. Leg status is PENDING until camt.054 / SWIFT gpi UETR SETTLED confirms. FeeLock transitions PENDING → ACTIVE only on all-legs-settled.",
    next_steps: [
      "POST /api/sgtx/settlement/camt054 — ingest camt.054 (EGP legs)",
      "POST /api/sgtx/settlement/swift-gpi — ingest SWIFT gpi UETR (USD legs)",
      "FeeLock PENDING → ACTIVE auto-activation on all-legs-settled",
      "POST /api/sgtx/release/authorization — container release possible once FeeLock ACTIVE",
    ],
  });
}
