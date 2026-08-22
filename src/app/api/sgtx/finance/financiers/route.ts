// @ts-nocheck
// §2b Financier Relationships — create relationship (POST)
// POST /api/sgtx/finance/financiers  body: CreateFinancierInput
import { NextResponse } from "next/server";
import { createFinancierRelationship } from "@/lib/sgtx/financier-relationship";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    if (!body.traderGtid || !body.financierGtid) {
      return NextResponse.json(
        { error: "traderGtid and financierGtid required" },
        { status: 400 },
      );
    }
    const relationship = await createFinancierRelationship(body);
    return NextResponse.json({ relationship });
  } catch (err: any) {
    logger.error("[api/finance/financiers] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
