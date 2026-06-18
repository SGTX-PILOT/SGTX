import { NextRequest, NextResponse } from "next/server";
import { fileDispute } from "@/lib/sgtx/dispute";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await fileDispute(body);
    if (!result.ok) return NextResponse.json({ error: result.reason, code: result.code }, { status: 400 });
    return NextResponse.json(result);
  } catch (e: any) { console.error("[disputes/file]", e); return NextResponse.json({ error: e.message }, { status: 500 }); }
}
