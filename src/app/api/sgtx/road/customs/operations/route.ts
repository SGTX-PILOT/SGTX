// @ts-nocheck
// POST /api/sgtx/road/customs/operations
// Body: { ustn, corridorId?, country, border?, customsOffice?, operationType,
//         declarationNumber?, brokerGtid? }
// Creates a CustomsOperation row in DRAFT status.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

const VALID_OP_TYPES = new Set([
  "EG_EXPORT",
  "EG_TRANSIT",
  "TRANSIT_CONTINUATION",
  "EG_IMPORT",
  "CROSS_BORDER_TRANSIT",
]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.ustn || !body?.country || !body?.operationType) {
      return NextResponse.json(
        { error: "ustn, country, operationType required" },
        { status: 400 },
      );
    }
    if (!VALID_OP_TYPES.has(String(body.operationType).toUpperCase())) {
      return NextResponse.json(
        { error: `invalid operationType: ${body.operationType}` },
        { status: 400 },
      );
    }
    const op = await db.customsOperation.create({
      data: {
        ustn: body.ustn,
        corridorId: body.corridorId || null,
        country: String(body.country).toUpperCase(),
        border: body.border || null,
        customsOffice: body.customsOffice || null,
        operationType: String(body.operationType).toUpperCase(),
        declarationNumber: body.declarationNumber || null,
        brokerGtid: body.brokerGtid || null,
        status: "DRAFT",
      },
    });
    logger.info("[api/road/customs/operations] POST created", {
      operationId: op.id,
      ustn: body.ustn,
      operationType: body.operationType,
    });
    return NextResponse.json({ operation: op });
  } catch (err: any) {
    logger.error("[api/road/customs/operations] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
