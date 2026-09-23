// @ts-nocheck
// GET /api/sgtx/permit/list — list all issued permits (Document rows with type=PERMIT)
// Query params: ?limit=N (default 100, max 500)
// Returns: { permits: [{ id, tradeId, ustn, title, type, status, hashSha256, uploadedBy, createdAt }], count }
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const limit = Math.min(500, Math.max(1, Number(req.nextUrl.searchParams.get("limit") || 100)));
    const docs = await db.document.findMany({
      where: { type: "PERMIT" },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { trade: { select: { ustn: true, commodity: true } } },
    });
    const permits = docs.map((d: any) => ({
      id: d.id,
      tradeId: d.tradeId,
      ustn: d.trade?.ustn ?? null,
      commodity: d.trade?.commodity ?? null,
      title: d.title,
      type: d.type,
      status: d.status,
      hashSha256: d.hashSha256,
      uploadedBy: d.uploadedBy,
      createdAt: d.createdAt,
    }));
    return NextResponse.json({ permits, count: permits.length });
  } catch (e: any) {
    logger.error("[api/permit/list GET] failed", { error: e?.message || String(e) });
    return NextResponse.json(
      { error: e?.message || "internal error" },
      { status: 500 },
    );
  }
}
