import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateInboxSummary } from "@/lib/sgtx/ai/orchestrator";

// POST /api/sgtx/ai/inbox-summary  { tenant: GTID }
export async function POST(req: NextRequest) {
  const { tenant } = await req.json();
  if (!tenant) return NextResponse.json({ error: "tenant required" }, { status: 400 });

  const [tenantRec, inbox] = await Promise.all([
    db.tenant.findUnique({ where: { gtid: tenant } }),
    db.inboxItem.findMany({ where: { tenantGtid: tenant, dismissed: false }, orderBy: { priority: "desc" }, take: 8 }),
  ]);

  const result = await generateInboxSummary(inbox, tenantRec?.legalName || "User");
  return NextResponse.json(result);
}
