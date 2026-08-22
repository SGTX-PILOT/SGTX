// @ts-nocheck
// §1-3 Integration Catalog — GET by DB id + DELETE by connectorId
// GET    /api/sgtx/integrations/catalog/[id]        → getCatalogEntry
// DELETE /api/sgtx/integrations/catalog/[connectorId]  → deleteCatalogEntry (soft by default, ?hard=true to hard-delete)
import { NextResponse } from "next/server";
import { getCatalogEntry, deleteCatalogEntry } from "@/lib/sgtx/integration-catalog";
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
    const entry = await getCatalogEntry(id);
    if (!entry) {
      // The URL param may actually be a connectorId (CAT-YYYYMMDD-NNNNN). Try
      // that as a fallback so callers can resolve by either identifier.
      const { getCatalogByConnectorId } = await import(
        "@/lib/sgtx/integration-catalog"
      );
      const byConnector = await getCatalogByConnectorId(id);
      if (!byConnector) {
        return NextResponse.json(
          { error: "catalog entry not found" },
          { status: 404 },
        );
      }
      return NextResponse.json({ entry: byConnector });
    }
    return NextResponse.json({ entry });
  } catch (err: any) {
    logger.error("[api/sgtx/integrations/catalog/[id]] GET failed", {
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
    // The path param here is the connectorId (CAT-YYYYMMDD-NNNNN) per spec.
    const url = new URL(req.url);
    const hard = url.searchParams.get("hard") === "true";
    const ok = await deleteCatalogEntry(id, hard);
    if (!ok) {
      return NextResponse.json(
        { error: "catalog entry not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok, connectorId: id, hard });
  } catch (err: any) {
    logger.error("[api/sgtx/integrations/catalog/[id]] DELETE failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
