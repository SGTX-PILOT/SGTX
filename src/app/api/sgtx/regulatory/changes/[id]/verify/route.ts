// @ts-nocheck
// §2 Regulatory Changes — POST verify (DETECTED → VERIFIED)
// POST /api/sgtx/regulatory/changes/[id]/verify  body: { verifiedBy, notes }
import { NextResponse } from "next/server";
import {
  verifyChange,
  getRegulatoryChange,
  getChangeByChangeId,
} from "@/lib/sgtx/regulatory-change";
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
    if (!body.verifiedBy || typeof body.verifiedBy !== "string") {
      return NextResponse.json(
        { error: "verifiedBy required" },
        { status: 400 },
      );
    }
    // Resolve [id] to the business changeId (RCG-…). Accept either a cuid
    // or a changeId as the path param.
    let changeId = id;
    const byCuid = await getRegulatoryChange(id);
    if (byCuid?.changeId) {
      changeId = byCuid.changeId;
    } else {
      const byBusinessId = await getChangeByChangeId(id);
      if (byBusinessId?.changeId) changeId = byBusinessId.changeId;
    }
    const change = await verifyChange(
      changeId,
      body.verifiedBy,
      body.notes || "",
    );
    return NextResponse.json({ change });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/regulatory/changes/[id]/verify] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
