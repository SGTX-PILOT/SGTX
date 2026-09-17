// @ts-nocheck
// SGTX Phase 3 §8 — Compliance Connector Registry API
//   GET /api/sgtx/compliance/connectors/by-jurisdiction?jurisdictionCode=X
//   Returns a per-subsystem map (all 7 Phase 3 subsystems → connector or null)
//   for the given jurisdiction.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getSubsystemsByJurisdiction } from "@/lib/sgtx/compliance-connector";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const jurisdictionCode =
      url.searchParams.get("jurisdictionCode") || undefined;
    // Empty jurisdictionCode is valid — it denotes the "global" / "all" view
    // (connectors whose jurisdictionCode is null or empty string).
    const map = await getSubsystemsByJurisdiction(jurisdictionCode || "");
    return NextResponse.json({
      jurisdictionCode: jurisdictionCode || "GLOBAL",
      subsystems: map,
    });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/compliance/connectors/by-jurisdiction] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
