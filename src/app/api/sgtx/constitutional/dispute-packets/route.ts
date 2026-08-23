// @ts-nocheck
// §90 Dispute Packet — list dispute packets for a USTN
// GET /api/sgtx/constitutional/dispute-packets?ustn=X
import { NextResponse } from "next/server";
import { getDisputePacketsByUstn } from "@/lib/sgtx/dispute-packet";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn") || undefined;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const packets = await getDisputePacketsByUstn(ustn);
    return NextResponse.json({ packets, count: packets.length });
  } catch (err: any) {
    logger.error("[api/constitutional/dispute-packets] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
