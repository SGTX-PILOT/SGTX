// @ts-nocheck
// GET /api/sgtx/grire/product-corridor-docs?hsCode=08111000&origin=EG&dest=DE
//
// Returns the product- and corridor-specific document set required to clear
// customs for the given (HS code, origin, destination) triple.
import { NextRequest, NextResponse } from "next/server";
import { getProductCorridorMatrixResult } from "@/lib/sgtx/grire/product-corridor-matrix";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const hsCode = (searchParams.get("hsCode") ?? "").trim();
    const origin = (searchParams.get("origin") ?? "").trim().toUpperCase();
    const dest = (searchParams.get("dest") ?? "").trim().toUpperCase();
    if (!hsCode || !origin || !dest) {
      return NextResponse.json(
        { ok: false, error: "Required: ?hsCode=HS&origin=ISO2&dest=ISO2" },
        { status: 400 },
      );
    }
    const result = await getProductCorridorMatrixResult(hsCode, origin, dest);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("product-corridor-docs GET failed", { error: e?.message ?? String(e) });
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
