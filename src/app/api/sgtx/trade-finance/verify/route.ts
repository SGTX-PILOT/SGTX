// POST /api/sgtx/trade-finance/verify — verify a trade finance document
//
// Body:
//   {
//     documentId: string,        // required
//     newStatus?: "VERIFIED" | "REJECTED",   // default VERIFIED
//     note?: string              // optional outcome note
//   }
//
// Returns the updated document row. Status transitions:
//   PENDING → VERIFIED | REJECTED
//   SUBMITTED → VERIFIED | REJECTED
//   VERIFIED → (no-op if already VERIFIED)
//   REJECTED → (no-op if already REJECTED)
//
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

const ALLOWED_NEW_STATUS = new Set(["VERIFIED", "REJECTED"]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { documentId, newStatus, note } = body || {};

    if (!documentId) {
      return NextResponse.json({ error: "Missing required field: documentId" }, { status: 400 });
    }

    const targetStatus = newStatus || "VERIFIED";
    if (!ALLOWED_NEW_STATUS.has(targetStatus)) {
      return NextResponse.json(
        { error: `Invalid newStatus. Allowed: ${Array.from(ALLOWED_NEW_STATUS).join(", ")}` },
        { status: 400 },
      );
    }

    const existing = await (db as any).tradeFinanceDocument.findUnique({
      where: { id: documentId },
    });
    if (!existing) {
      return NextResponse.json({ error: "document not found" }, { status: 404 });
    }

    // Idempotent: no-op if already in target status.
    if (existing.status === targetStatus) {
      return NextResponse.json({
        ok: true,
        documentId: existing.id,
        status: existing.status,
        note: note || null,
        idempotent: true,
      });
    }

    const updated = await (db as any).tradeFinanceDocument.update({
      where: { id: documentId },
      data: { status: targetStatus },
    });

    logger.info("[trade-finance/verify] document verified", {
      docId: documentId,
      newStatus: targetStatus,
      note: note || null,
    });

    return NextResponse.json({
      ok: true,
      documentId: updated.id,
      status: updated.status,
      note: note || null,
    });
  } catch (e: any) {
    logger.error("[trade-finance/verify] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
