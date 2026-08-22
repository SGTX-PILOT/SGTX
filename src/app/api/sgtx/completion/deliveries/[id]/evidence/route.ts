// @ts-nocheck
// §1 Delivery Acceptance — add evidence. Body: { evidence }
// POST /api/sgtx/completion/deliveries/[id]/evidence
import { NextResponse } from "next/server";
import { addEvidence } from "@/lib/sgtx/delivery-acceptance";
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
    if (!body.evidence) {
      return NextResponse.json(
        { error: "evidence required" },
        { status: 400 },
      );
    }
    const delivery = await addEvidence(id, body.evidence);
    return NextResponse.json({ delivery });
  } catch (err: any) {
    logger.error("[api/completion/deliveries/[id]/evidence] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
