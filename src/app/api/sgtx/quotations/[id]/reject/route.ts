// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { rejectQuotation } from "@/lib/sgtx/provider-quotations";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/sgtx/quotations/[id]/reject — mark a quote as REJECTED.
// Body: { rejectorGtid, reason }
// → { ok, rejected }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "quotation id required" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  if (!body.rejectorGtid) {
    return NextResponse.json({ error: "rejectorGtid required" }, { status: 400 });
  }
  if (!body.reason) {
    return NextResponse.json({ error: "reason required" }, { status: 400 });
  }
  try {
    const result = await rejectQuotation(id, body.rejectorGtid, body.reason);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    if (e.message && /not found|cannot/i.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    logger.error("[api/quotations/[id]/reject] failed", { error: e?.message });
    return NextResponse.json({ error: e?.message || "reject failed" }, { status: 500 });
  }
}
