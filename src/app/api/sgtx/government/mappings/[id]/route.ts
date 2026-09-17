// @ts-nocheck
// SGTX Phase 4 §3 — Single Window API
//   GET    /api/sgtx/government/mappings/[id] — fetch a single SingleWindowMapping
//   DELETE /api/sgtx/government/mappings/[id] — soft delete (calls deleteMapping(id, false))
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getMapping, deleteMapping } from "@/lib/sgtx/single-window";

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
    const mapping = await getMapping(id);
    if (!mapping) {
      return NextResponse.json(
        { error: "single-window mapping not found", id },
        { status: 404 },
      );
    }
    return NextResponse.json({ mapping });
  } catch (err: any) {
    logger.error("[api/sgtx/government/mappings/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// DELETE — soft delete (§7 admin convention: hard=false appends a `[DELETED
// <ts>]` marker to the row's notes so the audit trail is preserved).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const existing = await getMapping(id);
    if (!existing) {
      return NextResponse.json(
        { error: "single-window mapping not found", id },
        { status: 404 },
      );
    }
    const ok = await deleteMapping(id, false);
    return NextResponse.json({ ok, id });
  } catch (err: any) {
    logger.error("[api/sgtx/government/mappings/[id]] DELETE failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
