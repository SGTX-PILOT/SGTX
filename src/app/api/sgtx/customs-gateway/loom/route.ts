// @ts-nocheck
/**
 * SGTX Customs Gateway — Loom Customs Events API
 * GET /api/sgtx/customs-gateway/loom?ustn=<USTN>
 *   Returns: sanitised customs Loom events for the USTN (oldest first)
 * GET /api/sgtx/customs-gateway/loom?ustn=<USTN>&verify=1
 *   Returns: hash-chain verification result for the USTN
 * GET /api/sgtx/customs-gateway/loom
 *   Returns: list of canonical customs Loom event types
 */

import { NextRequest, NextResponse } from "next/server";
import {
  listCustomsLoomEvents,
  verifyCustomsLoomChain,
  CUSTOMS_LOOM_EVENTS,
} from "@/lib/sgtx/customs-gateway/loom-customs";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ustn = searchParams.get("ustn");
    const verify = searchParams.get("verify");

    if (!ustn) {
      return NextResponse.json({
        ok: true,
        customsLoomEvents: CUSTOMS_LOOM_EVENTS,
        usage: {
          listByUstn: "GET /api/sgtx/customs-gateway/loom?ustn=<USTN>",
          verifyChain: "GET /api/sgtx/customs-gateway/loom?ustn=<USTN>&verify=1",
        },
        note: "Every Loom event is sanitised — credentials, secrets, filer codes, private keys, and API keys are NEVER persisted.",
      });
    }

    if (verify === "1") {
      const verification = await verifyCustomsLoomChain(ustn);
      return NextResponse.json({ ok: true, ustn, verification });
    }

    const events = await listCustomsLoomEvents(ustn);
    return NextResponse.json({ ok: true, ustn, count: events.length, events });
  } catch (err: any) {
    logger.error("[api/customs-gateway/loom] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
