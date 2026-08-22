// @ts-nocheck
// §4 Documentary Matching — GET match by USTN
// GET /api/sgtx/finance/documentary-match/by-ustn/[ustn]
import { NextResponse } from "next/server";
import { getMatchByUstn } from "@/lib/sgtx/documentary-matching";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ustn: string }> },
) {
  try {
    const { ustn } = await params;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const match = await getMatchByUstn(ustn);
    if (!match) {
      return NextResponse.json(
        { error: "documentary match not found for ustn" },
        { status: 404 },
      );
    }
    return NextResponse.json({ match });
  } catch (err: any) {
    logger.error("[api/finance/documentary-match/by-ustn] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
