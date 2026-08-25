// @ts-nocheck
// POST /api/sgtx/roro/[id]/bl — create a Bill of Lading for a RoRo shipment (Art 72).
//
// Body (any subset):
//   { blNumber?, blType?: "MASTER"|"HOUSE", shipper?, consignee?,
//     notifyParty?, vesselName?, voyageNumber?, portOfLoading?,
//     portOfDischarge?, transitPorts?: string[], vinsList?: string[],
//     cargoDescription?, totalWeightKg?, freight?, charges?: {...},
//     issuedAt? }
//
// If vinsList is not provided, it is auto-populated from the shipment's units'
// VINs. If portOfLoading / portOfDischarge are not provided, they fall back
// to the shipment's originPort / destinationPort.
//
// Returns:
//   { bl: {...} } | { error: string }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { createBillOfLading } from "@/lib/sgtx/roro";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: "Missing shipment id" },
        { status: 400 },
      );
    }
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const bl = await createBillOfLading(id, body);
    if (!bl) {
      return NextResponse.json(
        { error: "Failed to create Bill of Lading — see server logs" },
        { status: 500 },
      );
    }
    return NextResponse.json({ bl }, { status: 201 });
  } catch (e: any) {
    logger.error("[api/sgtx/roro/[id]/bl POST] error", {
      error: e?.message || String(e),
    });
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
