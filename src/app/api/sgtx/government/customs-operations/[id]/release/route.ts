// @ts-nocheck
// SGTX Phase 4 §1 + §4 CRITICAL — Customs Operations API
//   POST /api/sgtx/government/customs-operations/[id]/release
//   Body: { releaseReference, authority }
//   Calls recordRelease(operationId, releaseReference, authority).
//
//   §4 CRITICAL: this is the ONLY endpoint in the entire platform that can
//   transition a CustomsOperationV2 to GOVERNMENT_RELEASED. The
//   releaseReference must come from the gateway `release` operation's
//   successful responsePayload.releaseReference — it can NEVER be fabricated.
//   The customs engine throws if the operation is not in GOVERNMENT_ACCEPTED
//   or if the releaseReference is empty.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  recordRelease,
  getCustomsOperation,
} from "@/lib/sgtx/customs-engine";

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
    const existing = await getCustomsOperation(id);
    if (!existing) {
      return NextResponse.json(
        { error: "customs operation not found", id },
        { status: 404 },
      );
    }
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "request body required" },
        { status: 400 },
      );
    }
    const releaseReference =
      typeof body.releaseReference === "string" ? body.releaseReference : "";
    if (!releaseReference) {
      return NextResponse.json(
        {
          error:
            "releaseReference required — government release cannot be fabricated (§4)",
        },
        { status: 400 },
      );
    }
    const authority =
      typeof body.authority === "string" ? body.authority : "";

    // §4 enforcement point — the customs engine throws if:
    //   • releaseReference is empty (we already checked, but the engine is
    //     the canonical enforcement).
    //   • the operation is not in GOVERNMENT_ACCEPTED.
    const operation = await recordRelease(id, releaseReference, authority);
    return NextResponse.json({ operation });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/government/customs-operations/[id]/release] POST failed",
      { error: err?.message },
    );
    const msg = err?.message || "internal error";
    // §4 — surface the engine's enforcement errors as 409 (state conflict) so
    // callers can distinguish from a server error.
    const is409 = /requires the operation to be in GOVERNMENT_ACCEPTED|cannot release a rejected\/hold operation/i.test(
      msg,
    );
    return NextResponse.json(
      { error: msg },
      { status: is409 ? 409 : 500 },
    );
  }
}
