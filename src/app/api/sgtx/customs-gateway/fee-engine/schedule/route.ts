// @ts-nocheck
/**
 * SGTX Customs Gateway — Fee Schedule API
 * ===========================================================================
 * GET  /api/sgtx/customs-gateway/fee-engine/schedule
 *   Query: ?brokerGtid=<GTID>&jurisdiction=<CC>
 *   Returns: { ok, count, schedules[] }
 *
 * POST /api/sgtx/customs-gateway/fee-engine/schedule
 *   Body:  { brokerGtid, serviceId, serviceName, jurisdiction, serviceType,
 *            feeAmount, currency, taxAmount, taxType,
 *            governmentPassThrough, thirdPartyPassThrough,
 *            effectiveFrom, effectiveTo, terms, status }
 *   Returns: { ok, schedule }
 *
 * L0 §13: schedules are versioned — updateFeeSchedule creates a new version
 * (version+1) and marks the prior as SUPERSEDED. Substantive fields are
 * NEVER overwritten.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  createFeeSchedule,
  getFeeSchedule,
  updateFeeSchedule,
} from "@/lib/sgtx/customs-gateway/fee-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const brokerGtid = searchParams.get("brokerGtid") || "";
    const jurisdiction = searchParams.get("jurisdiction") || undefined;
    if (!brokerGtid) {
      return NextResponse.json(
        { ok: false, error: "brokerGtid is required" },
        { status: 400 },
      );
    }
    const schedules = await getFeeSchedule(brokerGtid, jurisdiction);
    return NextResponse.json({ ok: true, count: schedules.length, schedules });
  } catch (err: any) {
    logger.error("[api/fee-engine/schedule] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.brokerGtid) {
      return NextResponse.json(
        { ok: false, error: "brokerGtid is required" },
        { status: 400 },
      );
    }
    if (!body?.serviceId) {
      return NextResponse.json(
        { ok: false, error: "serviceId is required" },
        { status: 400 },
      );
    }
    // If `id` is provided, treat as an update (creates new version).
    if (body.id) {
      const updated = await updateFeeSchedule(body.id, body);
      return NextResponse.json({ ok: true, schedule: updated });
    }
    const schedule = await createFeeSchedule(body.brokerGtid, body);
    return NextResponse.json({ ok: true, schedule }, { status: 201 });
  } catch (err: any) {
    logger.error("[api/fee-engine/schedule] POST failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
