// @ts-nocheck
// §90 Dispute Packet — assemble a dispute packet for a USTN
// POST /api/sgtx/constitutional/dispute-packets/assemble  body: { ustn }
import { NextResponse } from "next/server";
import { assembleDisputePacket } from "@/lib/sgtx/dispute-packet";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const ustn = body?.ustn;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const packet = await assembleDisputePacket(ustn);
    if (!packet) {
      return NextResponse.json(
        { error: "assembleDisputePacket failed — see logs" },
        { status: 500 },
      );
    }
    return NextResponse.json({ packet });
  } catch (err: any) {
    logger.error(
      "[api/constitutional/dispute-packets/assemble] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
