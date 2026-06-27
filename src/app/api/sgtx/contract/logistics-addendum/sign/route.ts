import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    return NextResponse.json({ ok: true, message: "Contract endpoint", received: Object.keys(body) });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
