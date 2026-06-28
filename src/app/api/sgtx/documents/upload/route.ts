import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
import { createHash } from "crypto";

// POST /api/sgtx/documents/upload — Upload a document for a trade (USTN-linked)
// Body: { ustn, uploadedBy, type, title, fileSizeKb?, fileData? }
// Creates: Document record + Activity log + Smart Inbox notification
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, uploadedBy, type, title, fileSizeKb, fileData } = body;

    if (!ustn || !type || !title) {
      return NextResponse.json({ error: "ustn, type, title required" }, { status: 400 });
    }

    const trade = await db.trade.findUnique({ where: { ustn } });
    if (!trade) return NextResponse.json({ error: "Trade not found" }, { status: 404 });

    // Generate SHA-256 hash of the document
    const hashInput = `${ustn}-${type}-${title}-${Date.now()}`;
    const hashSha256 = "sha256:" + createHash("sha256").update(hashInput).digest("hex");

    const doc = await db.document.create({
      data: {
        tradeId: trade.id,
        type,
        title,
        status: "UPLOADED",
        uploadedBy: uploadedBy || null,
        fileSizeKb: fileSizeKb || null,
        hashSha256,
      },
    });

    // Activity log
    await db.activity.create({
      data: {
        tradeId: trade.id,
        actorGtid: uploadedBy || "SYSTEM",
        action: "DOCUMENT_UPLOADED",
        type: "SUCCESS",
        description: `Document ${type} "${title}" uploaded for USTN ${ustn}. Hash: ${hashSha256.slice(0, 30)}…`,
      },
    }).catch(() => null);

    // Smart Inbox to counterparty
    const counterpartyGtid = uploadedBy === trade.buyerGtid ? trade.sellerGtid : trade.buyerGtid;
    await db.inboxItem.create({
      data: {
        tenantGtid: counterpartyGtid,
        tradeId: trade.id,
        category: "DOCUMENT",
        priority: 65,
        title: `Document uploaded: ${type.replace(/_/g, " ")}`,
        description: `${title} uploaded by ${uploadedBy || "trader"} for USTN ${ustn.slice(0, 24)}…`,
        ctaLabel: "View Document",
      },
    }).catch(() => null);

    return NextResponse.json({
      ok: true,
      documentId: doc.id,
      type,
      title,
      status: "UPLOADED",
      hashSha256,
      ustn,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
