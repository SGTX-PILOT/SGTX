// @ts-nocheck
// POST /api/sgtx/road/tir/apply
// Body: { ustn, corridorId?, guaranteeAssociation?, customsOfficeDeparture?,
//         transitOffices?, destinationCustoms?, guaranteeAmount?, currency?,
//         holder? }
// Applies for a TIR carnet — creates a TransitGuarantee of type TIR in PENDING
// status. The platform does not (yet) issue real TIR carnets — operators must
// obtain a physical carnet from their national guaranteeing association (e.g.
// IRU / national chamber of commerce). The returned reference is a placeholder.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }

    // Generate a placeholder TIR carnet reference (YYYY/NNNNNN format)
    const year = new Date().getFullYear();
    const seq = Math.floor(Math.random() * 1_000_000)
      .toString()
      .padStart(6, "0");
    const tirReference = `TIR/${year}/${seq}`;
    const carnetReference = `CN-${seq}`;

    const guarantee = await db.transitGuarantee.create({
      data: {
        ustn: body.ustn,
        corridorId: body.corridorId || null,
        guaranteeType: "TIR",
        tirReference,
        carnetReference,
        holder: body.holder || null,
        guaranteeAssociation: body.guaranteeAssociation || null,
        customsOfficeDeparture: body.customsOfficeDeparture || null,
        transitOffices: body.transitOffices ? JSON.stringify(body.transitOffices) : null,
        destinationCustoms: body.destinationCustoms || null,
        guaranteeAmount: body.guaranteeAmount ?? null,
        currency: body.currency || "USD",
        validity: null,
        status: "PENDING",
      },
    });

    logger.info("[api/road/tir/apply] created", {
      guaranteeId: guarantee.id,
      ustn: body.ustn,
      tirReference,
    });

    return NextResponse.json({
      tir: guarantee,
      tirReference,
      carnetReference,
      notice:
        "TIR carnet reference is a placeholder — obtain a physical carnet from your national guaranteeing association (IRU / chamber of commerce).",
    });
  } catch (err: any) {
    logger.error("[api/road/tir/apply] POST failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
