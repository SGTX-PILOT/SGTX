// @ts-nocheck
// SGTX Phase 2 §7 ADMIN — Trade Agreements API
//   GET    /api/sgtx/regulatory/agreements/[id] — fetch a single agreement
//          (includes tariffRules + originRules children).
//   DELETE /api/sgtx/regulatory/agreements/[id]  — soft delete (legalStatus=TERMINATED).
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  getTradeAgreement,
  deleteTradeAgreement,
} from "@/lib/sgtx/trade-agreement";

export const dynamic = "force-dynamic";

// GET — single agreement by id, with IN_FORCE tariffRules + originRules.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const agreement = await getTradeAgreement(id);
    if (!agreement) {
      return NextResponse.json(
        { error: "trade agreement not found", id },
        { status: 404 },
      );
    }
    return NextResponse.json({ agreement });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory/agreements/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// DELETE — soft delete (legalStatus=TERMINATED). Returns { ok }.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const ok = await deleteTradeAgreement(id, false);
    if (!ok) {
      return NextResponse.json(
        { error: "trade agreement not found or delete failed", id },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, id, softDeleted: true });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory/agreements/[id]] DELETE failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
