// POST /api/sgtx/payment/fealock/freeze — body: { ustn, reason }
// Freezes FeeLock on dispute (Part 6.6.3)
import { NextRequest, NextResponse } from "next/server";
import { freezeFeeLock } from "@/lib/sgtx/payment/fealock";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, reason } = body;
    if (!ustn || !reason) return NextResponse.json({ error: "ustn and reason required" }, { status: 400 });

    const result = await freezeFeeLock(ustn, reason);
    return NextResponse.json({
      ok: true,
      feeLock: result,
      message: "FeeLock frozen. Container release authorisation is now blocked.",
    });
  } catch (e: any) {
    console.error("[payment/fealock/freeze]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
