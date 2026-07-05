import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { checkExpiry } from "@/lib/sgtx/gov";

// GET /api/sgtx/gov/certificates/expiry-check — scan all ACTIVE certs + flip to PENDING_RENEWAL/EXPIRED (Part 7.9.1)
//
// Runs the certificate expiry detection workflow:
//   - For each ACTIVE cert with validUntil < now + 30 days → flip to PENDING_RENEWAL
//   - For each ACTIVE cert with validUntil < now → flip to EXPIRED
//   - Returns the list of PENDING_RENEWAL certs so the caller (admin portal
//     cron) can raise Smart Inbox alerts to the responsible party.
//
// Returns: { ok, renewed, expired, pendingRenewal: [{ certId, subjectCn, validUntil }] }

export async function GET() {
  try {
    const result = await checkExpiry();

    return NextResponse.json({
      ok: true,
      ...result,
      checkedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    logger.error("[gov/certificates/expiry-check GET] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to check certificate expiry" },
      { status: 500 }
    );
  }
}
