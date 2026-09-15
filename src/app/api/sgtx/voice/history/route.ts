// @ts-nocheck
// SGTX v17 §16.6 — Voice Command API · history endpoint
// GET /api/sgtx/voice/history?userGtid=<gtid>&limit=<1..200>
//   → 200 { ok, history: VoiceHistoryEntry[] (most recent first) }
//
// Returns the in-memory ring buffer of the user's recent voice commands
// (audit trail). In production this would be a dedicated audit-trail table.

import { NextRequest, NextResponse } from "next/server";
import { getVoiceCommandHistory } from "@/lib/sgtx/voice";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userGtid = searchParams.get("userGtid");
  if (!userGtid) {
    return NextResponse.json(
      { ok: false, error: "userGtid required" },
      { status: 400 },
    );
  }
  const limitParam = Number(searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(200, limitParam)) : 50;
  const result = getVoiceCommandHistory(userGtid, limit);
  return NextResponse.json({ ok: true, ...result });
}
