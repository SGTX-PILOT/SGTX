// @ts-nocheck
// §2b Financier Relationships — GET single relationship by database id
// GET /api/sgtx/finance/financiers/[id]
import { NextResponse } from "next/server";
import { getFinancierRelationship } from "@/lib/sgtx/financier-relationship";
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
    const relationship = await getFinancierRelationship(id);
    if (!relationship) {
      return NextResponse.json(
        { error: "relationship not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ relationship });
  } catch (err: any) {
    logger.error("[api/finance/financiers/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
