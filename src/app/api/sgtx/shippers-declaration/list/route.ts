// GET /api/sgtx/shippers-declaration/list?exporterGtid=X — list declarations
//
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const exporterGtid = url.searchParams.get("exporterGtid") || "";

    if (!exporterGtid) {
      return NextResponse.json({ error: "Missing required query param: exporterGtid" }, { status: 400 });
    }

    const decls = await (db as any).shippersDeclaration.findMany({
      where: { exporterGtid },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      ok: true,
      exporterGtid,
      declarations: decls || [],
      count: (decls || []).length,
    });
  } catch (e: any) {
    logger.error("[shippers-declaration/list] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
