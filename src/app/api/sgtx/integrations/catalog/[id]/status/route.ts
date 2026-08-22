// @ts-nocheck
// §1-3 Integration Catalog — POST status update (transition a connector)
// POST /api/sgtx/integrations/catalog/[connectorId]/status  body: { newStatus, notes? }
import { NextResponse } from "next/server";
import { updateCatalogStatus } from "@/lib/sgtx/integration-catalog";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "connectorId required" }, { status: 400 });
    }
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    if (!body.newStatus) {
      return NextResponse.json({ error: "newStatus required" }, { status: 400 });
    }
    const entry = await updateCatalogStatus(id, body.newStatus, body.notes);
    return NextResponse.json({ entry });
  } catch (err: any) {
    logger.error("[api/sgtx/integrations/catalog/[id]/status] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
