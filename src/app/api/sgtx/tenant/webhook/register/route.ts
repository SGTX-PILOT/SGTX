import { NextRequest, NextResponse } from "next/server";
export async function POST(req: NextRequest) {
  try {
    const { tenantGtid, url, events, secret } = await req.json();
    if (!tenantGtid || !url) return NextResponse.json({ error: "tenantGtid and url required" }, { status: 400 });
    return NextResponse.json({ ok: true, webhookId: `wh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, message: "Webhook registered (demo — persistence not yet implemented)" });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
