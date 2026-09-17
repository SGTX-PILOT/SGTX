// @ts-nocheck
// SGTX Phase 4 §1 — Customs Operations API
//   GET /api/sgtx/government/customs-operations/by-ustn/[ustn]
//   Calls getOperationByUstn(ustn) — returns all customs operations for a
//   given USTN (a trade may have multiple — one per agency / step).
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getOperationByUstn } from "@/lib/sgtx/customs-engine";

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
    const operations = await getOperationByUstn(ustn);
    // 404 if no operations exist for this USTN — distinguishable from a DB
    // failure (which returns [] but the engine logs the error).
    if (!operations || operations.length === 0) {
      return NextResponse.json(
        { error: "no customs operations found for ustn", ustn },
        { status: 404 },
      );
    }
    return NextResponse.json({ operations, count: operations.length, ustn });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/government/customs-operations/by-ustn/[ustn]] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
