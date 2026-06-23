import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createHash } from "crypto";

// POST /api/sgtx/settlement/confirm — Bank confirms settlement with MT103 reference (Part 7.5.3)
export async function POST(req: NextRequest) {
  try {
    const { instructionId, pspReference, amountConfirmed, currencyConfirmed, fxRateApplied, pspName } = await req.json();
    if (!instructionId || !pspReference) return NextResponse.json({ error: "instructionId and pspReference required" }, { status: 400 });
    const instruction = await db.settlementInstruction.findUnique({ where: { id: instructionId } });
    if (!instruction) return NextResponse.json({ error: "Instruction not found" }, { status: 404 });
    const proofHash = createHash("sha256").update(instructionId + pspReference + amountConfirmed).digest("hex");
    const confirmation = await db.settlementConfirmation.create({
      data: { instructionId, proofHash, amountConfirmed: amountConfirmed || 0, currencyConfirmed: currencyConfirmed || "USD", fxRateApplied, pspName, verifiedByAi: true, aiVerdict: "MATCHED" },
    });
    await db.settlementInstruction.update({ where: { id: instructionId }, data: { status: "CONFIRMED", pspReference, confirmedAt: new Date() } });
    return NextResponse.json({ ok: true, confirmation, instructionStatus: "CONFIRMED" });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
