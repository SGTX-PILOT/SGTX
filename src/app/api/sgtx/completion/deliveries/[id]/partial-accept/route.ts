// @ts-nocheck
// §1 Delivery Acceptance — partial accept (DELIVERED → PARTIAL_ACCEPTANCE).
// Body: { acceptedQty, rejectedQty, reason }
// POST /api/sgtx/completion/deliveries/[id]/partial-accept
import { NextResponse } from "next/server";
import { partialAcceptance } from "@/lib/sgtx/delivery-acceptance";
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
    if (!(Number(body.acceptedQty) >= 0)) {
      return NextResponse.json(
        { error: "acceptedQty must be a non-negative number" },
        { status: 400 },
      );
    }
    if (!(Number(body.rejectedQty) >= 0)) {
      return NextResponse.json(
        { error: "rejectedQty must be a non-negative number" },
        { status: 400 },
      );
    }
    if (!body.reason) {
      return NextResponse.json({ error: "reason required" }, { status: 400 });
    }
    const delivery = await partialAcceptance(
      id,
      Number(body.acceptedQty),
      Number(body.rejectedQty),
      body.reason,
    );
    return NextResponse.json({ delivery });
  } catch (err: any) {
    logger.error(
      "[api/completion/deliveries/[id]/partial-accept] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
