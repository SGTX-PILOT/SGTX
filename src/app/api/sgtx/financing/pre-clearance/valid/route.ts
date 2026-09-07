// @ts-nocheck
// GET /api/sgtx/financing/pre-clearance/valid?cfr_id=X
// v17 §7 + §15.3 — G3U13 gate (read-only): verify if a CFR is still valid
// at contract-lock time.
//
// Auth: JWT (any authenticated tenant). The middleware injects
// `x-tenant-gtid`; we read it for audit logging only. The validity check
// itself is not tenant-scoped — any party to the trade, the financier, or
// the platform Governor may query validity.
//
// Query: ?cfr_id=X
// Response:
//   {
//     cfr_id,
//     valid: boolean,
//     status: string,
//     expires_at: string | null,
//     days_remaining: number,
//     invalid_reason?: string
//   }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { validateCfrValidity } from "@/lib/sgtx/financing/cfr";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────
    const tenantGtid =
      req.headers.get("x-tenant-gtid") ||
      req.headers.get("x-tenant-gtid".toLowerCase());

    if (!tenantGtid) {
      return NextResponse.json(
        { error: "Authentication required (missing x-tenant-gtid header)." },
        { status: 401 },
      );
    }

    // ── Query param ────────────────────────────────────────────────────────
    const url = new URL(req.url);
    const cfrId =
      url.searchParams.get("cfr_id") ||
      url.searchParams.get("cfrId") ||
      url.searchParams.get("preClearanceId");

    if (!cfrId) {
      return NextResponse.json(
        { error: "cfr_id query parameter is required." },
        { status: 400 },
      );
    }

    // ── G3U13 validity check ───────────────────────────────────────────────
    const result = await validateCfrValidity(cfrId);

    logger.info("cfr.valid.checked", {
      cfrId,
      valid: result.valid,
      status: result.status,
      daysRemaining: result.daysRemaining,
      queriedBy: tenantGtid,
    });

    const payload: Record<string, any> = {
      ok: true,
      cfr_id: cfrId,
      valid: result.valid,
      status: result.status,
      expires_at: result.expiresAt,
      days_remaining: result.daysRemaining,
    };
    if (!result.valid && result.reason) {
      payload.invalid_reason = result.reason;
    }
    return NextResponse.json(payload);
  } catch (e: any) {
    logger.error("[financing/pre-clearance/valid] error:", e);
    return NextResponse.json(
      { error: "CFR validity check failed", detail: e?.message },
      { status: 500 },
    );
  }
}
