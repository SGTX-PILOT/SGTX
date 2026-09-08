// @ts-nocheck
// SGTX v17 §16.8.12 — QC Inspector App · offline sync endpoint
// POST /api/sgtx/mobile/inspector/sync
//   body: { inspectorGtid: string, queuedActions: QueuedAction[] }
//   → 200 { ok, synced, conflicts, stale, remaining, serverTimestamp }

import { NextRequest, NextResponse } from "next/server";
import { syncOfflineInspections } from "@/lib/sgtx/mobile";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
    }
    const inspectorGtid = String(body.inspectorGtid ?? "");
    if (!inspectorGtid) {
      return NextResponse.json(
        { ok: false, error: "inspectorGtid required" },
        { status: 400 },
      );
    }
    const queuedActions = Array.isArray(body.queuedActions) ? body.queuedActions : [];
    const result = await syncOfflineInspections(inspectorGtid, queuedActions);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("mobile.inspector.sync.route.failed", { err: String(err) });
    return NextResponse.json({ ok: false, error: "sync failed" }, { status: 500 });
  }
}
