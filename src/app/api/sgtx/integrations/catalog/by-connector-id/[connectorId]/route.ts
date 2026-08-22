// @ts-nocheck
// §1-3 Integration Catalog — GET by connectorId (CAT-YYYYMMDD-NNNNN)
// GET /api/sgtx/integrations/catalog/by-connector-id/[connectorId]
import { NextResponse } from "next/server";
import { getCatalogByConnectorId } from "@/lib/sgtx/integration-catalog";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ connectorId: string }> },
) {
  try {
    const { connectorId } = await params;
    if (!connectorId) {
      return NextResponse.json({ error: "connectorId required" }, { status: 400 });
    }
    const entry = await getCatalogByConnectorId(connectorId);
    if (!entry) {
      return NextResponse.json(
        { error: "catalog entry not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ entry });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/integrations/catalog/by-connector-id/[connectorId]] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
