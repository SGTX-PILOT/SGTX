// SGTX Platform — Part 18: Egyptian PDPL Compliance — Tenant Dashboard
// GET /api/sgtx/pdpl/dashboard?tenantGtid=...
// Returns: { consentSummary, dsrSummary, lastBreach }
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const tenantGtid = req.nextUrl.searchParams.get("tenantGtid");
    if (!tenantGtid) {
      return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });
    }

    // Run the three queries in parallel for speed.
    const [consents, dsrRequests, lastBreach] = await Promise.all([
      db.consentRecord.findMany({
        where: { tenantGtid },
        select: { consentGiven: true, withdrawnAt: true },
      }),
      db.dsrRequest.findMany({
        where: { tenantGtid },
        select: { status: true },
      }),
      // Breach notifications are platform-level (no tenantGtid field on the
      // model per the Part 18 schema). Return the most recent one.
      db.dataBreachNotification.findFirst({
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const consentSummary = {
      total: consents.length,
      given: consents.filter((c) => c.consentGiven).length,
      withdrawn: consents.filter((c) => c.withdrawnAt !== null).length,
    };

    const dsrSummary = {
      pending: dsrRequests.filter((r) => r.status === "PENDING").length,
      fulfilled: dsrRequests.filter((r) => r.status === "FULFILLED").length,
      rejected: dsrRequests.filter((r) => r.status === "REJECTED").length,
    };

    return NextResponse.json({
      consentSummary,
      dsrSummary,
      lastBreach: lastBreach || null,
    });
  } catch (e: any) {
    console.error("[pdpl/dashboard GET]", e);
    return NextResponse.json(
      { error: e?.message || "Failed to fetch PDPL dashboard" },
      { status: 500 },
    );
  }
}
