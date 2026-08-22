// @ts-nocheck
// §4 Post-Clearance — mark paid (PENDING_PAYMENT → PAID). Body: { paymentReference }
// POST /api/sgtx/completion/post-clearance/[id]/mark-paid
import { NextResponse } from "next/server";
import { markPaid } from "@/lib/sgtx/post-clearance";
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
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    if (!body.paymentReference) {
      return NextResponse.json(
        { error: "paymentReference required" },
        { status: 400 },
      );
    }
    const action = await markPaid(id, body.paymentReference);
    return NextResponse.json({ action });
  } catch (err: any) {
    logger.error("[api/completion/post-clearance/[id]/mark-paid] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
