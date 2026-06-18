import { NextRequest, NextResponse } from "next/server";
import { generateSettlementProposal, acceptSettlementProposal } from "@/lib/sgtx/dispute";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === "accept") {
      const result = await acceptSettlementProposal(body);
      if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
      return NextResponse.json(result);
    }
    const result = await generateSettlementProposal(body.disputeId);
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
    return NextResponse.json(result);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
