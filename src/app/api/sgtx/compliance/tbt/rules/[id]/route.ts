// @ts-nocheck
// SGTX Phase 3 §5 — TBT Engine API
//   GET /api/sgtx/compliance/tbt/rules/[id] — fetch a single TbtRequirement by id.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getTbtRequirement } from "@/lib/sgtx/tbt";

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
    const rule = await getTbtRequirement(id);
    if (!rule) {
      return NextResponse.json(
        { error: "tbt rule not found", id },
        { status: 404 },
      );
    }
    return NextResponse.json({ rule });
  } catch (err: any) {
    logger.error("[api/sgtx/compliance/tbt/rules/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
