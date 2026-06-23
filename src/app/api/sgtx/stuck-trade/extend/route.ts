import { NextRequest, NextResponse } from "next/server";
import { extendStuckTradeSla, resolveStuckTrade } from "@/lib/sgtx/stuck-trade";

// POST /api/sgtx/stuck-trade/extend — Extend the SLA for a stuck trade.
// Per blueprint 3.15.3.7, parties can mutually extend the SLA before L3
// auto-cancellation triggers. Requires a reason (≥20 chars) for audit.
//
// Body: { ustn, extension_hours, extended_by_gtid, reason }
//   extension_hours: 1-168 (1 hour to 7 days)
//   reason: ≥20 chars (mutual-consent audit trail)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, extension_hours, extended_by_gtid, reason } = body;
    if (!ustn || !extension_hours || !extended_by_gtid || !reason) {
      return NextResponse.json(
        { error: "ustn, extension_hours, extended_by_gtid, and reason are required" },
        { status: 400 },
      );
    }

    const result = await extendStuckTradeSla(ustn, Number(extension_hours), extended_by_gtid, reason);
    return NextResponse.json({
      ok: result.ok,
      ustn: result.ustn,
      new_expected_by: result.newExpectedBy,
      message: `SLA extended. New expected-by: ${result.newExpectedBy}. Stuck-trade alert resolved — will re-detect if the trade remains overdue past the new SLA.`,
    });
  } catch (e: any) {
    console.error("[stuck-trade/extend] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH /api/sgtx/stuck-trade/extend — Resolve a stuck-trade alert (without extending).
// Body: { ustn, resolution: "COMPLETED" | "FALSE_ALARM", notes? }
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, resolution, notes } = body;
    if (!ustn || !resolution) {
      return NextResponse.json({ error: "ustn and resolution required" }, { status: 400 });
    }
    if (!["COMPLETED", "FALSE_ALARM"].includes(resolution)) {
      return NextResponse.json({ error: "resolution must be COMPLETED or FALSE_ALARM" }, { status: 400 });
    }
    const result = await resolveStuckTrade(ustn, resolution, notes);
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("[stuck-trade/extend PATCH] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
