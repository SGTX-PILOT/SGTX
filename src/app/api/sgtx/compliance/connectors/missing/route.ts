// @ts-nocheck
// SGTX Phase 3 §8 — Compliance Connector Registry API
//   GET /api/sgtx/compliance/connectors/missing — THE §8 "show all missing" view.
//   Returns all connectors with status MISSING or DEGRADED (per jurisdiction).
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getMissingConnectors } from "@/lib/sgtx/compliance-connector";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const missing = await getMissingConnectors();
    return NextResponse.json({
      missing,
      count: missing.length,
    });
  } catch (err: any) {
    logger.error("[api/sgtx/compliance/connectors/missing] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
