import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/governor/decisions — List recent Governor decisions (Part 1.2 audit trail)
// Query params: ?limit=50 (max 200)  ?action=contract.sign (filter)
export async function GET(req: NextRequest) {
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || "50"), 200);
  const action = req.nextUrl.searchParams.get("action");
  const verdict = req.nextUrl.searchParams.get("verdict");
  const actorGtid = req.nextUrl.searchParams.get("actorGtid");

  try {
    const decisions = await db.governorDecision.findMany({
      where: {
        ...(action ? { action } : {}),
        ...(verdict ? { verdict } : {}),
        ...(actorGtid ? { actorGtid } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    const total = await db.governorDecision.count();
    return NextResponse.json({ decisions, total });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
