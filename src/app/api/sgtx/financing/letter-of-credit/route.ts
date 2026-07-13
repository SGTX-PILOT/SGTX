// SGTX Tier 2 — Letter of Credit CRUD (replaces Invoice-stub implementation).
//
// POST /api/sgtx/financing/letter-of-credit
//   Body: { ustn, tradeId?, lcNumber, lcType, issuanceDate, expiryDate,
//           issuingBankName, issuingBankGtid?, applicantName, applicantAddress?,
//           applicantGtid?, beneficiaryName, beneficiaryAddress?,
//           beneficiaryGtid?, currency, amount, portOfLoading?, portOfDischarge?,
//           placeOfDelivery?, latestShipmentDate?, partialShipments?,
//           transshipments?, requiredDocuments?, presentationDays?,
//           presentationPlace?, bankingCharges?, advisingBankName?,
//           advisingBankGtid?, confirmingBankName?, confirmingBankGtid?,
//           tolerancePlus?, toleranceMinus?, maxCreditAmount?,
//           confirmationCharges?, status?, expiryPlace? }
//   Persists a dedicated `LetterOfCredit` row (NOT an Invoice anymore).
//
// GET  /api/sgtx/financing/letter-of-credit?ustn=...|?tradeId=...
//   Lists all L/Cs for the given trade.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

/** Allowed L/C types (validated against the Prisma schema comment). */
const LC_TYPES = new Set([
  "IRREVOCABLE",
  "REVOCABLE",
  "CONFIRMED",
  "UNCONFIRMED",
  "STANDBY",
  "REVOLVING",
]);

/** Allowed values for the `partialShipments` / `transshipments` fields. */
const TOGGLE_VALUES = new Set(["ALLOWED", "NOT_ALLOWED"]);

/** Allowed values for the `bankingCharges` field. */
const BANKING_CHARGES = new Set(["BENEFICIARY", "APPLICANT", "SHARED"]);

/**
 * Parse an ISO-8601 date string into a Date. Throws on missing/invalid input.
 * Used to validate body date fields before they reach Prisma.
 */
