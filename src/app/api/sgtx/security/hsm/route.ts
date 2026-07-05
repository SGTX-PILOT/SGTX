import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getHSMStatus } from "@/lib/sgtx/security";

// GET /api/sgtx/security/hsm — HSM status + key inventory
//
// Blueprint Part 14.3 — HSM (SoftHSM in dev / Thales Luna 7 in prod) holds
// root signing keys. Returns:
//   - 10 HSM-managed keys across 5 slots
//   - Custody quorum for each (2-5 approvers required)
//   - Rotation due dates
//   - Last audit timestamp
//   - Operational status (OPERATIONAL / DEGRADED)
export async function GET() {
  try {
    const hsmStatus = getHSMStatus();
    return NextResponse.json({
      ok: true,
      mode: "SIMULATION",
      ...hsmStatus,
      checkedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    logger.error("[security/hsm GET] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to fetch HSM status" },
      { status: 500 },
    );
  }
}
