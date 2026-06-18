import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { LIFECYCLE_STATES } from "@/lib/sgtx/identity";

// GET /api/sgtx/lifecycle/history?tenant=GTID
export async function GET(req: NextRequest) {
  const tenant = req.nextUrl.searchParams.get("tenant");
  if (!tenant) return NextResponse.json({ error: "tenant required" }, { status: 400 });
  const [history, tenantRec] = await Promise.all([
    db.tenantLifecycleHistory.findMany({ where: { tenantGtid: tenant }, orderBy: { createdAt: "desc" } }),
    db.tenant.findUnique({ where: { gtid: tenant } }),
  ]);
  return NextResponse.json({ currentState: tenantRec?.lifecycleState, states: LIFECYCLE_STATES, history });
}
