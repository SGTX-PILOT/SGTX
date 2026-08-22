// @ts-nocheck
// §2 Regulatory Changes — GET all deployed changes (pipelineStatus = DEPLOYED)
// GET /api/sgtx/regulatory/changes/deployed
import { NextResponse } from "next/server";
import { getDeployedChanges } from "@/lib/sgtx/regulatory-change";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(_req: Request) {
  try {
    const changes = await getDeployedChanges();
    return NextResponse.json({ changes, count: changes.length });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory/changes/deployed] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
