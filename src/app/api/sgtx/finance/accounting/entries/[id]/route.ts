// @ts-nocheck
// §7 Accounting — GET single entry by database id
// GET /api/sgtx/finance/accounting/entries/[id]
import { NextResponse } from "next/server";
import { getEntry } from "@/lib/sgtx/accounting";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const entry = await getEntry(id);
    if (!entry) {
      return NextResponse.json(
        { error: "entry not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ entry });
  } catch (err: any) {
    logger.error("[api/finance/accounting/entries/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
