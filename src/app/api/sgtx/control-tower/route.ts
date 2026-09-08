// @ts-nocheck
// GET /api/sgtx/control-tower — Unified Control Tower
// v17 §20.121-20.126 — aggregates all six control towers in one call so a
// dashboard client can render the whole estate with a single round-trip.
// Read-only. Public for observability (demo portal + admin shells have no
// session cookie).
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { buildUnifiedControlTower } from "@/lib/sgtx/control-towers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await buildUnifiedControlTower(db);
    return NextResponse.json(result);
  } catch (e: any) {
    logger.error("[control-tower GET] failed", { error: e?.message });
    return NextResponse.json(
      { ok: false, error: e?.message || "internal error" },
      { status: 500 },
    );
  }
}
