// POST /api/sgtx/gov/adapters/[name]/submit — submit a request to a gov adapter
//   (with idempotency check + queueing + retry)
//
// Body: {
//   requestId: string,  // UUID for idempotency
//   ustn: string,
//   operation: string,  // declaration.submit | certificate.request | aci.create | einvoice.submit
//   payload: any
// }
//
// Returns: GovResponse { ok, requestId, status, reference, retryCount, ... }
import { NextRequest, NextResponse } from "next/server";
import {
  submitGovRequest,
  GOV_ADAPTER_NAMES,
  GovRequest,
} from "@/lib/sgtx/gov/adapter-auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await params;
    const upper = name.toUpperCase();
    if (!GOV_ADAPTER_NAMES.includes(upper as never)) {
      return NextResponse.json(
        {
          error: `Unknown government adapter "${name}". Valid: ${GOV_ADAPTER_NAMES.join(", ")}`,
        },
        { status: 404 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const { requestId, ustn, operation, payload } = body || {};

    const missing: string[] = [];
    if (!requestId) missing.push("requestId");
    if (!ustn) missing.push("ustn");
    if (!operation) missing.push("operation");
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    const govRequest: GovRequest = {
      requestId: String(requestId),
      ustn: String(ustn),
      operation: String(operation),
      payload: payload ?? {},
    };

    const response = await submitGovRequest(upper, govRequest);

    return NextResponse.json(response, { status: response.ok ? 200 : 502 });
  } catch (e: any) {
    console.error("[gov/adapters/[name]/submit]", e);
    return NextResponse.json(
      { error: e?.message ?? "Failed to submit government request" },
      { status: 500 },
    );
  }
}
