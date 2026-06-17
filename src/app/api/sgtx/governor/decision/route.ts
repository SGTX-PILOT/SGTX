import { NextRequest, NextResponse } from "next/server";
import { governorDecide } from "@/lib/sgtx/governor";

// POST /api/sgtx/governor/decision
// Body: { action, actorGtid, traderMode, resourceUstn, payload }
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.action) return NextResponse.json({ error: "action required" }, { status: 400 });
  const result = await governorDecide(body);
  return NextResponse.json(result);
}
