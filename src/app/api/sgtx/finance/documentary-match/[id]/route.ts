// @ts-nocheck
// §4 Documentary Matching — GET single match by database id
// GET /api/sgtx/finance/documentary-match/[id]
import { NextResponse } from "next/server";
import { getDocumentaryMatch } from "@/lib/sgtx/documentary-matching";
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
    const match = await getDocumentaryMatch(id);
    if (!match) {
      return NextResponse.json(
        { error: "documentary match not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ match });
  } catch (err: any) {
    logger.error("[api/finance/documentary-match/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
