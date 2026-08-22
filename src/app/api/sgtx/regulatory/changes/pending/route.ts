// @ts-nocheck
// §2 Regulatory Changes — GET all pending changes (pipelineStatus < DEPLOYED, not REJECTED/ROLLED_BACK)
// GET /api/sgtx/regulatory/changes/pending
import { NextResponse } from "next/server";
import { getPendingChanges } from "@/lib/sgtx/regulatory-change";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(_req: Request) {
  try {
    const changes = await getPendingChanges();
    return NextResponse.json({ changes, count: changes.length });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory/changes/pending] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
