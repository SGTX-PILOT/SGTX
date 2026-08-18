// POST /api/sgtx/bonds/verify — Verify a bond with its issuer
//
// Marks the bond as verified and transitions it to ACTIVE (or stays in
// PARTIALLY_UTILISED / FULLY_UTILISED if those are already set due to live
// allocations). If the bond has an expiry date in the past it is moved to
// EXPIRED instead.
//
// Body:
//   bondId            (required)
//   verifiedBy        (optional — GTID of the verifying employee/system)
//   externalReference (optional — issuer-side verification reference)
//   issuerResponse    (optional — raw response from issuer API, stored as JSON)

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { validateBond } from "@/lib/sgtx/bonds";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }
    const {
      bondId,
      verifiedBy,
      externalReference,
      issuerResponse,
    } = body as Record<string, unknown>;

    if (!bondId || typeof bondId !== "string") {
      return NextResponse.json({ ok: false, error: "bondId is required" }, { status: 400 });
    }

    const bond = await db.customsBond.findUnique({ where: { id: bondId } });
    if (!bond) {
      return NextResponse.json({ ok: false, error: `Bond ${bondId} not found` }, { status: 404 });
    }

    const now = new Date();
    // If the bond has a validTo that's already in the past, move it to EXPIRED.
    const expired =
      bond.validTo && bond.validTo.getTime && bond.validTo.getTime() < now.getTime();
    const nextStatus = expired
      ? "EXPIRED"
      : bond.status === "PARTIALLY_UTILISED" || bond.status === "FULLY_UTILISED"
        ? bond.status
        : "ACTIVE";

    const updated = await db.customsBond.update({
      where: { id: bondId },
      data: {
        verified: true,
        verifiedAt: now,
        status: nextStatus,
      },
    });

    // Validation pass on the freshly verified bond
    const validation = validateBond({
      amount: updated.amount,
      jurisdiction: updated.jurisdiction,
      aeoStatus: updated.aeoStatus,
      bondType: updated.bondType,
      status: updated.status,
      validTo: updated.validTo,
      verified: updated.verified,
    });

    logger.info("Bond verified", {
      bondId,
      verifiedBy: verifiedBy ?? null,
      nextStatus,
      expired,
      valid: validation.valid,
    });

    return NextResponse.json({
      ok: true,
      bond: updated,
      valid: validation.valid,
      issues: validation.issues,
      verifiedBy: typeof verifiedBy === "string" ? verifiedBy : null,
      externalReference:
        typeof externalReference === "string" ? externalReference : null,
      issuerResponse: issuerResponse ?? null,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[bonds/verify] error", { msg, raw: String(e) });
    return NextResponse.json({ ok: false, error: msg || "verify failed" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/sgtx/bonds/verify",
    description: "Verify a bond with its issuer (sets verified=true, transitions to ACTIVE)",
    body: {
      bondId: "string (required)",
      verifiedBy: "string (optional)",
      externalReference: "string (optional)",
      issuerResponse: "object (optional)",
    },
  });
}
