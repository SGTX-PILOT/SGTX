// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { acceptQuotation } from "@/lib/sgtx/provider-quotations";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/sgtx/quotations/[id]/accept — mark a quote as ACCEPTED.
// Body: { acceptorGtid }
// → { ok, accepted, acceptedAt, supersededQuotationIds }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "quotation id required" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  if (!body.acceptorGtid) {
    return NextResponse.json({ error: "acceptorGtid required" }, { status: 400 });
  }
  try {
    const result = await acceptQuotation(id, body.acceptorGtid);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    if (e.message && /not found|cannot/i.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    logger.error("[api/quotations/[id]/accept] failed", { error: e?.message });
    return NextResponse.json({ error: e?.message || "accept failed" }, { status: 500 });
  }
}
