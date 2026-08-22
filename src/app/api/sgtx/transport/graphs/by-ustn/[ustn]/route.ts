// @ts-nocheck
// §1 Transport Graph — GET all graphs for a trade by USTN
// GET /api/sgtx/transport/graphs/by-ustn/[ustn]
import { NextResponse } from "next/server";
import { getTransportGraphByUstn } from "@/lib/sgtx/transport-graph";
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
    const graphs = await getTransportGraphByUstn(ustn);
    return NextResponse.json({ graphs });
  } catch (err: any) {
    logger.error("[api/transport/graphs/by-ustn/[ustn]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
