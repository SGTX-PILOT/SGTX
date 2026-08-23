// @ts-nocheck
// §45.3 Settlement Orchestration — aggregate settlement status
// GET /api/sgtx/constitutional/settlement/status?ustn=X
import { NextResponse } from "next/server";
import { getSettlementStatus } from "@/lib/sgtx/settlement-orchestration";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn") || undefined;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const status = await getSettlementStatus(ustn);
    return NextResponse.json({ status });
  } catch (err: any) {
    logger.error("[api/constitutional/settlement/status] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
