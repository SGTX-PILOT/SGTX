// @ts-nocheck
// SGTX Phase 3 §8 — Compliance Connector Registry API
//   GET    /api/sgtx/compliance/connectors/[id] — fetch a single ComplianceConnector.
//   DELETE /api/sgtx/compliance/connectors/[id] — soft-delete (status → NOT_AVAILABLE).
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  getComplianceConnector,
  deleteComplianceConnector,
} from "@/lib/sgtx/compliance-connector";

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
    const connector = await getComplianceConnector(id);
    if (!connector) {
      return NextResponse.json(
        { error: "compliance connector not found", id },
        { status: 404 },
      );
    }
    return NextResponse.json({ connector });
  } catch (err: any) {
    logger.error("[api/sgtx/compliance/connectors/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// DELETE — soft-delete a ComplianceConnector row. Calls
// deleteComplianceConnector(id, false) which marks status = NOT_AVAILABLE
// (preserves audit history). Use the lib's hard-delete path directly (via
// POST or a future dedicated endpoint) if a true row removal is needed.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const ok = await deleteComplianceConnector(id, false);
    if (!ok) {
      return NextResponse.json(
        { error: "compliance connector not found or already removed", id },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, id, softDeleted: true });
  } catch (err: any) {
    logger.error("[api/sgtx/compliance/connectors/[id]] DELETE failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
