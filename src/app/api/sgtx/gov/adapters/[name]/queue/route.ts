// GET /api/sgtx/gov/adapters/[name]/queue — get queue status for an adapter
//
// Returns: { adapter, queueSubject, pending, processing, failed, completed, totalProcessed }
import { NextRequest, NextResponse } from "next/server";
import {
  getQueueStatus,
  getAdapterConfig,
  GOV_ADAPTER_NAMES,
} from "@/lib/sgtx/gov/adapter-auth";

export async function GET(
  _req: NextRequest,
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

    const cfg = getAdapterConfig(upper);
    const queue = getQueueStatus(upper);

    return NextResponse.json({
      ok: true,
      mode: "SIMULATION",
      ...queue,
      config: {
        name: cfg.name,
        queueSubject: cfg.queueSubject,
        rateLimitPerMinute: cfg.rateLimitPerMinute,
        idempotencyTTL: cfg.idempotencyTTL,
      },
      checkedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error("[gov/adapters/[name]/queue]", e);
    return NextResponse.json(
      { error: e?.message ?? "Failed to get queue status" },
      { status: 500 },
    );
  }
}
