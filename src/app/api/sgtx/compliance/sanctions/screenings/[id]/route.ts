// @ts-nocheck
// SGTX Phase 3 §7 — Sanctions Engine API
//   GET /api/sgtx/compliance/sanctions/screenings/[id] — fetch a single SanctionsScreening by id.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getSanctionsScreening } from "@/lib/sgtx/sanctions";

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
    const screening = await getSanctionsScreening(id);
    if (!screening) {
      return NextResponse.json(
        { error: "sanctions screening not found", id },
        { status: 404 },
      );
    }
    return NextResponse.json({ screening });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/compliance/sanctions/screenings/[id]] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
