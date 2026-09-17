// @ts-nocheck
// SGTX Phase 2 §6 OUTPUT — fetch a persisted RegulatoryProductResult by USTN
//   GET /api/sgtx/regulatory/result/[ustn]
//   Returns: the most recent RegulatoryProductResult envelope for the USTN,
//   or 404 if no persisted row exists.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getResult } from "@/lib/sgtx/regulatory-product";

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
    const result = await getResult(ustn);
    if (!result) {
      return NextResponse.json(
        { error: "no regulatory product result found for ustn", ustn },
        { status: 404 },
      );
    }
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory/result/[ustn]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
