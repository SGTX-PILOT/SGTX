// SGTX Platform — Part 18: Egyptian PDPL Compliance — Data Subject Rights
// GET  /api/sgtx/pdpl/dsr?tenantGtid=... | ?status=...   → list DSR requests
// POST /api/sgtx/pdpl/dsr                                → submit a new DSR request
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPlatformGovernanceGtid, isValidDsrType } from "@/lib/sgtx/pdpl";

// ── POST ───────────────────────────────────────────────────────────────────
// Body: { tenantGtid, requestType, details? }
export async function POST(req: NextRequest) {
  try {
    const { tenantGtid, requestType, details } = await req.json();

    if (!tenantGtid || !requestType) {
      return NextResponse.json({ error: "tenantGtid and requestType are required" }, { status: 400 });
    }
    if (!isValidDsrType(requestType)) {
      return NextResponse.json(
        { error: "Invalid requestType. Must be one of: ACCESS, RECTIFICATION, ERASURE, RESTRICTION, PORTABILITY, OBJECTION" },
        { status: 400 },
      );
    }

    // Create the DSR request with PENDING status.
    const dsr = await db.dsrRequest.create({
      data: {
        tenantGtid,
        requestType,
        details: details || null,
        status: "PENDING",
      },
    });

    // Smart Inbox to compliance officer (priority 80).
    try {
      const officerGtid = await getPlatformGovernanceGtid();
      if (officerGtid) {
        const safeDetails = (typeof details === "string" && details.length)
          ? ` — ${details.slice(0, 200)}`
          : "";
        await db.inboxItem.create({
          data: {
            tenantGtid: officerGtid,
            category: "COMPLIANCE",
            priority: 80,
            title: `New DSR request from ${tenantGtid}`,
            description: `Data Subject Rights request — type: ${requestType}${safeDetails}. Review and respond within the PDPL statutory window (30 days). Reference: ${dsr.id}.`,
            ctaLabel: "Review DSR",
          },
        });
      }
    } catch (inboxErr) {
      // Non-fatal — DSR was persisted; log and continue.
      console.error("[pdpl/dsr POST] inbox creation failed:", inboxErr);
    }

    return NextResponse.json({ ok: true, dsrId: dsr.id });
  } catch (e: any) {
    console.error("[pdpl/dsr POST]", e);
    return NextResponse.json(
      { error: e?.message || "Failed to submit DSR request" },
      { status: 500 },
    );
  }
}

// ── GET ────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const tenantGtid = req.nextUrl.searchParams.get("tenantGtid");
    const status = req.nextUrl.searchParams.get("status");

    const where: Record<string, string> = {};
    if (tenantGtid) where.tenantGtid = tenantGtid;
    if (status) where.status = status;

    const requests = await db.dsrRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ requests });
  } catch (e: any) {
    console.error("[pdpl/dsr GET]", e);
    return NextResponse.json(
      { error: e?.message || "Failed to list DSR requests" },
      { status: 500 },
    );
  }
}
