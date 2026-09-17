// @ts-nocheck
// SGTX Phase 3 §4 — SPS Engine API
//   GET /api/sgtx/compliance/sps/rules/[id] — fetch a single SpsRequirement by id.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getSpsRequirement } from "@/lib/sgtx/sps";

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
    const rule = await getSpsRequirement(id);
    if (!rule) {
      return NextResponse.json(
        { error: "sps rule not found", id },
        { status: 404 },
      );
    }
    return NextResponse.json({ rule });
  } catch (err: any) {
    logger.error("[api/sgtx/compliance/sps/rules/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
