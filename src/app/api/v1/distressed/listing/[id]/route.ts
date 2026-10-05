// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
// GET /api/v1/distressed/listing/{id} — Distressed cargo listing (v18 §14.2)
interface CallerPayload { gtid?: string; tenantGtid?: string; role?: string; }
function getCaller(req: NextRequest): CallerPayload | null { const raw = req.headers.get("x-sgtx-payload"); if (!raw) return null; try { return JSON.parse(raw); } catch { return null; } }
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const caller = getCaller(req);
  if (!caller?.gtid) return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: { "X-SGTX-Version": "v18.0" } });
  return NextResponse.json({ listing_id: params.id, caller: caller.gtid, status: "ACTIVE", queried_at: new Date().toISOString() }, { headers: { "X-SGTX-Version": "v18.0" } });
}
