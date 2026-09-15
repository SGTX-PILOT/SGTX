// @ts-nocheck
// SGTX v17 §16.8.12 — LSP Driver App · offline sync endpoint
// POST /api/sgtx/mobile/driver/sync
//   body: { driverGtid: string, queuedActions: QueuedAction[] }
//   → 200 { ok, synced, conflicts, stale, remaining, serverTimestamp }
//
// Applies the OFFLINE_SYNC_SPEC (server-wins conflict resolution, queue
// max 500, max offline 7 days, exponential backoff retry policy).
// Conflicts include { action, reason, serverState } for each rejected action.

import { NextRequest, NextResponse } from "next/server";
import { syncOfflineQueue } from "@/lib/sgtx/mobile";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
    }
    const driverGtid = String(body.driverGtid ?? "");
    if (!driverGtid) {
      return NextResponse.json({ ok: false, error: "driverGtid required" }, { status: 400 });
    }
    const queuedActions = Array.isArray(body.queuedActions) ? body.queuedActions : [];
    const result = await syncOfflineQueue(driverGtid, queuedActions);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("mobile.driver.sync.route.failed", { err: String(err) });
    return NextResponse.json({ ok: false, error: "sync failed" }, { status: 500 });
  }
}