function parseDateField(field: string, value: unknown): Date {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Field "${field}" is required and must be an ISO-8601 string`);
  }
  const d = new Date(value);
  if (isNaN(d.getTime())) {
    throw new Error(`Field "${field}" is not a valid date: ${value}`);
  }
  return d;
}

/**
 * Normalize the `requiredDocuments` body field (string[] or JSON string)
 * into a JSON-string for the Prisma `String` column.
 */
function normalizeRequiredDocuments(raw: unknown): { json: string; count: number } {
  let arr: unknown[] = [];
  if (Array.isArray(raw)) {
    arr = raw;
  } else if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      arr = Array.isArray(parsed) ? parsed : [];
    } catch {
      arr = raw.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  const clean = arr.map((s) => String(s)).filter(Boolean);
  return { json: JSON.stringify(clean), count: clean.length };
}

/**
 * POST handler — create a Letter of Credit record (dedicated model, not an Invoice).
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const {
      ustn,
      tradeId,
      lcNumber,
      lcType = "IRREVOCABLE",
      issuingBankName,
      issuingBankGtid,
      advisingBankName,
      advisingBankGtid,
      confirmingBankName,
      confirmingBankGtid,
      applicantName,
      applicantAddress,
      applicantGtid,
      beneficiaryName,
      beneficiaryAddress,
      beneficiaryGtid,
      currency = "USD",
      amount,
      portOfLoading,
      portOfDischarge,
      placeOfDelivery,
      latestShipmentDate,
      partialShipments = "ALLOWED",
      transshipments = "ALLOWED",
      requiredDocuments,
      presentationDays = 21,
      presentationPlace,
      bankingCharges = "BENEFICIARY",
      confirmationCharges,
      tolerancePlus = 0,
      toleranceMinus = 0,
      maxCreditAmount,
      status = "ISSUED",
      expiryPlace,
      issuanceDate,
      expiryDate,
    } = body as {
      ustn?: string;
      tradeId?: string;
      lcNumber?: string;
      lcType?: string;
      issuingBankName?: string;
      issuingBankGtid?: string;
      advisingBankName?: string;
      advisingBankGtid?: string;
      confirmingBankName?: string;
      confirmingBankGtid?: string;
      applicantName?: string;
      applicantAddress?: string;
      applicantGtid?: string;
      beneficiaryName?: string;
      beneficiaryAddress?: string;
      beneficiaryGtid?: string;
      currency?: string;
      amount?: number;
      portOfLoading?: string;
      portOfDischarge?: string;
      placeOfDelivery?: string;
      latestShipmentDate?: string;
      partialShipments?: string;
      transshipments?: string;
      requiredDocuments?: unknown;
      presentationDays?: number;
      presentationPlace?: string;
      bankingCharges?: string;
      confirmationCharges?: string;
      tolerancePlus?: number;
      toleranceMinus?: number;
      maxCreditAmount?: number;
      status?: string;
      expiryPlace?: string;
      issuanceDate?: string;
      expiryDate?: string;
    };

    // Required-field validation.
    if (!ustn || typeof ustn !== "string") {
      return NextResponse.json({ error: "ustn is required" }, { status: 400 });
    }
    if (!lcNumber || typeof lcNumber !== "string") {
      return NextResponse.json({ error: "lcNumber is required" }, { status: 400 });
    }
    if (!issuingBankName) {
      return NextResponse.json({ error: "issuingBankName is required" }, { status: 400 });
    }
    if (!applicantName) {
      return NextResponse.json({ error: "applicantName is required" }, { status: 400 });
    }
    if (!beneficiaryName) {
      return NextResponse.json({ error: "beneficiaryName is required" }, { status: 400 });
    }
    if (typeof amount !== "number" || amount <= 0) {
      return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
    }
    if (!LC_TYPES.has(lcType)) {
      return NextResponse.json(
        { error: `lcType must be one of: ${Array.from(LC_TYPES).join(", ")}` },
        { status: 400 },
      );
    }
    if (!TOGGLE_VALUES.has(partialShipments)) {
      return NextResponse.json(
        { error: `partialShipments must be ALLOWED or NOT_ALLOWED` },
        { status: 400 },
      );
    }
    if (!TOGGLE_VALUES.has(transshipments)) {
      return NextResponse.json(
        { error: `transshipments must be ALLOWED or NOT_ALLOWED` },
        { status: 400 },
      );
    }
    if (!BANKING_CHARGES.has(bankingCharges)) {
      return NextResponse.json(
        { error: `bankingCharges must be BENEFICIARY, APPLICANT, or SHARED` },
        { status: 400 },
      );
    }

    // Date parsing.
    const issuance = parseDateField("issuanceDate", issuanceDate);
    const expiry = parseDateField("expiryDate", expiryDate);
    if (expiry.getTime() <= issuance.getTime()) {
      return NextResponse.json(
        { error: "expiryDate must be later than issuanceDate" },
        { status: 400 },
      );
    }
    const latestShipment =
      typeof latestShipmentDate === "string" && latestShipmentDate.trim()
        ? parseDateField("latestShipmentDate", latestShipmentDate)
        : null;

    // Resolve the trade.
    const trade = await db.trade.findUnique({ where: { ustn } });
    if (!trade) {
      return NextResponse.json({ error: `Trade not found for ustn=${ustn}` }, { status: 404 });
    }
    const resolvedTradeId = tradeId || trade.id;

    const docs = normalizeRequiredDocuments(requiredDocuments);

    // Uniqueness guard on lcNumber.
    const existing = await db.letterOfCredit.findUnique({ where: { lcNumber } });
    if (existing) {
      return NextResponse.json(
        { error: `Letter of Credit with lcNumber=${lcNumber} already exists` },
        { status: 409 },
      );
    }

    const lc = await db.letterOfCredit.create({
      data: {
        ustn,
        tradeId: resolvedTradeId,
        lcNumber,
        lcType,
        issuanceDate: issuance,
        expiryDate: expiry,
        expiryPlace: expiryPlace ?? null,
        issuingBankGtid: issuingBankGtid ?? null,
        issuingBankName,
        advisingBankGtid: advisingBankGtid ?? null,
        advisingBankName: advisingBankName ?? null,
        confirmingBankGtid: confirmingBankGtid ?? null,
        confirmingBankName: confirmingBankName ?? null,
        applicantName,
        applicantAddress: applicantAddress ?? null,
        applicantGtid: applicantGtid ?? null,
        beneficiaryName,
        beneficiaryAddress: beneficiaryAddress ?? null,
        beneficiaryGtid: beneficiaryGtid ?? null,
        currency,
        amount,
        tolerancePlus: Number(tolerancePlus) || 0,
        toleranceMinus: Number(toleranceMinus) || 0,
        maxCreditAmount: maxCreditAmount ?? null,
        portOfLoading: portOfLoading ?? null,
        portOfDischarge: portOfDischarge ?? null,
        placeOfDelivery: placeOfDelivery ?? null,
        latestShipmentDate: latestShipment,
        partialShipments,
        transshipments,
        requiredDocuments: docs.json,
        documentCount: docs.count,
        presentationDays: Number(presentationDays) || 21,
        presentationPlace: presentationPlace ?? null,
        bankingCharges,
        confirmationCharges: confirmationCharges ?? null,
        status,
      },
    });

    // Best-effort smart-inbox notifications (must not fail the request).
    const notifyBank = issuingBankGtid ?? null;
    if (notifyBank) {
      await db.inboxItem
        .create({
          data: {
            tenantGtid: notifyBank,
            tradeId: resolvedTradeId,
            category: "NEEDS_APPROVAL",
            priority: 90,
            title: `LC Request — ${lcNumber} (${amount} ${currency})`,
            description: `Letter of Credit ${lcNumber} for ${applicantName} → ${beneficiaryName}. USTN: ${ustn}. Type: ${lcType}. Expiry: ${expiry.toISOString().slice(0, 10)}.`,
            ctaLabel: "Review LC Request",
            deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
          },
        })
        .catch((err: unknown) => {
          logger.warn("[letter-of-credit/POST] bank inbox notification failed:", {
            msg: err instanceof Error ? err.message : String(err),
          });
        });
    }
    if (beneficiaryGtid) {
      await db.inboxItem
        .create({
          data: {
            tenantGtid: beneficiaryGtid,
            tradeId: resolvedTradeId,
            category: "GENERAL",
            priority: 75,
            title: `LC Issued — ${lcNumber}`,
            description: `Letter of Credit ${lcNumber} for ${amount} ${currency} has been issued by ${issuingBankName}. Expiry: ${expiry.toISOString().slice(0, 10)}.`,
            ctaLabel: "View LC Details",
          },
        })
        .catch((err: unknown) => {
          logger.warn("[letter-of-credit/POST] beneficiary inbox notification failed:", {
            msg: err instanceof Error ? err.message : String(err),
          });
        });
    }

    return NextResponse.json({
      ok: true,
      lcId: lc.id,
      letterOfCredit: lc,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[letter-of-credit/POST] error:", { msg, raw: String(e) });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * GET handler — list L/Cs by `ustn` or `tradeId`.
 */
export async function GET(req: NextRequest) {
  try {
    const ustn = req.nextUrl.searchParams.get("ustn");
    const tradeId = req.nextUrl.searchParams.get("tradeId");

    if (!ustn && !tradeId) {
      return NextResponse.json(
        { error: "Provide either ?ustn= or ?tradeId=" },
        { status: 400 },
      );
    }

    const where: { ustn?: string; tradeId?: string } = {};
    if (ustn) where.ustn = ustn;
    if (tradeId) where.tradeId = tradeId;

    const lettersOfCredit = await db.letterOfCredit.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      ok: true,
      count: lettersOfCredit.length,
      lettersOfCredit,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[letter-of-credit/GET] error:", { msg, raw: String(e) });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
