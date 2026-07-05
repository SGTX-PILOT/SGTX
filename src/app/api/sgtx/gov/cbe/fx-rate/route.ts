import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getFxRate } from "@/lib/sgtx/gov";

// GET /api/sgtx/gov/cbe/fx-rate?from=USD&to=EGP
// Returns: { ok, from, to, rate, timestamp, source }

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from = (searchParams.get("from") || "").toUpperCase();
    const to = (searchParams.get("to") || "").toUpperCase();

    if (!from || !to) {
      return NextResponse.json(
        {
          error: "Both 'from' and 'to' query parameters are required (e.g. ?from=USD&to=EGP).",
        },
        { status: 400 }
      );
    }

    const result = await getFxRate(from, to);

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (e: any) {
    logger.error("[gov/cbe/fx-rate] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to fetch CBE FX rate" },
      { status: 500 }
    );
  }
}
