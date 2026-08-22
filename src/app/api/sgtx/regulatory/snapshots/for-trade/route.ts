// @ts-nocheck
// §5 Snapshot Versions — GET snapshot for a trade (CRITICAL — locked trades retain original)
// GET /api/sgtx/regulatory/snapshots/for-trade?ustn=X
//
// §5 critical: existing locked trades retain their original snapshot; future
// trades use the new ACTIVE version. The lib resolves the lock via the
// RSV-LOCK marker on Trade.globalNotes, or falls back to the version active
// at TradeContract.signedAt time, or the current ACTIVE version for
// originCountry/destCountry.
import { NextResponse } from "next/server";
import { getSnapshotForTrade } from "@/lib/sgtx/snapshot-versioning";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn");
    if (!ustn) {
      return NextResponse.json(
        { error: "ustn required" },
        { status: 400 },
      );
    }
    const version = await getSnapshotForTrade(ustn);
    if (!version) {
      return NextResponse.json(
        { error: "no applicable snapshot version for this trade" },
        { status: 404 },
      );
    }
    return NextResponse.json({ version, ustn });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory/snapshots/for-trade] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
