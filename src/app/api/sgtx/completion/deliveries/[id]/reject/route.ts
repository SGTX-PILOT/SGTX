// @ts-nocheck
// §1 Delivery Acceptance — reject (DELIVERED → REJECTED). Body: { reason }
// POST /api/sgtx/completion/deliveries/[id]/reject
import { NextResponse } from "next/server";
import { rejectDelivery } from "@/lib/sgtx/delivery-acceptance";
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
    if (!body.reason) {
      return NextResponse.json({ error: "reason required" }, { status: 400 });
    }
    const delivery = await rejectDelivery(id, body.reason);
    return NextResponse.json({ delivery });
  } catch (err: any) {
    logger.error("[api/completion/deliveries/[id]/reject] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
