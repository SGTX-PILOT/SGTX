// @ts-nocheck
// SGTX Phase 2 §7 ADMIN — Origin Rules API
//   GET /api/sgtx/regulatory/origin/rules/[id] — fetch a single rule.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getOriginRule } from "@/lib/sgtx/origin";

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
    const rule = await getOriginRule(id);
    if (!rule) {
      return NextResponse.json(
        { error: "origin rule not found", id },
        { status: 404 },
      );
    }
    return NextResponse.json({ rule });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory/origin/rules/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
