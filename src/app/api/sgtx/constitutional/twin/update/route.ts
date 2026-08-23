// @ts-nocheck
// §89 Transaction Twin — update a single twin domain
// POST /api/sgtx/constitutional/twin/update  body: { ustn, domain, data }
import { NextResponse } from "next/server";
import { updateTwinDomain } from "@/lib/sgtx/transaction-twin";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { ustn, domain, data } = body || {};
    if (!ustn || !domain) {
      return NextResponse.json(
        { error: "ustn and domain required" },
        { status: 400 },
      );
    }
    if (data === undefined) {
      return NextResponse.json(
        { error: "data required (may be null)" },
        { status: 400 },
      );
    }
    const updated = await updateTwinDomain(ustn, domain, data);
    if (!updated) {
      return NextResponse.json(
        { error: "updateTwinDomain failed — see logs" },
        { status: 500 },
      );
    }
    return NextResponse.json({ twin: updated });
  } catch (err: any) {
    logger.error("[api/constitutional/twin/update] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
