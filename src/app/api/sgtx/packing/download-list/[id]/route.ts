// 5.3 — Packing List Download (text format)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { renderPackingListText } from "@/lib/sgtx/packing";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const format = req.nextUrl.searchParams.get("format") || "text";

  const packingList = await db.packingList.findUnique({ where: { id } });
  if (!packingList) return NextResponse.json({ error: "Packing list not found" }, { status: 404 });

  if (format === "json") {
    return new NextResponse(packingList.contents, { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${packingList.listId}.json"` } });
  }

  // Text format (matches spec 5.3 example)
  const text = renderPackingListText(packingList);
  return new NextResponse(text, { headers: { "Content-Type": "text/plain", "Content-Disposition": `attachment; filename="${packingList.listId}.txt"` } });
}
