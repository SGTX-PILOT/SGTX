// @ts-nocheck
// §10 Alerts — expiring certificates
// GET /api/sgtx/integrations/alerts/expiring-certificates?daysAhead=30
import { NextResponse } from "next/server";
import { getExpiringCertificates } from "@/lib/sgtx/integration-alerts";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const daysAheadRaw = url.searchParams.get("daysAhead");
    const daysAhead = daysAheadRaw ? Number(daysAheadRaw) : 30;
    if (!Number.isFinite(daysAhead) || daysAhead < 0) {
      return NextResponse.json(
        { error: "daysAhead must be a non-negative number" },
        { status: 400 },
      );
    }
    const entries = await getExpiringCertificates(daysAhead);
    return NextResponse.json({ entries, count: entries.length, daysAhead });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/integrations/alerts/expiring-certificates] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
