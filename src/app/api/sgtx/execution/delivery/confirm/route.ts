// 3B.6.7 — Delivery Confirmation (one-click or voice)
import { NextRequest, NextResponse } from "next/server";
import { confirmDelivery } from "@/lib/sgtx/execution";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { shipmentId, buyerGtid, voiceTranscript, biometricVerified } = body;
    if (!shipmentId || !buyerGtid) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    const result = await confirmDelivery({ shipmentId, buyerGtid, voiceTranscript, biometricVerified });
    if (!result.ok) {
      return NextResponse.json({ error: result.reason, code: result.code }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("[execution/delivery/confirm]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
