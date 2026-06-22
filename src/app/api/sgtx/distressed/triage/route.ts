// 3B.8.5 — Triage Path Selection
import { NextRequest, NextResponse } from "next/server";
import { selectTriagePath } from "@/lib/sgtx/distressed";

export async function POST(req: NextRequest) {
  try {
    const { listingId, path } = await req.json();
    if (!listingId || !path) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    const result = await selectTriagePath(listingId, path);
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
    return NextResponse.json(result);
  } catch (e: any) { console.error("[distressed/triage]", e); return NextResponse.json({ error: e.message }, { status: 500 }); }
}
