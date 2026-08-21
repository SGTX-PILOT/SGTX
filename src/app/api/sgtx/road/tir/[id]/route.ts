// @ts-nocheck
// GET /api/sgtx/road/tir/{id} — fetch a TIR carnet / transit guarantee by id.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "TIR id required" }, { status: 400 });
    }
    const tir = await db.transitGuarantee.findUnique({ where: { id } });
    if (!tir) {
      return NextResponse.json({ error: "TIR not found" }, { status: 404 });
    }
    // Hydrate JSON fields
    const hydrated = {
      ...tir,
      transitOffices: (() => {
        try {
          return JSON.parse(tir.transitOffices || "[]");
        } catch {
          return [];
        }
      })(),
    };
    return NextResponse.json({ tir: hydrated });
  } catch (err: any) {
    logger.error("[api/road/tir/[id]] GET failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
