// @ts-nocheck
// SGTX v13.1 Art 129 — Stage 4: Per-trade Regulatory Snapshot (by USTN)
// GET /api/sgtx/regulatory-snapshot/[ustn] — fetch the snapshot for a USTN
import { NextRequest, NextResponse } from "next/server";
import { getSnapshot } from "@/lib/sgtx/regulatory-snapshot";
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
    const snapshot = await getSnapshot(ustn);
    if (!snapshot) {
      return NextResponse.json(
        { error: "snapshot not found", ustn },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, snapshot });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory-snapshot/[ustn]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
