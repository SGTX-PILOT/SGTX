// @ts-nocheck
// §1 Delivery Acceptance — GET by database id
// GET /api/sgtx/completion/deliveries/[id]
import { NextResponse } from "next/server";
import { getDeliveryAcceptance } from "@/lib/sgtx/delivery-acceptance";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const delivery = await getDeliveryAcceptance(id);
    if (!delivery) {
      return NextResponse.json(
        { error: "delivery acceptance not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ delivery });
  } catch (err: any) {
    logger.error("[api/completion/deliveries/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
