import { NextRequest, NextResponse } from "next/server";
import { postMediationMessage } from "@/lib/sgtx/dispute";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await postMediationMessage(body);
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
    return NextResponse.json(result);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
