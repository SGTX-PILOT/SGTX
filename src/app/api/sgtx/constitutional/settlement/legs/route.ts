// @ts-nocheck
// §45 Settlement Orchestration — list payment legs for a USTN
// GET /api/sgtx/constitutional/settlement/legs?ustn=X
import { NextResponse } from "next/server";
import { getPaymentLegs } from "@/lib/sgtx/settlement-orchestration";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn") || undefined;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const legs = await getPaymentLegs(ustn);
    return NextResponse.json({ legs, count: legs.length });
  } catch (err: any) {
    logger.error("[api/constitutional/settlement/legs] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
