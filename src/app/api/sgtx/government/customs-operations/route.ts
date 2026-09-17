// @ts-nocheck
// SGTX Phase 4 §1 — Customs Operations API
//   GET  /api/sgtx/government/customs-operations — list CustomsOperationV2 rows
//        Query: ?operationType=&jurisdictionCode=&status=&ustn=&brokerGtid=&transportMode=
//   POST /api/sgtx/government/customs-operations — create a CustomsOperationV2
//        Body: CreateOperationInput (operationType + jurisdictionCode required).
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  listCustomsOperations,
  createCustomsOperation,
} from "@/lib/sgtx/customs-engine";

export const dynamic = "force-dynamic";

// GET — list CustomsOperationV2 rows filtered by type / jurisdiction / status /
// ustn / broker / transport mode.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const operationType = url.searchParams.get("operationType") || undefined;
    const jurisdictionCode = url.searchParams.get("jurisdictionCode") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const ustn = url.searchParams.get("ustn") || undefined;
    const brokerGtid = url.searchParams.get("brokerGtid") || undefined;
    const transportMode = url.searchParams.get("transportMode") || undefined;

    const operations = await listCustomsOperations({
      operationType,
      jurisdictionCode,
      status,
      ustn,
      brokerGtid,
      transportMode,
    });
    return NextResponse.json({ operations, count: operations.length });
  } catch (err: any) {
    logger.error("[api/sgtx/government/customs-operations] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// POST — create a CustomsOperationV2. Body = CreateOperationInput.
// The engine validates operationType + jurisdictionCode; throws on invalid.
// On DB failure the engine returns a non-persisted stub (`_stub: true`) so the
// caller can still operate on a typed object.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "request body required" },
        { status: 400 },
      );
    }
    if (!body.operationType) {
      return NextResponse.json(
        { error: "operationType required" },
        { status: 400 },
      );
    }
    if (!body.jurisdictionCode) {
      return NextResponse.json(
        { error: "jurisdictionCode required" },
        { status: 400 },
      );
    }
    const operation = await createCustomsOperation(body);
    return NextResponse.json({ operation });
  } catch (err: any) {
    logger.error("[api/sgtx/government/customs-operations] POST failed", {
      error: err?.message,
    });
    // Engine throws on invalid operationType / missing jurisdictionCode —
    // surface as 400 (malformed input) rather than 500.
    const msg = err?.message || "internal error";
    const is400 = /invalid operationType|jurisdictionCode is required/i.test(msg);
    return NextResponse.json(
      { error: msg },
      { status: is400 ? 400 : 500 },
    );
  }
}
