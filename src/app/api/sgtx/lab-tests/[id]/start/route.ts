// @ts-nocheck
// SGTX v18 — LAB portal sampling queue workflow
//
// POST /api/sgtx/lab-tests/[id]/start
//   Body: { startedByGtid?, startedAt? }
//   Transitions a LabTest from REQUESTED or SAMPLE_COLLECTED → TESTING.
//   Returns the updated lab test record (including the trade + lab).
//
//   → 200 { ok, labTest }
//   → 400 if already in a terminal state (COMPLETED/CANCELLED)
//   → 404 if no LabTest with that id

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { freshDb } from "@/lib/db-fresh";
import { logger } from "@/lib/sgtx/logger";

const _db = (freshDb ?? db) as typeof db;

export const dynamic = "force-dynamic";

const ENTRY_STATES = new Set(["REQUESTED", "SAMPLE_COLLECTED", "SAMPLING", "PENDING"]);
const BLOCKED_STATES = new Set(["COMPLETED", "CANCELLED", "REJECTED"]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const startedByGtid = body?.startedByGtid || body?.labGtid || null;
    const startedAt = body?.startedAt ? new Date(body.startedAt) : new Date();

    const labTest = await _db.labTest.findUnique({
      where: { id },
      include: { trade: true, lab: true },
    });
    if (!labTest) {
      return NextResponse.json(
        { ok: false, error: `Lab test ${id} not found` },
        { status: 404 },
      );
    }
    if (BLOCKED_STATES.has(labTest.status)) {
      return NextResponse.json(
        { ok: false, error: `Lab test already in terminal state ${labTest.status}` },
        { status: 400 },
      );
    }
    if (labTest.status === "TESTING") {
      // idempotent — return the record unchanged
      return NextResponse.json({ ok: true, labTest, alreadyTesting: true });
    }
    if (!ENTRY_STATES.has(labTest.status)) {
      return NextResponse.json(
        { ok: false, error: `Cannot start testing from state ${labTest.status}` },
        { status: 400 },
      );
    }

    const updated = await _db.labTest.update({
      where: { id },
      data: { status: "TESTING" },
      include: { trade: { include: { buyer: true, seller: true } }, lab: true },
    });

    try {
      await _db.activity.create({
        data: {
          actorGtid: startedByGtid || labTest.labGtid,
          tradeId: labTest.tradeId,
          action: "LAB_TEST_STARTED",
          type: "LAB_TEST_STARTED",
          description: `Lab ${labTest.testType} transitioned to TESTING for USTN ${labTest.trade?.ustn || "—"}.`,
          metadata: JSON.stringify({
            labTestId: id,
            testType: labTest.testType,
            startedBy: startedByGtid,
            startedAt: startedAt.toISOString(),
          }),
        },
      });
    } catch (actErr: any) {
      logger.warn("[lab-tests/start] activity log failed", { error: actErr?.message });
    }

    logger.info("[api/lab-tests/start] transitioned to TESTING", {
      labTestId: id,
      ustn: labTest.trade?.ustn,
      from: labTest.status,
    });

    return NextResponse.json({ ok: true, labTest: updated });
  } catch (err: any) {
    logger.error("[api/lab-tests/start] POST failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
