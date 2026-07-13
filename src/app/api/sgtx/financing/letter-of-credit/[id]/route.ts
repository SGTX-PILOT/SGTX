// SGTX Tier 2 — Letter of Credit single-record operations.
//
// GET   /api/sgtx/financing/letter-of-credit/[id]
//   Returns the L/C record (or 404).
//
// PATCH /api/sgtx/financing/letter-of-credit/[id]
//   Updates fields on the L/C (amendment, status transition, validation results).
//   Body: any subset of the L/C columns (except id, ustn, tradeId, createdAt).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

/** Allowed L/C types — re-declared here (mirrors the POST route). */
const LC_TYPES = new Set([
  "IRREVOCABLE",
  "REVOCABLE",
  "CONFIRMED",
  "UNCONFIRMED",
  "STANDBY",
  "REVOLVING",
]);

/** Fields a PATCH caller is allowed to update. */
const PATCHABLE_FIELDS = new Set([
  "lcType",
  "issuanceDate",
  "expiryDate",
  "expiryPlace",
  "issuingBankGtid",
  "issuingBankName",
  "advisingBankGtid",
  "advisingBankName",
  "confirmingBankGtid",
  "confirmingBankName",
  "applicantName",
  "applicantAddress",
  "applicantGtid",
  "beneficiaryName",
  "beneficiaryAddress",
  "beneficiaryGtid",
  "currency",
  "amount",
  "tolerancePlus",
  "toleranceMinus",
  "maxCreditAmount",
  "portOfLoading",
  "portOfDischarge",
  "placeOfDelivery",
  "latestShipmentDate",
  "partialShipments",
  "transshipments",
  "requiredDocuments",
  "documentCount",
  "presentationDays",
  "presentationPlace",
  "bankingCharges",
  "confirmationCharges",
  "status",
  "amendedFrom",
  "amendmentCount",
  "lastValidationAt",
  "lastValidationResult",
  "discrepancyCount",
]);

/**
 * GET handler — fetch a single L/C by id.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const lc = await db.letterOfCredit.findUnique({ where: { id } });
    if (!lc) {
      return NextResponse.json(
        { error: `Letter of Credit ${id} not found` },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, letterOfCredit: lc });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[letter-of-credit/[id]/GET] error:", { msg, raw: String(e) });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * PATCH handler — amend or transition status on an L/C.
 *
 * Date fields (issuanceDate, expiryDate, latestShipmentDate, lastValidationAt)
 * are accepted as ISO-8601 strings and converted to Date instances.
 *
 * The `requiredDocuments` field is accepted as either an array or a JSON
 * string and normalised to a JSON-string for the Prisma column. The
 * `documentCount` field is automatically derived from the array length if
 * the caller supplies `requiredDocuments` but not `documentCount`.
 *
 * If the caller supplies `status: "AMENDED"`, the `amendmentCount` is
 * automatically incremented by 1 (unless the caller explicitly sets it).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const body = (await req.json()) as Record<string, unknown>;

    // Whitelist patchable fields.
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (PATCHABLE_FIELDS.has(key)) {
        updates[key] = value;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No patchable fields supplied" },
        { status: 400 },
      );
    }

    // Validate lcType if supplied.
    if (typeof updates.lcType === "string" && !LC_TYPES.has(updates.lcType)) {
      return NextResponse.json(
        { error: `lcType must be one of: ${Array.from(LC_TYPES).join(", ")}` },
        { status: 400 },
      );
    }

    // Date conversion.
    const dateFields = [
      "issuanceDate",
      "expiryDate",
      "latestShipmentDate",
      "lastValidationAt",
    ];
    for (const f of dateFields) {
      if (f in updates && typeof updates[f] === "string" && updates[f]) {
        const d = new Date(updates[f] as string);
        if (isNaN(d.getTime())) {
          return NextResponse.json(
            { error: `Field "${f}" is not a valid date: ${updates[f]}` },
            { status: 400 },
          );
        }
        updates[f] = d;
      }
    }

    // requiredDocuments normalisation.
    if ("requiredDocuments" in updates) {
      let arr: unknown[] = [];
      const raw = updates.requiredDocuments;
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
      updates.requiredDocuments = JSON.stringify(clean);
      if (!("documentCount" in updates)) {
        updates.documentCount = clean.length;
      }
    }

    // Amendment counter auto-increment on AMENDED status.
    if (updates.status === "AMENDED" && !("amendmentCount" in updates)) {
      const current = await db.letterOfCredit.findUnique({
        where: { id },
        select: { amendmentCount: true },
      });
      if (current) {
        updates.amendmentCount = (current.amendmentCount ?? 0) + 1;
      }
    }

    const updated = await db.letterOfCredit.update({
      where: { id },
      data: updates as never,
    });

    return NextResponse.json({ ok: true, letterOfCredit: updated });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[letter-of-credit/[id]/PATCH] error:", { msg, raw: String(e) });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
