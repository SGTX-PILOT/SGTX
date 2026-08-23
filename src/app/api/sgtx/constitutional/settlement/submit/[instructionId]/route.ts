// @ts-nocheck
// §62 Settlement Orchestration — submit instruction through Bank Settlement Gateway
// POST /api/sgtx/constitutional/settlement/submit/[instructionId]
import { NextResponse } from "next/server";
import { submitToBankSettlementGateway } from "@/lib/sgtx/settlement-orchestration";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ instructionId: string }> },
) {
  try {
    const { instructionId } = await params;
    if (!instructionId) {
      return NextResponse.json(
        { error: "instructionId required" },
        { status: 400 },
      );
    }
    const result = await submitToBankSettlementGateway(instructionId);
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error(
      "[api/constitutional/settlement/submit/[instructionId]] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
