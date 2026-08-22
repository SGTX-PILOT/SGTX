// @ts-nocheck
// §8 ERP Adapters — GET single adapter + DELETE
// GET    /api/sgtx/finance/erp-adapters/[id]
// DELETE /api/sgtx/finance/erp-adapters/[id]?hard=true
import { NextResponse } from "next/server";
import {
  getErpAdapter,
  deleteErpAdapter,
} from "@/lib/sgtx/erp-adapter";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const adapter = await getErpAdapter(id);
    if (!adapter) {
      return NextResponse.json(
        { error: "erp adapter not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ adapter });
  } catch (err: any) {
    logger.error("[api/finance/erp-adapters/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const url = new URL(req.url);
    const hard = url.searchParams.get("hard") === "true";
    const ok = await deleteErpAdapter(id, hard);
    if (!ok) {
      return NextResponse.json(
        { error: "erp adapter not found or delete failed" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, id, hard });
  } catch (err: any) {
    logger.error("[api/finance/erp-adapters/[id]] DELETE failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
