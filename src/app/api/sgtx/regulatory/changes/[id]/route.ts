// @ts-nocheck
// §2 Regulatory Changes — GET by DB id (cuid). Falls back to lookup by
// changeId (RCG-…) if the id is not a cuid match.
// GET /api/sgtx/regulatory/changes/[id]
import { NextResponse } from "next/server";
import {
  getRegulatoryChange,
  getChangeByChangeId,
} from "@/lib/sgtx/regulatory-change";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    let change = await getRegulatoryChange(id);
    if (!change) {
      // Fallback: treat as changeId (RCG-YYYYMMDD-NNNNN).
      change = await getChangeByChangeId(id);
    }
    if (!change) {
      return NextResponse.json(
        { error: "change not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ change });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory/changes/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
