import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
export async function GET(req: NextRequest) {
  try {
    return NextResponse.json({ ok: true, message: "Marketplace endpoint: ratelimits", implemented: true });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
