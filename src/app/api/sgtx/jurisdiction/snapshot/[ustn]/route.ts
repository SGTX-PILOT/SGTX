// @ts-nocheck
// GET /api/sgtx/jurisdiction/snapshot/[ustn] — fetch the latest regulatory
// snapshot for a trade (by USTN).
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getRegulatorySnapshot } from "@/lib/sgtx/jurisdiction";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ustn: string }> },
) {
  try {
    const { ustn } = await params;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const snapshot = await getRegulatorySnapshot(ustn);
    if (!snapshot) {
      return NextResponse.json(
        { error: "snapshot not found", ustn },
        { status: 404 },
      );
    }
    return NextResponse.json({ snapshot });
  } catch (err: any) {
    logger.error("[api/sgtx/jurisdiction/snapshot/[ustn]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
