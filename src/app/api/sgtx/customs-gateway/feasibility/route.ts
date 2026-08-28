// @ts-nocheck
/**
 * SGTX Customs Gateway — Trade Feasibility API (§82)
 * ===========================================================================
 * POST /api/sgtx/customs-gateway/feasibility
 *   Body:  { product, hsCode, origin, destination, quantity, value,
 *            incoterm, transportMode, importExport, jurisdiction }
 *   Returns: { ok, result }
 *
 * L0: ADVISORY ONLY (§82). The result is a planning signal — it is
 * NOT legal clearance and NOT a customs authority determination (§113).
 * The `notes` field carries the disclaimer verbatim.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkTradeFeasibility, type FeasibilityInput } from "@/lib/sgtx/customs-gateway/trade-feasibility";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "JSON body required" },
        { status: 400 },
      );
    }
    if (!body.product || !body.origin || !body.destination) {
      return NextResponse.json(
        { ok: false, error: "product, origin, and destination are required" },
        { status: 400 },
      );
    }
    if (!["IMPORT", "EXPORT", "TRANSIT"].includes(body.importExport)) {
      return NextResponse.json(
        { ok: false, error: "importExport must be IMPORT | EXPORT | TRANSIT" },
        { status: 400 },
      );
    }
    const input: FeasibilityInput = {
      product: String(body.product),
      hsCode: String(body.hsCode || ""),
      origin: String(body.origin),
      destination: String(body.destination),
      quantity: Number(body.quantity || 0),
      value: Number(body.value || 0),
      incoterm: String(body.incoterm || ""),
      transportMode: String(body.transportMode || ""),
      importExport: body.importExport,
      jurisdiction: String(body.jurisdiction || ""),
    };
    const result = await checkTradeFeasibility(input);
    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    logger.error("[api/feasibility] POST failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
