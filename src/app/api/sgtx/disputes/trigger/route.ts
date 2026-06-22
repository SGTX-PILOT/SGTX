import { NextRequest, NextResponse } from "next/server";
import { triggerAdvisoryDispute } from "@/lib/sgtx/dispute";

// POST /api/sgtx/disputes/trigger — System-triggered ADVISORY dispute (Part 10.1.2 / 10.2.2).
// Body: { ustn, triggerSource, triggerRefId?, severity?, suggestedCategory?,
//         suggestedClaimAmountUsd?, aiSummary? }
// The system NEVER auto-files a dispute — it only emits a Smart Inbox advisory
// item that the affected party must confirm before a dispute is created.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await triggerAdvisoryDispute(body);
    if (!result.ok) return NextResponse.json({ error: result.reason, code: result.code }, { status: 400 });
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("[disputes/trigger]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
