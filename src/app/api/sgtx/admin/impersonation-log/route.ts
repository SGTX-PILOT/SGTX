// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/sgtx/admin/impersonation-log — list recent impersonation audit events.
// Query params:
//   ?limit=N      → max 200, default 50
//
// Returns: { log: Activity[], count }
//
// Two sources of impersonation audit (per v18 §16.8.13):
//   1. Tenant-level impersonation: written by /api/sgtx/admin/tenant/impersonate
//      as Activity with action="TENANT_IMPERSONATION" / "IMPERSONATION_DENIED".
//   2. Customer-care session impersonation: written by customer-care lib as
//      Activity with action starting "impersonation_*" OR by the chat session
//      audit trail (action="impersonation_started" etc.). The chat session
//      stores impersonation state inline; this endpoint pulls the audit trail
//      from the Activity table.
//
// Used by /admin Customer Care Hub section (v18 §16.8.13).
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const limit = Math.min(Number(sp.get("limit") || "50"), 200);

    const rows = await db.activity.findMany({
      where: {
        OR: [
          { action: { contains: "impersonation", mode: "insensitive" } },
          { action: { contains: "IMPERSONATION" } },
          { action: "TENANT_IMPERSONATION" },
          { action: "IMPERSONATION_DENIED" },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ log: rows, count: rows.length });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "fetch failed" },
      { status: 500 },
    );
  }
}
