// 3B.6.3 — Batch scan multiple pallets (group confirm)
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { batchScanPallets } from "@/lib/sgtx/execution";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { shipmentId, ssccs, loadedBy } = body;
    if (!shipmentId || !Array.isArray(ssccs) || ssccs.length === 0 || !loadedBy) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    const result = await batchScanPallets({ shipmentId, ssccs, loadedBy });
    return NextResponse.json(result);
  } catch (e: any) {
    logger.error("[execution/pallet/batch-scan]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
