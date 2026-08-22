// @ts-nocheck
// §2 Trade Finance — trigger margin call. Body: { reason }
// POST /api/sgtx/finance/cases/[id]/margin-call
import { NextResponse } from "next/server";
import { triggerMarginCall } from "@/lib/sgtx/trade-finance";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const body = await req.json();
    if (!body?.reason) {
      return NextResponse.json({ error: "reason required" }, { status: 400 });
    }
    const financingCase = await triggerMarginCall(id, body.reason);
    return NextResponse.json({ case: financingCase });
  } catch (err: any) {
    logger.error("[api/finance/cases/[id]/margin-call] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
