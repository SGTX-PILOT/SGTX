// @ts-nocheck
// §7 Accounting — post entry (DRAFT → POSTED). Body: { postedBy }
// POST /api/sgtx/finance/accounting/entries/[id]/post
import { NextResponse } from "next/server";
import { postEntry } from "@/lib/sgtx/accounting";
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
    if (!body?.postedBy) {
      return NextResponse.json(
        { error: "postedBy required" },
        { status: 400 },
      );
    }
    const entry = await postEntry(id, body.postedBy);
    return NextResponse.json({ entry });
  } catch (err: any) {
    logger.error("[api/finance/accounting/entries/[id]/post] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
