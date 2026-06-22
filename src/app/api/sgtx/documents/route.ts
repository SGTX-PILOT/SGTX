import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";

// GET /api/sgtx/documents?ustn=... — list documents for a trade (Phase 4)
// Note: previously this GET handler existed only on /api/sgtx/documents/upload,
// which made /api/sgtx/documents (without /upload) return a 404. This dedicated
// route.ts makes the GET reachable at the canonical path the UI and external
// integrations expect.
export async function GET(req: NextRequest) {
  const ustn = req.nextUrl.searchParams.get("ustn");
  const type = req.nextUrl.searchParams.get("type");
  const status = req.nextUrl.searchParams.get("status");
  if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });
  const trade = await db.trade.findUnique({ where: { ustn }, select: { id: true } });
  if (!trade) return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  const where: any = { tradeId: trade.id };
  if (type) where.type = type;
  if (status) where.status = status;
  const docs = await db.document.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ ok: true, ustn, documents: docs, total: docs.length });
}
