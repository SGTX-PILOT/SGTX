// @ts-nocheck
// §5 Snapshot Versions — POST lock trade to version (writes [RSV-LOCK:RSV-…] marker)
// POST /api/sgtx/regulatory/snapshots/lock-trade  body: { ustn, versionId }
//
// §5 critical: a locked trade retains its original snapshot even after a new
// version becomes ACTIVE. This endpoint records the lock by stamping the
// RSV-LOCK marker on Trade.globalNotes (future-proofed: if a
// regulatorySnapshotVersionId column is added later, the lib uses that).
//
// Art 129 (LIFECYCLE-GAP) — also captures the per-trade RegulatorySnapshot
// (Stage 4) by calling `captureSnapshot(ustn)`. This persists the immutable
// per-trade regulatory capture (tariff/sanctions/FTA/licenses) at lock
// time. The capture is idempotent — calling it again returns the existing
// snapshot. A failed capture is NON-BLOCKING (logged + returns 200 with the
// original `trade` payload) — the version-lock succeeds regardless.
import { NextResponse } from "next/server";
import { lockTradeToVersion } from "@/lib/sgtx/snapshot-versioning";
import { captureSnapshot } from "@/lib/sgtx/regulatory-snapshot";
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
    // Art 129 Stage 4 — capture the per-trade regulatory snapshot at lock
    // time. Non-blocking — a failure is logged but does not prevent the
    // version-lock from succeeding.
    let regulatorySnapshot: any = null;
    try {
      regulatorySnapshot = await captureSnapshot(body.ustn);
    } catch (snapErr: any) {
      logger.error(
        "[api/sgtx/regulatory/snapshots/lock-trade] captureSnapshot failed (non-blocking)",
        { ustn: body.ustn, error: snapErr?.message },
      );
    }
    return NextResponse.json({
      trade,
      ustn: body.ustn,
      versionId: body.versionId,
      regulatorySnapshotId: regulatorySnapshot?.id || null,
      regulatorySnapshotHash: regulatorySnapshot?.snapshotHash || null,
    });
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
