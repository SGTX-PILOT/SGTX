// @ts-nocheck
// GET /api/sgtx/jurisdiction/sources/[id] — fetch a single RegulatorySource by id.
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
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const source = await db.regulatorySource.findUnique({
      where: { id },
      include: { jurisdiction: { select: { code: true, name: true } } },
    });
    if (!source) {
      return NextResponse.json({ error: "source not found", id }, { status: 404 });
    }
    return NextResponse.json({ source });
  } catch (err: any) {
    logger.error("[api/sgtx/jurisdiction/sources/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
