// @ts-nocheck
// §5 Snapshot Versions — POST lock trade to version (writes [RSV-LOCK:RSV-…] marker)
// POST /api/sgtx/regulatory/snapshots/lock-trade  body: { ustn, versionId }
//
// §5 critical: a locked trade retains its original snapshot even after a new
// version becomes ACTIVE. This endpoint records the lock by stamping the
// RSV-LOCK marker on Trade.globalNotes (future-proofed: if a
// regulatorySnapshotVersionId column is added later, the lib uses that).
import { NextResponse } from "next/server";
import { lockTradeToVersion } from "@/lib/sgtx/snapshot-versioning";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    if (!body.ustn || typeof body.ustn !== "string") {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    if (!body.versionId || typeof body.versionId !== "string") {
      return NextResponse.json(
        { error: "versionId required" },
        { status: 400 },
      );
    }
    const trade = await lockTradeToVersion(body.ustn, body.versionId);
    if (!trade) {
      return NextResponse.json(
        { error: "trade or snapshot version not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ trade, ustn: body.ustn, versionId: body.versionId });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory/snapshots/lock-trade] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
