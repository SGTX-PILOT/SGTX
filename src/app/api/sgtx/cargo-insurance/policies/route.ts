// GET /api/sgtx/cargo-insurance/policies?ustn=X — list policies for a shipment
//
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn") || "";

    if (!ustn) {
      return NextResponse.json({ error: "Missing required query param: ustn" }, { status: 400 });
    }

    const policies = await (db as any).insurancePolicy.findMany({
      where: { ustn },
      orderBy: { createdAt: "desc" },
      include: { provider: true },
    });

    return NextResponse.json({
      ok: true,
      ustn,
      policies: policies || [],
      count: (policies || []).length,
    });
  } catch (e: any) {
    logger.error("[cargo-insurance/policies] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
