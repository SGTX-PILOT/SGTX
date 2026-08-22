// @ts-nocheck
// §2b Financier Relationships — platform-wide approve financing entity
// POST /api/sgtx/finance/financiers/approve  body: { financierGtid, authorizedBy, creditLimitUsd? }
import { NextResponse } from "next/server";
import { approveFinancierEntity } from "@/lib/sgtx/financier-relationship";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    if (!body.financierGtid || !body.authorizedBy) {
      return NextResponse.json(
        { error: "financierGtid and authorizedBy required" },
        { status: 400 },
      );
    }
    const scope: any = {};
    if (body.creditLimitUsd != null) {
      scope.creditLimitUsd = Number(body.creditLimitUsd);
    }
    const relationship = await approveFinancierEntity(
      body.financierGtid,
      body.authorizedBy,
      Object.keys(scope).length > 0 ? scope : undefined,
    );
    return NextResponse.json({ relationship });
  } catch (err: any) {
    logger.error("[api/finance/financiers/approve] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
