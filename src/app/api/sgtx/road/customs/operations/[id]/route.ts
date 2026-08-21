// @ts-nocheck
// GET /api/sgtx/road/customs/operations/{id} — fetch a single customs operation.
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
      return NextResponse.json({ error: "operation id required" }, { status: 400 });
    }
    const operation = await db.customsOperation.findUnique({
      where: { id },
    });
    if (!operation) {
      return NextResponse.json({ error: "customs operation not found" }, { status: 404 });
    }
    return NextResponse.json({ operation });
  } catch (err: any) {
    logger.error("[api/road/customs/operations/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
