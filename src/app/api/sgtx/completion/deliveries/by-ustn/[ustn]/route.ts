// @ts-nocheck
// §1 Delivery Acceptance — by USTN
// GET /api/sgtx/completion/deliveries/by-ustn/[ustn]
import { NextResponse } from "next/server";
import { getDeliveryByUstn } from "@/lib/sgtx/delivery-acceptance";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ustn: string }> },
) {
  try {
    const { ustn } = await params;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const delivery = await getDeliveryByUstn(ustn);
    if (!delivery) {
      return NextResponse.json(
        { error: "delivery acceptance not found for ustn" },
        { status: 404 },
      );
    }
    return NextResponse.json({ delivery });
  } catch (err: any) {
    logger.error("[api/completion/deliveries/by-ustn] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
