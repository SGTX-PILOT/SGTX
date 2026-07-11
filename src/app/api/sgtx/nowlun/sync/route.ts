import { NextRequest, NextResponse } from "next/server";
import { syncAllNowlunData } from "@/lib/sgtx/compliance/nowlun-integration";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await syncAllNowlunData();
    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
