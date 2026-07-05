// @ts-nocheck
// SGTX Platform — Part 18: Egyptian PDPL Compliance — Fulfill a DSR request
// POST /api/sgtx/pdpl/dsr/fulfill
// Body: { dsrId, status: "FULFILLED" | "REJECTED" }
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";

const VALID_FULFILL_STATUSES = new Set(["FULFILLED", "REJECTED"]);

export async function POST(req: NextRequest) {
  try {
    const { dsrId, status } = await req.json();

    if (!dsrId || !status) {
      return NextResponse.json({ error: "dsrId and status are required" }, { status: 400 });
    }
    if (!VALID_FULFILL_STATUSES.has(status)) {
      return NextResponse.json(
        { error: "Invalid status. Must be one of: FULFILLED, REJECTED" },
        { status: 400 },
      );
    }

    const dsr = await db.dsrRequest.findUnique({ where: { id: dsrId } });
    if (!dsr) {
      return NextResponse.json({ error: "DSR request not found" }, { status: 404 });
    }

    const now = new Date();
    await db.dsrRequest.update({
      where: { id: dsrId },
      data: {
        status,
        fulfilledAt: now,
      },
    });

    // Smart Inbox to the requesting tenant.
    try {
      await db.inboxItem.create({
        data: {
          tenantGtid: dsr.tenantGtid,
          category: "COMPLIANCE",
          priority: 70,
          title: `Your ${dsr.requestType} request has been ${status}`,
          description: `Your Data Subject Rights request (${dsr.requestType}) has been ${status.toLowerCase()}. Reference: ${dsrId}. If you have further questions, contact the SGTX compliance team.`,
          ctaLabel: "View Details",
        },
      });
    } catch (inboxErr) {
      logger.error("[pdpl/dsr/fulfill POST] inbox creation failed:", inboxErr);
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    logger.error("[pdpl/dsr/fulfill POST]", e);
    return NextResponse.json(
      { error: e?.message || "Failed to fulfill DSR request" },
      { status: 500 },
    );
  }
}
