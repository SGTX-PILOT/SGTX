import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/sgtx/trade-request/draft — autosave / upsert a draft (30s debounce from frontend)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { draftId, buyerGtid, sellerGtid, incoterm, parsedSpecs, multiShipmentSchedule, globalNotes } = body;
    if (!buyerGtid) return NextResponse.json({ error: "buyerGtid required" }, { status: 400 });

    const stableId = draftId || `DRAFT-${buyerGtid}-${Date.now().toString(36)}`;
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days

    const draft = await db.tradeDraft.upsert({
      where: { draftId: stableId },
      update: {
        sellerGtid: sellerGtid || null,
        incoterm: incoterm || null,
        parsedSpecs: parsedSpecs ? JSON.stringify(parsedSpecs) : undefined,
        multiShipmentSchedule: multiShipmentSchedule ? JSON.stringify(multiShipmentSchedule) : undefined,
        globalNotes: globalNotes || null,
        expiresAt,
      },
      create: {
        draftId: stableId,
        buyerGtid,
        sellerGtid: sellerGtid || null,
        incoterm: incoterm || null,
        parsedSpecs: parsedSpecs ? JSON.stringify(parsedSpecs) : null,
        multiShipmentSchedule: multiShipmentSchedule ? JSON.stringify(multiShipmentSchedule) : null,
        globalNotes: globalNotes || null,
        expiresAt,
      },
    });

    return NextResponse.json({ ok: true, draftId: stableId, expiresAt: draft.expiresAt });
  } catch (e: any) {
    console.error("[trade-request/draft] error:", e);
    return NextResponse.json({ error: e.message || "Draft save failed" }, { status: 500 });
  }
}

// GET /api/sgtx/trade-request/draft — recover a draft by buyer (for Smart Inbox recovery)
export async function GET(req: NextRequest) {
  const buyerGtid = req.nextUrl.searchParams.get("buyerGtid");
  if (!buyerGtid) return NextResponse.json({ error: "buyerGtid required" }, { status: 400 });
  const draft = await db.tradeDraft.findFirst({
    where: { buyerGtid, status: "DRAFT", expiresAt: { gt: new Date() } },
    orderBy: { updatedAt: "desc" },
  });
  if (!draft) return NextResponse.json({ found: false });
  return NextResponse.json({
    found: true,
    draftId: draft.draftId,
    sellerGtid: draft.sellerGtid,
    incoterm: draft.incoterm,
    parsedSpecs: draft.parsedSpecs ? JSON.parse(draft.parsedSpecs) : null,
    multiShipmentSchedule: draft.multiShipmentSchedule ? JSON.parse(draft.multiShipmentSchedule) : null,
    globalNotes: draft.globalNotes,
    updatedAt: draft.updatedAt,
    expiresAt: draft.expiresAt,
  });
}
