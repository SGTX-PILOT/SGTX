// @ts-nocheck
// POST /api/sgtx/road/tir/{id}/discharge
// Body: { dischargeOffice?, dischargeNotes? }
// Discharges a TIR carnet — sets dischargeStatus = DISCHARGED on the
// TransitGuarantee row. The platform does not (yet) push discharge confirmations
// back to the IRU / national guaranteeing association — operators must file
// the discharge manually.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "TIR id required" }, { status: 400 });
    }
    const body = (await req.json().catch(() => ({}))) || {};

    const tir = await db.transitGuarantee.findUnique({ where: { id } });
    if (!tir) {
      return NextResponse.json({ error: "TIR not found" }, { status: 404 });
    }
    if (tir.dischargeStatus === "DISCHARGED") {
      return NextResponse.json(
        { error: "TIR already discharged" },
        { status: 409 },
      );
    }

    const updated = await db.transitGuarantee.update({
      where: { id },
      data: {
        dischargeStatus: "DISCHARGED",
        status: "DISCHARGED",
        destinationCustoms: body.dischargeOffice || tir.destinationCustoms,
      },
    });

    logger.info("[api/road/tir/[id]/discharge] discharged", {
      tirId: id,
      dischargeOffice: body.dischargeOffice || "(unchanged)",
    });

    return NextResponse.json({
      tir: updated,
      notice:
        "Platform-side discharge recorded. You must still file the discharge confirmation with your national guaranteeing association.",
    });
  } catch (err: any) {
    logger.error("[api/road/tir/[id]/discharge] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
