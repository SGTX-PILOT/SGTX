// @ts-nocheck
// SGTX v13.1 Art 129 — Stage 4: Per-trade Regulatory Snapshot verify
// GET /api/sgtx/regulatory-snapshot/[ustn]/verify — recompute the SHA-256
// hash from the persisted snapshot fields and compare to the stored hash.
// Returns { verified: true } if they match, { verified: false } otherwise.
import { NextRequest, NextResponse } from "next/server";
import { verifySnapshot } from "@/lib/sgtx/regulatory-snapshot";
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
    const result = await verifySnapshot(ustn);
    return NextResponse.json(result);
  } catch (err: any) {
    logger.error(
      "[api/sgtx/regulatory-snapshot/[ustn]/verify] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
