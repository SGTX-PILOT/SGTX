// GET /api/sgtx/force-majeure/claims?ustn=X — list force-majeure claims for a shipment
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

    const claims = await (db as any).forceMajeureClaim.findMany({
      where: { ustn },
      orderBy: { createdAt: "desc" },
      include: { event: true } as any,
    });

    return NextResponse.json({
      ok: true,
      ustn,
      claims: claims || [],
      count: (claims || []).length,
    });
  } catch (e: any) {
    logger.error("[force-majeure/claims] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
