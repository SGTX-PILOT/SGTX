// 8.7 Step 6 — Gate-Out Event (terminal confirms container exited)
import { NextRequest, NextResponse } from "next/server";
import { recordGateOut } from "@/lib/sgtx/release";

export async function POST(req: NextRequest) {
  try {
    const { ustn, containerNo, authorisationId, gateOperatorId } = await req.json();
    if (!ustn || !containerNo || !authorisationId || !gateOperatorId) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    const result = await recordGateOut({ ustn, containerNo, authorisationId, gateOperatorId });
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
    return NextResponse.json({ ok: true, message: "Gate-out recorded. Shipment milestone updated to GATED_OUT." });
  } catch (e: any) { console.error("[release/gate-out]", e); return NextResponse.json({ error: e.message }, { status: 500 }); }
}
