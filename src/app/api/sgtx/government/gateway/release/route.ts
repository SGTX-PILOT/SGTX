// @ts-nocheck
// SGTX Phase 4 §2 + §4 — Government Gateway operation #10: release
//   POST /api/sgtx/government/gateway/release
//   Body: { connectorId, governmentReference }
//   Calls release(connectorId, governmentReference) — polls the national
//   system for customs release of a submitted declaration.
//
//   §4 CRITICAL: the gateway NEVER fabricates a release. If the government
//   has not yet issued a release, or the connector is MANUAL_ONLY / PORTAL_ONLY,
//   the result is { ok:false, status:"NOT_YET_RELEASED", error:"..." }. The
//   HTTP status remains 200 — a NOT_YET_RELEASED is a legitimate government
//   response, not a server error. The caller MUST re-poll later.
//
//   The customs-operations/[id]/release endpoint is the ONLY endpoint that
//   can transition a CustomsOperationV2 to GOVERNMENT_RELEASED, and it
//   requires a releaseReference obtained from THIS endpoint's successful
//   responsePayload.releaseReference.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { release } from "@/lib/sgtx/gov-gateway";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "request body required" },
        { status: 400 },
      );
    }
    const connectorId = typeof body.connectorId === "string" ? body.connectorId : "";
    if (!connectorId) {
      return NextResponse.json(
        { error: "connectorId required" },
        { status: 400 },
      );
    }
    const governmentReference =
      typeof body.governmentReference === "string" ? body.governmentReference : "";
    if (!governmentReference) {
      return NextResponse.json(
        { error: "governmentReference required" },
        { status: 400 },
      );
    }
    const result = await release(connectorId, governmentReference);
    if (!result.ok && result.error === "connector not found") {
      return NextResponse.json(
        { error: result.error, connectorId },
        { status: 404 },
      );
    }
    // §4 — return ok:false verbatim when manual release is required or the
    // government has not yet issued release. HTTP 200 (legitimate response).
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error("[api/sgtx/government/gateway/release] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
