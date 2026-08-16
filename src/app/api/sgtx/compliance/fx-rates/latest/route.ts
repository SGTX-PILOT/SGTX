// GET /api/sgtx/compliance/fx-rates/latest?from=USD&to=EGP
//
// Returns the latest persisted FX rate for a pair.
import { NextRequest, NextResponse } from "next/server";
import { getLatestFxRate } from "@/lib/sgtx/compliance/fx-rates-sync";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from = (searchParams.get("from") ?? "").toUpperCase();
    const to = (searchParams.get("to") ?? "").toUpperCase();
    if (!from || !to) {
      return NextResponse.json(
        { error: "Required: ?from=USD&to=EGP" },
        { status: 400 },
      );
    }
    const result = await getLatestFxRate(from, to);
    return NextResponse.json({ ok: true, from, to, ...result });
  } catch (e: any) {
    logger.error("fx-rates latest GET failed", { error: e?.message ?? String(e) });
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
