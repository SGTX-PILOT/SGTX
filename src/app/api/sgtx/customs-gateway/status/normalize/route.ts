// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  try {
    const { externalStatus, system } = await req.json();
    const { normalizeStatus, createStatusRecord } = await import("@/lib/sgtx/customs-gateway/status-normalization");
    const record = createStatusRecord(externalStatus, "", system);
    return NextResponse.json({ ok: true, record });
  } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}
