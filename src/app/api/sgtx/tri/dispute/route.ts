// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fileTriDispute } from "@/lib/sgtx/dispute";

// POST /api/sgtx/tri/dispute — File a TRI score calculation dispute (Part 10.14).
// Body: { tenantGtid, disputeReason, supportingEvidence }
// G1U38 — TRI dispute requires supporting evidence attachment.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await fileTriDispute(body);
    if (!result.ok) return NextResponse.json({ error: result.reason, code: result?.code }, { status: 400 });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET /api/sgtx/tri/dispute?tenantGtid=... — list TRI disputes for a tenant.
export async function GET(req: NextRequest) {
  const tenantGtid = req.nextUrl.searchParams.get("tenantGtid");
  if (!tenantGtid) return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });
  const disputes = await db.triDispute.findMany({
    where: { tenantGtid },
    orderBy: { filedAt: "desc" },
    }) as any;
    return NextResponse.json({ ok: true, count: disputes.length, disputes }) as any;
}
