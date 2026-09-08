// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { getMultiShipmentStatus } from "@/lib/sgtx/multi-shipment";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { masterContractId: string } },
) {
  try {
    const masterContractId = params.masterContractId;
    if (!masterContractId) {
      return NextResponse.json({ error: "masterContractId is required" }, { status: 400 });
    }
    const status = await getMultiShipmentStatus(masterContractId);
    return NextResponse.json({ ok: true, ...status });
  } catch (e: any) {
    logger.error("[multi-shipment/status] GET failed", { error: e?.message });
    const status = e?.code === "MASTER_CONTRACT_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: e?.message || "internal error", code: e?.code }, { status });
  }
}
