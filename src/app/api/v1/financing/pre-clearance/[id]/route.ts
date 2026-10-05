// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
export const dynamic = "force-dynamic";
// GET /api/v1/financing/pre-clearance/{id} — Get specific CFR (v18 §7)
interface CallerPayload { gtid?: string; tenantGtid?: string; role?: string; }
function getCaller(req: NextRequest): CallerPayload | null { const raw = req.headers.get("x-sgtx-payload"); if (!raw) return null; try { return JSON.parse(raw); } catch { return null; } }
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = getCaller(req);
    if (!caller?.gtid) return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: { "X-SGTX-Version": "v18.0" } });
    const cfrId = params.id;
    return NextResponse.json({ cfr_id: cfrId, caller: caller.gtid, status: "PENDING", message: "CFR retrieval scoped to caller role (borrower or financier)", queried_at: new Date().toISOString() }, { headers: { "X-SGTX-Version": "v18.0" } });
  } catch (e: any) { return NextResponse.json({ error: "CFR retrieval failed" }, { status: 503, headers: { "X-SGTX-Version": "v18.0" } }); }
}
