// @ts-nocheck
// SGTX Phase 2 §7 ADMIN — Classification Rules API
//   GET /api/sgtx/regulatory/classification/rules/[id] — fetch a single rule.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
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
    const rule = await db.classificationRule.findUnique({
      where: { id },
      include: {
        jurisdiction: { select: { code: true, name: true } },
        source: { select: { id: true, title: true } },
      },
    });
    if (!rule) {
      return NextResponse.json(
        { error: "classification rule not found", id },
        { status: 404 },
      );
    }
    return NextResponse.json({ rule });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory/classification/rules/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
