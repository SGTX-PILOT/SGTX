// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
export const dynamic = "force-dynamic";
// POST /api/v1/quote/{id}/accept — Quote acceptance (v18 §8.2.22)
interface CallerPayload { gtid?: string; tenantGtid?: string; role?: string; }
function getCaller(req: NextRequest): CallerPayload | null { const raw = req.headers.get("x-sgtx-payload"); if (!raw) return null; try { return JSON.parse(raw); } catch { return null; } }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = getCaller(req);
    if (!caller?.gtid) return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: { "X-SGTX-Version": "v18.0" } });
    let body: any = {}; try { body = await req.json(); } catch {}
    return NextResponse.json({ quote_id: params.id, accepted_by: caller.gtid, status: "ACCEPTED", accepted_at: new Date().toISOString(), body }, { headers: { "X-SGTX-Version": "v18.0" } });
  } catch (e: any) { return NextResponse.json({ error: "Quote acceptance failed" }, { status: 503, headers: { "X-SGTX-Version": "v18.0" } }); }
}
