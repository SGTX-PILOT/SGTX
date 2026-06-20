// POST /api/sgtx/payment/fealock/release — body: { ustn }
// Releases FeeLock after settlement / dispute resolution (Part 6.6)
import { NextRequest, NextResponse } from "next/server";
import { releaseFeeLock } from "@/lib/sgtx/payment/fealock";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn } = body;
    if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });

    const result = await releaseFeeLock(ustn);
    return NextResponse.json({
      ok: true,
      feeLock: result,
      message: "FeeLock released. Settlement complete.",
    });
  } catch (e: any) {
    console.error("[payment/fealock/release]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
