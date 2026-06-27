import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
export async function GET(req: NextRequest) {
  try {
    const tenantGtid = req.nextUrl.searchParams.get("tenantGtid");
    const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50");
    if (!tenantGtid) return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });
    const [items, total] = await Promise.all([
      db.inboxItem.findMany({ where: { tenantGtid }, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      db.inboxItem.count({ where: { tenantGtid } }),
    ]);
    return NextResponse.json({ ok: true, items, total, page, limit });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
