// @ts-nocheck
// §62 Bank Settlement Gateway — process a gateway instruction through the 6-stage pipeline
// POST /api/sgtx/constitutional/bank-gateway/[id]/process
import { NextResponse } from "next/server";
import { processGateway } from "@/lib/sgtx/bank-settlement-gateway";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: "gatewayId required" },
        { status: 400 },
      );
    }
    const result = await processGateway(id);
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error(
      "[api/constitutional/bank-gateway/[id]/process] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
