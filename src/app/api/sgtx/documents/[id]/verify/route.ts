import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { verifiedBy } = await req.json();
    const doc = await db.document.findUnique({ where: { id }, include: { trade: true } });
    if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
    await db.document.update({ where: { id }, data: { status: "VERIFIED", verifiedAt: new Date() } });
    if (doc.uploadedBy) await db.inboxItem.create({ data: { tenantGtid: doc.uploadedBy, tradeId: doc.tradeId, category: "GENERAL", priority: 70, title: `Document verified: ${doc.type}`, description: `${doc.title} verified by ${verifiedBy}`, ctaLabel: "View" } }).catch(() => null);
    return NextResponse.json({ ok: true, status: "VERIFIED" });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
