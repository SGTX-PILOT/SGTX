// @ts-nocheck
// §7.2 State Vector — update a single domain
// POST /api/sgtx/constitutional/state-vector/update  body: { ustn, domain, value, reason? }
import { NextResponse } from "next/server";
import { updateStateDomain } from "@/lib/sgtx/state-vector";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { ustn, domain, value, reason } = body || {};
    if (!ustn || !domain || !value) {
      return NextResponse.json(
        { error: "ustn, domain, value required" },
        { status: 400 },
      );
    }
    const updated = await updateStateDomain(ustn, domain, String(value), reason);
    if (!updated) {
      return NextResponse.json(
        { error: "update failed — see logs" },
        { status: 500 },
      );
    }
    return NextResponse.json({ stateVector: updated });
  } catch (err: any) {
    logger.error("[api/constitutional/state-vector/update] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
