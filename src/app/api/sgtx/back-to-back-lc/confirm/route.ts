// POST /api/sgtx/back-to-back-lc/confirm — confirm a back-to-back LC
//
// Body:
//   { lcId: string }
//
// Status transitions:
//   PENDING  → CONFIRMED
//   ISSUED   → CONFIRMED
//   CONFIRMED → (idempotent no-op)
//   DRAWN / SETTLED / CANCELLED → 409 Conflict (cannot re-confirm)
//
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

const TERMINAL_STATUSES = new Set(["DRAWN", "SETTLED", "CANCELLED"]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { lcId } = body || {};

    if (!lcId) {
      return NextResponse.json({ error: "Missing required field: lcId" }, { status: 400 });
    }

    const existing = await (db as any).backToBackLc.findUnique({
      where: { id: lcId },
    });
    if (!existing) {
      return NextResponse.json({ error: "back-to-back LC not found" }, { status: 404 });
    }

    if (existing.status === "CONFIRMED") {
      return NextResponse.json({
        ok: true,
        lcId: existing.id,
        status: existing.status,
        idempotent: true,
      });
    }

    if (TERMINAL_STATUSES.has(existing.status)) {
      return NextResponse.json(
        {
          error: `cannot confirm LC in terminal status '${existing.status}'`,
          lcId,
          currentStatus: existing.status,
        },
        { status: 409 },
      );
    }

    const updated = await (db as any).backToBackLc.update({
      where: { id: lcId },
      data: { status: "CONFIRMED" },
    });

    logger.info("[back-to-back-lc/confirm] confirmed", { lcId, prevStatus: existing.status });

    return NextResponse.json({ ok: true, lcId: updated.id, status: updated.status });
  } catch (e: any) {
    logger.error("[back-to-back-lc/confirm] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
