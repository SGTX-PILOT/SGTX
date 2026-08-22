// @ts-nocheck
// §7 Accounting — reverse entry. Body: { reason }
// POST /api/sgtx/finance/accounting/entries/[id]/reverse
import { NextResponse } from "next/server";
import { reverseEntry } from "@/lib/sgtx/accounting";
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
    if (!body?.reason) {
      return NextResponse.json({ error: "reason required" }, { status: 400 });
    }
    const entry = await reverseEntry(id, body.reason);
    return NextResponse.json({ entry });
  } catch (err: any) {
    logger.error("[api/finance/accounting/entries/[id]/reverse] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
