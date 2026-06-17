import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chatWithAssistant } from "@/lib/sgtx/ai/orchestrator";

// POST /api/sgtx/ai/chat  { tenant: GTID, message: string }
export async function POST(req: NextRequest) {
  const { tenant, message } = await req.json();
  if (!tenant || !message) return NextResponse.json({ error: "tenant + message required" }, { status: 400 });

  const [tenantRec, inbox, tradesB, tradesS] = await Promise.all([
    db.tenant.findUnique({ where: { gtid: tenant } }),
    db.inboxItem.findMany({ where: { tenantGtid: tenant, dismissed: false }, orderBy: { priority: "desc" }, take: 6 }),
    db.trade.findMany({ where: { buyerGtid: tenant }, take: 5, orderBy: { createdAt: "desc" } }),
    db.trade.findMany({ where: { sellerGtid: tenant }, take: 5, orderBy: { createdAt: "desc" } }),
  ]);
  const trades = [...tradesB, ...tradesS];

  const result = await chatWithAssistant(message, { tenant: tenantRec, trades, inbox });
  return NextResponse.json(result);
}
