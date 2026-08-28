// @ts-nocheck
/**
 * SGTX Customs Gateway — Customs Hold Management API (§158)
 * ===========================================================================
 * GET   /api/sgtx/customs-gateway/holds
 *   Query: ?ustn=<USTN>&status=<ACTIVE|RELEASED|ESCALATED>&holdType=<T>
 *   Returns: { ok, count, holds, holdTypes }
 *
 * POST  /api/sgtx/customs-gateway/holds
 *   Body:  { ustn, holdType, reason, issuedBy }
 *   Returns: { ok, hold }
 *
 * PATCH /api/sgtx/customs-gateway/holds
 *   Body:  { holdId, action: "release"|"escalate", releaseReference?, reason? }
 *   Returns: { ok, hold }
 *
 * L0: Holds are issued by GOVERNMENT AUTHORITIES. SGTX NEVER issues a
 * CUSTOMS_HOLD or PGA_HOLD on its own behalf — `issuedBy` MUST carry
 * the authority identifier (e.g. "US-CBP", "FDA", "EG-NAFEZA").
 *
 * L0: A release requires a `releaseReference` — authoritative evidence
 * from the issuing authority (§113). SGTX NEVER infers a release
 * without authoritative evidence.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  createHold,
  getActiveHolds,
  getAllHolds,
  releaseHold,
  escalateHold,
  HOLD_TYPES,
  type CustomsHold,
} from "@/lib/sgtx/customs-gateway/hold-management";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ustn = searchParams.get("ustn") || undefined;
    const status = searchParams.get("status") || undefined;
    const holdType = searchParams.get("holdType") || undefined;
    const activeOnly = searchParams.get("active") === "1";

    let holds: CustomsHold[] = [];
    if (activeOnly && ustn) {
      holds = await getActiveHolds(ustn);
    } else {
      holds = await getAllHolds({ ustn, status, holdType });
    }
    return NextResponse.json({
      ok: true,
      count: holds.length,
      holds,
      holdTypes: HOLD_TYPES,
    });
  } catch (err: any) {
    logger.error("[api/holds] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.ustn || !body?.holdType || !body?.issuedBy || !body?.reason) {
      return NextResponse.json(
        { ok: false, error: "ustn, holdType, issuedBy, and reason are required", holdTypes: HOLD_TYPES },
        { status: 400 },
      );
    }
    if (!HOLD_TYPES.includes(body.holdType)) {
      return NextResponse.json(
        { ok: false, error: `Invalid holdType: ${body.holdType}`, holdTypes: HOLD_TYPES },
        { status: 400 },
      );
    }
    const hold = await createHold(
      String(body.ustn),
      String(body.holdType),
      String(body.reason),
      String(body.issuedBy),
    );
    return NextResponse.json({ ok: true, hold }, { status: 201 });
  } catch (err: any) {
    logger.error("[api/holds] POST failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.holdId || !body?.action) {
      return NextResponse.json(
        { ok: false, error: "holdId and action (release|escalate) are required" },
        { status: 400 },
      );
    }
    if (body.action === "release") {
      if (!body.releaseReference) {
        return NextResponse.json(
          { ok: false, error: "releaseReference is required for release (§113 — authoritative evidence required)" },
          { status: 400 },
        );
      }
      const hold = await releaseHold(String(body.holdId), String(body.releaseReference));
      if (!hold) {
        return NextResponse.json(
          { ok: false, error: "hold not found or release failed" },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true, hold });
    }
    if (body.action === "escalate") {
      if (!body.reason) {
        return NextResponse.json(
          { ok: false, error: "reason is required for escalate" },
          { status: 400 },
        );
      }
      const hold = await escalateHold(String(body.holdId), String(body.reason));
      if (!hold) {
        return NextResponse.json(
          { ok: false, error: "hold not found or escalation failed" },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true, hold });
    }
    return NextResponse.json(
      { ok: false, error: `Unknown action: ${body.action}. Valid: release, escalate` },
      { status: 400 },
    );
  } catch (err: any) {
    logger.error("[api/holds] PATCH failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
