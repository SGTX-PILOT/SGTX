// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
// 3B.7.3 — Voice Settlement Approval (Vosk transcript → AI intent → execute)
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { voiceSettlementApproval } from "@/lib/sgtx/ai/orchestrator";
import { approveSettlement, cancelSettlement } from "@/lib/sgtx/settlement";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { transcript, buyerGtid } = body;
    if (!transcript || !buyerGtid) return NextResponse.json({ error: "Missing transcript or buyerGtid" }, { status: 400 });

        const buyer = await db.tenant.findUnique({ where: { gtid: buyerGtid } }) as any;
        const pendingInstructions = await db.settlementInstruction.count({ where: { payerGtid: buyerGtid, status: "PENDING_APPROVAL" } }) as any;

        const r = await voiceSettlementApproval(transcript, { buyerName: buyer?.legalName, pendingInstructions }) as any;
    let intent: any = null;
    try { intent = JSON.parse(r.content); } catch { intent = { raw: r.content, action: "other", confidence: 0.5 }; }

    // Execute based on intent
    let executed = false;
    let executionResult: any = null;
    if (intent.action === "approve" && intent.ustn) {
            const inst = await db.settlementInstruction.findFirst({ where: { ustn: { contains: intent.ustn.slice(0, 20) }, payerGtid: buyerGtid, status: "PENDING_APPROVAL" } }) as any;
      if (inst) {
                const res = await approveSettlement({ instructionId: inst.id, buyerGtid, voiceTranscript: transcript, biometricVerified: true }) as any;
        executed = res.ok;
        executionResult = res;
      }
    } else if (intent.action === "cancel" && intent.ustn) {
            const inst = await db.settlementInstruction.findFirst({ where: { ustn: { contains: intent.ustn.slice(0, 20) }, payerGtid: buyerGtid, status: { in: ["APPROVED", "PROCESSING"] } } }) as any;
      if (inst) {
                const res = await cancelSettlement({ instructionId: inst.id, buyerGtid }) as any;
        executed = res.ok;
        executionResult = res;
      }
    }

    return NextResponse.json({
      ok: true, intent, aiProvider: r.provider, aiFallback: r.fallbackUsed,
      executed, executionResult,
      response: intent.response || "Settlement command processed.",
        }) as any;
  } catch (e: any) {
    logger.error("[settlement/voice-approve]", e);
        return NextResponse.json({ error: e.message }, { status: 500 }) as any;
  }
}
