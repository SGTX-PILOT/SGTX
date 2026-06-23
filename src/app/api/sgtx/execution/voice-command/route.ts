// 3B.6.3 — Voice command processing (Vosk transcript → AI intent → action)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { voiceCommandIntent } from "@/lib/sgtx/ai/orchestrator";
import { scanPallet } from "@/lib/sgtx/execution";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { transcript, workerGtid, shipmentId } = body;
    if (!transcript || !workerGtid) return NextResponse.json({ error: "Missing transcript or workerGtid" }, { status: 400 });

    const shipment = shipmentId ? await db.shipment.findUnique({ where: { id: shipmentId } }) : null;
    const r = await voiceCommandIntent(transcript, { workerName: workerGtid, shipmentUstn: shipment?.ustn });
    let intent: any = null;
    try { intent = JSON.parse(r.content); } catch { intent = { raw: r.content, action: "other", confidence: 0.5 }; }

    // If action is pallet_loaded and we have a pallet_id and shipmentId, execute
    let executed = false;
    let executionResult: any = null;
    if (intent.action === "pallet_loaded" && intent.pallet_id && shipmentId) {
      const pallet = await db.pallet.findFirst({ where: { palletId: intent.pallet_id, shipmentId } });
      if (pallet) {
        const res = await scanPallet({
          shipmentId, sscc: pallet.sscc, loadedBy: workerGtid,
          scanMethod: "VOICE", biometricVerified: true, voiceTranscript: transcript,
        });
        executed = res.ok;
        executionResult = res;
      }
    }

    return NextResponse.json({
      ok: true,
      intent,
      aiProvider: r.provider,
      aiFallback: r.fallbackUsed,
      executed,
      executionResult,
      response: intent.response || "Command processed.",
    });
  } catch (e: any) {
    console.error("[execution/voice-command]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
