// @ts-nocheck
// POST /api/sgtx/road/dispatch/authorize
// Body: { corridorId }
// Runs the 12-gate dispatch authorization check (§14).
import { NextRequest, NextResponse } from "next/server";
import { checkDispatchAuthorization } from "@/lib/sgtx/road-corridor";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.corridorId) {
      return NextResponse.json({ error: "corridorId required" }, { status: 400 });
    }
    const result = await checkDispatchAuthorization(body.corridorId);
    return NextResponse.json(result);
  } catch (err: any) {
    logger.error("[api/road/dispatch/authorize] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
