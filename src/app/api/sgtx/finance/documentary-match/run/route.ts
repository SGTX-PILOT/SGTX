// @ts-nocheck
// §4 Documentary Matching — run match. Body: { ustn, tradeId?, lcNumber? }
// POST /api/sgtx/finance/documentary-match/run
import { NextResponse } from "next/server";
import { runDocumentaryMatch } from "@/lib/sgtx/documentary-matching";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    if (!body.ustn && !body.lcNumber && !Array.isArray(body.documents)) {
      return NextResponse.json(
        {
          error:
            "at least one of ustn, lcNumber, or documents is required to run a match",
        },
        { status: 400 },
      );
    }
    const result = await runDocumentaryMatch(body);
    if (result && result.ok === false) {
      return NextResponse.json(
        { error: result.error || "runDocumentaryMatch failed" },
        { status: 400 },
      );
    }
    return NextResponse.json({ match: result.match, result });
  } catch (err: any) {
    logger.error("[api/finance/documentary-match/run] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
