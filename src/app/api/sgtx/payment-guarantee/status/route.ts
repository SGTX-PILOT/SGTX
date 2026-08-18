// GET /api/sgtx/payment-guarantee/status?ustn=X — get payment guarantee status for a shipment
//
// Returns:
//   {
//     ok, ustn,
//     guarantees: [...],
//     count: N,
//     latestConfirmedAt: string | null
//   }
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

    const guarantees = await (db as any).paymentGuarantee.findMany({
      where: { ustn },
      orderBy: { createdAt: "desc" },
    });

    const list = guarantees || [];
    const confirmed = list.filter((g: any) => g.confirmed && g.confirmedAt);
    const latestConfirmedAt =
      confirmed.length > 0
        ? confirmed
            .map((g: any) =>
              g.confirmedAt instanceof Date ? g.confirmedAt.toISOString() : g.confirmedAt,
            )
            .sort()
            .reverse()[0]
        : null;

    return NextResponse.json({
      ok: true,
      ustn,
      guarantees: list,
      count: list.length,
      confirmedCount: confirmed.length,
      latestConfirmedAt,
    });
  } catch (e: any) {
    logger.error("[payment-guarantee/status] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
