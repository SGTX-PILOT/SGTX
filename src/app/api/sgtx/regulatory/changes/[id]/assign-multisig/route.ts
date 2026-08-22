// @ts-nocheck
// §2 Regulatory Changes — POST assign multisig approval (constitutional gate)
// POST /api/sgtx/regulatory/changes/[id]/assign-multisig  body: { multisigRef }
import { NextResponse } from "next/server";
import {
  assignMultisigApproval,
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
    if (!body.multisigRef || typeof body.multisigRef !== "string") {
      return NextResponse.json(
        { error: "multisigRef required" },
        { status: 400 },
      );
    }
    let changeId = id;
    const byCuid = await getRegulatoryChange(id);
    if (byCuid?.changeId) {
      changeId = byCuid.changeId;
    } else {
      const byBusinessId = await getChangeByChangeId(id);
      if (byBusinessId?.changeId) changeId = byBusinessId.changeId;
    }
    const change = await assignMultisigApproval(changeId, body.multisigRef);
    return NextResponse.json({ change });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/regulatory/changes/[id]/assign-multisig] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
