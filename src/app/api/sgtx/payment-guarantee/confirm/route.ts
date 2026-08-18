// POST /api/sgtx/payment-guarantee/confirm — confirm a payment guarantee
//
// Body:
//   {
//     guaranteeId: string,              // required
//     confirmationMethod?: string,      // e.g., "SWIFT_MT760", "SWIFT_MT799", "MANUAL"
//     confirmationReference?: string
//   }
//
// Idempotent: re-confirming an already-confirmed guarantee returns 200 with
// idempotent=true.
//
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { guaranteeId, confirmationMethod, confirmationReference } = body || {};

    if (!guaranteeId) {
      return NextResponse.json({ error: "Missing required field: guaranteeId" }, { status: 400 });
    }

    const existing = await (db as any).paymentGuarantee.findUnique({
      where: { id: guaranteeId },
    });
    if (!existing) {
      return NextResponse.json({ error: "payment guarantee not found" }, { status: 404 });
    }

    if (existing.confirmed) {
      return NextResponse.json({
        ok: true,
        guaranteeId: existing.id,
        confirmed: true,
        confirmedAt: existing.confirmedAt,
        idempotent: true,
      });
    }

    const data: any = {
      confirmed: true,
      confirmedAt: new Date(),
    };
    if (confirmationMethod) data.confirmationMethod = confirmationMethod;
    if (confirmationReference) data.confirmationReference = confirmationReference;

    const updated = await (db as any).paymentGuarantee.update({
      where: { id: guaranteeId },
      data,
    });

    logger.info("[payment-guarantee/confirm] confirmed", {
      guaranteeId,
      method: confirmationMethod || null,
    });

    return NextResponse.json({
      ok: true,
      guaranteeId: updated.id,
      confirmed: true,
      confirmedAt: updated.confirmedAt,
    });
  } catch (e: any) {
    logger.error("[payment-guarantee/confirm] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
