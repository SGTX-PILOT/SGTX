// @ts-nocheck
// §10 Alerts — POST resolve (ACKNOWLEDGED → RESOLVED)
// POST /api/sgtx/integrations/alerts/[id]/resolve  body: { resolvedBy, notes }
import { NextResponse } from "next/server";
import { resolveAlert } from "@/lib/sgtx/integration-alerts";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    if (!body.resolvedBy) {
      return NextResponse.json(
        { error: "resolvedBy required" },
        { status: 400 },
      );
    }
    if (!body.notes) {
      return NextResponse.json({ error: "notes required" }, { status: 400 });
    }
    const alert = await resolveAlert(id, body.resolvedBy, body.notes);
    return NextResponse.json({ alert });
  } catch (err: any) {
    logger.error("[api/sgtx/integrations/alerts/[id]/resolve] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
