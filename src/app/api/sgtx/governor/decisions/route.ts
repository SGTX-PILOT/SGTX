import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/governor/decisions — List recent Governor decisions (Part 1.2 audit trail)
// Query params: ?limit=50 (max 200)  ?action=contract.sign (filter)
//               ?verdict=APPROVED|DENIED|ESCALATED  ?actorGtid=GTID
//               ?ustn=SGTX-... (AUD-4: filter by USTN — needed for the
//               Trade Command Center cross-portal wiring; the TCC fetches
//               governor decisions for the trade in view.)
export async function GET(req: NextRequest) {
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || "50"), 200);
  const action = req.nextUrl.searchParams.get("action");
  const verdict = req.nextUrl.searchParams.get("verdict");
  const actorGtid = req.nextUrl.searchParams.get("actorGtid");
  const ustn = req.nextUrl.searchParams.get("ustn");

  try {
    const decisions = await db.governorDecision.findMany({
      where: {
        ...(action ? { action } : {}),
        ...(verdict ? { verdict } : {}),
        ...(actorGtid ? { actorGtid } : {}),
        ...(ustn ? { resourceUstn: ustn } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    const total = await db.governorDecision.count({
      where: {
        ...(action ? { action } : {}),
        ...(verdict ? { verdict } : {}),
        ...(actorGtid ? { actorGtid } : {}),
        ...(ustn ? { resourceUstn: ustn } : {}),
      },
    });
    return NextResponse.json({ decisions, total });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
