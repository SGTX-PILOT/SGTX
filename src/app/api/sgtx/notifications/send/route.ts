// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sendNotification } = await import("@/lib/sgtx/notifications");
    const result = await sendNotification(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}
