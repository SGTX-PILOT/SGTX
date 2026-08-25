// @ts-nocheck
// SGTX v13.1 Art 129 — Stage 1: Negotiation
// GET /api/sgtx/negotiation/active/[ustn] — fetch the latest PENDING negotiation
import { NextRequest, NextResponse } from "next/server";
import { getActiveNegotiation } from "@/lib/sgtx/negotiation";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ustn: string }> },
) {
  try {
    const { ustn } = await params;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const negotiation = await getActiveNegotiation(ustn);
    if (!negotiation) {
      return NextResponse.json(
        { ok: true, ustn, negotiation: null, hasActive: false },
        { status: 200 },
      );
    }
    return NextResponse.json({
      ok: true,
      ustn,
      negotiation,
      hasActive: true,
    });
  } catch (err: any) {
    logger.error("[api/sgtx/negotiation/active/[ustn]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
