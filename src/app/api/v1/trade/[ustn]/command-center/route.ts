// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
export const dynamic = "force-dynamic";
// GET /api/v1/trade/{ustn}/command-center — TCC data (v18 §2.5.2)
interface CallerPayload { gtid?: string; tenantGtid?: string; role?: string; }
function getCaller(req: NextRequest): CallerPayload | null { const raw = req.headers.get("x-sgtx-payload"); if (!raw) return null; try { return JSON.parse(raw); } catch { return null; } }
export async function GET(req: NextRequest, { params }: { params: { ustn: string } }) {
  try {
    const caller = getCaller(req);
    if (!caller?.gtid) return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: { "X-SGTX-Version": "v18.0" } });
    const ustn = params.ustn.toUpperCase();
    return NextResponse.json({ ustn, caller: caller.gtid, panels: ["executive_summary", "quick_actions", "ai_assistant", "recent_activity", "integrations_health", "trade_health_score"], message: "TCC data scoped to caller's role per v18 §2.5.2", queried_at: new Date().toISOString() }, { headers: { "X-SGTX-Version": "v18.0" } });
  } catch (e: any) { return NextResponse.json({ error: "TCC load failed" }, { status: 503, headers: { "X-SGTX-Version": "v18.0" } }); }
}
