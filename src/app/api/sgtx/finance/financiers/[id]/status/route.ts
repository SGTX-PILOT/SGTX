// @ts-nocheck
// §2b Financier Relationships — update status. Body: { newStatus }
// POST /api/sgtx/finance/financiers/[id]/status
import { NextResponse } from "next/server";
import { updateFinancierRelationshipStatus } from "@/lib/sgtx/financier-relationship";
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
    if (!body?.newStatus) {
      return NextResponse.json(
        { error: "newStatus required" },
        { status: 400 },
      );
    }
    const relationship = await updateFinancierRelationshipStatus(
      id,
      body.newStatus,
    );
    return NextResponse.json({ relationship });
  } catch (err: any) {
    logger.error("[api/finance/financiers/[id]/status] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
