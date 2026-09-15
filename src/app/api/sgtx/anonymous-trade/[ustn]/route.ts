// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { getAnonymousTrade } from "@/lib/sgtx/anonymous-trade";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/sgtx/anonymous-trade/[ustn] — fetch an anonymous trade (or its declassified form, if approved).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ustn: string }> },
) {
  const { ustn } = await params;
  if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });
  try {
    const result = await getAnonymousTrade(ustn);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    if (e.message.includes("not found")) {
      return NextResponse.json({ error: e.message }, { status: 404 });
    }
    logger.error("[api/anonymous-trade/[ustn]] GET failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "fetch failed" }, { status: 500 });
  }
}
