// @ts-nocheck
// SGTX Phase 4 §2 + §7 admin — Government Connectors API
//   GET    /api/sgtx/government/connectors/[id] — fetch a single GovConnector
//   DELETE /api/sgtx/government/connectors/[id] — soft-delete (calls deleteGovConnector(id, false))
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getGovConnector, deleteGovConnector } from "@/lib/sgtx/gov-gateway";

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
    const connector = await getGovConnector(id);
    if (!connector) {
      return NextResponse.json(
        { error: "government connector not found", id },
        { status: 404 },
      );
    }
    return NextResponse.json({ connector });
  } catch (err: any) {
    logger.error("[api/sgtx/government/connectors/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// DELETE — soft delete. §7 admin convention: hard=false marks the row as
// DELETED via status field, preserving the audit trail.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const existing = await getGovConnector(id);
    if (!existing) {
      return NextResponse.json(
        { error: "government connector not found", id },
        { status: 404 },
      );
    }
    const ok = await deleteGovConnector(id, false);
    return NextResponse.json({ ok, id });
  } catch (err: any) {
    logger.error("[api/sgtx/government/connectors/[id]] DELETE failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
