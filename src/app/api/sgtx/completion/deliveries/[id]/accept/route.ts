// @ts-nocheck
// §1 Delivery Acceptance — accept (DELIVERED → ACCEPTED). Body: AcceptanceInput
// POST /api/sgtx/completion/deliveries/[id]/accept
import { NextResponse } from "next/server";
import { acceptDelivery } from "@/lib/sgtx/delivery-acceptance";
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
    if (!body.receiverGtid) {
      return NextResponse.json(
        { error: "receiverGtid required" },
        { status: 400 },
      );
    }
    if (!(Number(body.quantityAccepted) > 0)) {
      return NextResponse.json(
        { error: "quantityAccepted must be positive" },
        { status: 400 },
      );
    }
    if (!body.podReference) {
      return NextResponse.json(
        { error: "podReference required" },
        { status: 400 },
      );
    }
    if (!body.acceptanceTimestamp) {
      return NextResponse.json(
        { error: "acceptanceTimestamp required" },
        { status: 400 },
      );
    }
    const delivery = await acceptDelivery(id, body);
    return NextResponse.json({ delivery });
  } catch (err: any) {
    logger.error("[api/completion/deliveries/[id]/accept] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
