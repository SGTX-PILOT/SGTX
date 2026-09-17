// @ts-nocheck
// SGTX Phase 3 §8 — Compliance Connector Registry API
//   GET /api/sgtx/compliance/connectors/health — aggregate health summary
//   (counts per status + average coveragePct).
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getConnectorHealth } from "@/lib/sgtx/compliance-connector";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const health = await getConnectorHealth();
    return NextResponse.json({ health });
  } catch (err: any) {
    logger.error("[api/sgtx/compliance/connectors/health] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
