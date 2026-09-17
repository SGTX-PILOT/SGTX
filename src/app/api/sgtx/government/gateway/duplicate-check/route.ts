// @ts-nocheck
// SGTX Phase 4 §2 + §9 — Government Gateway duplicate detection
//   GET /api/sgtx/government/gateway/duplicate-check?idempotencyKey=X
//   Calls detectDuplicate(idempotencyKey) — returns the prior SUCCESS
//   GovGatewayCall with the same idempotency key, or { duplicate: false }
//   when no prior call exists.
//
//   Use this endpoint BEFORE submit to decide whether to skip the call.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { detectDuplicate } from "@/lib/sgtx/gov-gateway";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const idempotencyKey = url.searchParams.get("idempotencyKey") || "";
    if (!idempotencyKey) {
      return NextResponse.json(
        { error: "idempotencyKey query parameter required" },
        { status: 400 },
      );
    }
    const priorCall = await detectDuplicate(idempotencyKey);
    if (!priorCall) {
      return NextResponse.json({ duplicate: false, idempotencyKey });
    }
    // Surface the prior call so the caller can replay its response instead
    // of re-submitting (§9 idempotency contract).
    let responsePayload: any = priorCall.responseBody;
    if (typeof responsePayload === "string" && responsePayload.length > 0) {
      try {
        responsePayload = JSON.parse(responsePayload);
      } catch {
        // leave as string
      }
    }
    return NextResponse.json({
      duplicate: true,
      idempotencyKey,
      priorCall,
      responsePayload,
    });
  } catch (err: any) {
    logger.error("[api/sgtx/government/gateway/duplicate-check] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
