// GET /api/sgtx/gov/adapters/[name]/status/[requestId] — check request status
//
// Looks up the request in the idempotency store (IntegrationConnectorLog) by
// the SHA-256 digest of the requestId. Returns the cached GovResponse if found,
// 404 if not.
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  checkIdempotency,
  GOV_ADAPTER_NAMES,
} from "@/lib/sgtx/gov/adapter-auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string; requestId: string }> },
) {
  try {
    const { name, requestId } = await params;
    const upper = name.toUpperCase();
    if (!GOV_ADAPTER_NAMES.includes(upper as never)) {
      return NextResponse.json(
        {
          error: `Unknown government adapter "${name}". Valid: ${GOV_ADAPTER_NAMES.join(", ")}`,
        },
        { status: 404 },
      );
    }

    if (!requestId) {
      return NextResponse.json(
        { error: "requestId is required" },
        { status: 400 },
      );
    }

    const cached = await checkIdempotency(upper, requestId);
    if (!cached) {
      return NextResponse.json(
        {
          ok: false,
          adapter: upper,
          requestId,
          error: "No response found for this requestId (it may have expired after 24h, or never been submitted).",
          mode: "SIMULATION",
        },
        { status: 404 },
      );
    }

    return NextResponse.json(cached);
  } catch (e: any) {
    logger.error("[gov/adapters/[name]/status/[requestId]]", e);
    return NextResponse.json(
      { error: e?.message ?? "Failed to check request status" },
      { status: 500 },
    );
  }
}
