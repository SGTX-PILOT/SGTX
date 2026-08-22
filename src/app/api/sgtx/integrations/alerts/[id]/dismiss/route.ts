// @ts-nocheck
// §10 Alerts — POST dismiss (→ DISMISSED)
// POST /api/sgtx/integrations/alerts/[id]/dismiss  body: { reason }
import { NextResponse } from "next/server";
import { dismissAlert } from "@/lib/sgtx/integration-alerts";
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
    if (!body.reason) {
      return NextResponse.json({ error: "reason required" }, { status: 400 });
    }
    const alert = await dismissAlert(id, body.reason);
    return NextResponse.json({ alert });
  } catch (err: any) {
    logger.error("[api/sgtx/integrations/alerts/[id]/dismiss] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
