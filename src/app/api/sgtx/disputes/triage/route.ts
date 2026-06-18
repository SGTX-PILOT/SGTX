import { NextRequest, NextResponse } from "next/server";
import { runDisputeTriage } from "@/lib/sgtx/dispute";

export async function POST(req: NextRequest) {
  try {
    const { disputeId } = await req.json();
    const result = await runDisputeTriage(disputeId);
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
    return NextResponse.json(result);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
