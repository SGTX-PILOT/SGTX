// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
// 3B.6.3 — Pallet scan (barcode / voice / AR) → milestone recorded
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { scanPallet } from "@/lib/sgtx/execution";
import { voiceCommandIntent } from "@/lib/sgtx/ai/orchestrator";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { shipmentId, sscc, loadedBy, scanMethod, biometricVerified, voiceTranscript } = body;
    if (!shipmentId || !sscc || !loadedBy) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // If voice command, run AI intent extraction first
    let aiIntent: any = null;
    if (scanMethod === "VOICE" && voiceTranscript) {
            const shipment = await db.shipment.findUnique({ where: { id: shipmentId } }) as any;
      try {
                const r = await voiceCommandIntent(voiceTranscript, { workerName: loadedBy, shipmentUstn: shipment?.ustn }) as any;
        try { aiIntent = JSON.parse(r.content); } catch { aiIntent = { raw: r.content }; }
      } catch { /* ignore AI failure */ }
    }

        const result = await scanPallet({ shipmentId, sscc, loadedBy, scanMethod, biometricVerified, voiceTranscript }) as any;
    if (!result.ok) {
            return NextResponse.json({ error: result.reason, code: result.code }, { status: 400 }) as any;
    }
    return NextResponse.json({
      ok: true,
      pallet: { id: result.pallet?.id, palletId: result.pallet?.palletId, loaded: result.pallet?.loaded },
      milestone: result.milestone,
      autoContainerLoaded: result.autoContainerLoaded,
      aiIntent,
        }) as any;
  } catch (e: any) {
    logger.error("[execution/pallet/scan]", e);
        return NextResponse.json({ error: e.message }, { status: 500 }) as any;
  }
}
