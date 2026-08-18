// POST /api/sgtx/bonds/renew — Renew a bond (extends validity)
//
// Body:
//   bondId           (required)
//   newValidTo       (required ISO date — the new expiry date)
//   newAmount        (optional — change face value)
//   newBondReference (optional — refreshed reference number from issuer)
//   newIssuerName    (optional — refreshed issuer name)
//   reverifyRequired (optional, default true — if true, sets verified=false
//                     so the tenant must call /verify before allocating again)
//
// The bond's validFrom is moved to now; validTo is set to newValidTo. Status
// transitions to PENDING_VERIFICATION if reverifyRequired, else ACTIVE.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }
    const {
      bondId,
      newValidTo,
      newAmount,
      newBondReference,
      newIssuerName,
      reverifyRequired = true,
    } = body as Record<string, unknown>;

    if (!bondId || typeof bondId !== "string") {
      return NextResponse.json({ ok: false, error: "bondId is required" }, { status: 400 });
    }
    if (!newValidTo || typeof newValidTo !== "string") {
      return NextResponse.json({ ok: false, error: "newValidTo (ISO date) is required" }, { status: 400 });
    }
    const newValid = new Date(newValidTo);
    if (isNaN(newValid.getTime())) {
      return NextResponse.json(
        { ok: false, error: `newValidTo is not a valid date: ${newValidTo}` },
        { status: 400 },
      );
    }
    if (newValid.getTime() <= Date.now()) {
      return NextResponse.json(
        { ok: false, error: "newValidTo must be a future date" },
        { status: 400 },
      );
    }

    const bond = await db.customsBond.findUnique({ where: { id: bondId } });
    if (!bond) {
      return NextResponse.json({ ok: false, error: `Bond ${bondId} not found` }, { status: 404 });
    }
    if (bond.status === "CANCELLED") {
      return NextResponse.json(
        { ok: false, error: "Cannot renew a CANCELLED bond — create a new one instead" },
        { status: 400 },
      );
    }

    const updates: Record<string, unknown> = {
      validFrom: new Date(),
      validTo: newValid,
      status: reverifyRequired ? "PENDING_VERIFICATION" : "ACTIVE",
    };
    if (typeof newAmount === "number" && Number.isFinite(newAmount) && newAmount > 0) {
      updates.amount = newAmount;
    } else if (typeof newAmount === "string") {
      const n = parseFloat(newAmount);
      if (Number.isFinite(n) && n > 0) updates.amount = n;
    }
    if (typeof newBondReference === "string") updates.bondReference = newBondReference;
    if (typeof newIssuerName === "string") updates.issuerName = newIssuerName;
    if (reverifyRequired) {
      updates.verified = false;
      updates.verifiedAt = null;
    }

    const updated = await db.customsBond.update({
      where: { id: bondId },
      data: updates as never,
    });

    logger.info("Bond renewed", {
      bondId,
      newValidTo: newValid.toISOString(),
      reverifyRequired: Boolean(reverifyRequired),
      newAmount: updates.amount ?? null,
    });

    return NextResponse.json({
      ok: true,
      bond: updated,
      renewed: true,
      reverifyRequired: Boolean(reverifyRequired),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[bonds/renew] error", { msg, raw: String(e) });
    return NextResponse.json({ ok: false, error: msg || "renew failed" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/sgtx/bonds/renew",
    description: "Renew a bond — extends validity, optionally refreshes amount/reference",
    body: {
      bondId: "string (required)",
      newValidTo: "ISO date (required — must be future)",
      newAmount: "number (optional)",
      newBondReference: "string (optional)",
      newIssuerName: "string (optional)",
      reverifyRequired: "boolean (default true — sets verified=false)",
    },
  });
}
