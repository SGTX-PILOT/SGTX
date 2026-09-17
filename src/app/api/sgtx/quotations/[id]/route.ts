// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { getQuotation } from "@/lib/sgtx/provider-quotations";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/sgtx/quotations/[id] — retrieve a single quotation.
// → { quotation: {...} }
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "quotation id required" }, { status: 400 });
  try {
    const quotation = await getQuotation(id);
    if (!quotation) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ quotation });
  } catch (e: any) {
    logger.error("[api/quotations/[id]] GET failed", { error: e?.message });
    return NextResponse.json({ error: e?.message || "fetch failed" }, { status: 500 });
  }
}

// PATCH /api/sgtx/quotations/[id] — convenience action dispatcher.
// Body: { action: "accept" | "reject", actorGtid, reason? }
// (The dedicated /accept and /reject routes are preferred for clarity.)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "quotation id required" }, { status: 400 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  if (!body.action || !body.actorGtid) {
    return NextResponse.json({ error: "action, actorGtid required" }, { status: 400 });
  }
  // Delegate to the lib — same logic as the dedicated routes.
  try {
    if (body.action === "accept") {
      const { acceptQuotation } = await import("@/lib/sgtx/provider-quotations");
      const result = await acceptQuotation(id, body.actorGtid);
      return NextResponse.json({ ok: true, ...result });
    } else if (body.action === "reject") {
      const { rejectQuotation } = await import("@/lib/sgtx/provider-quotations");
      const result = await rejectQuotation(id, body.actorGtid, body.reason || "no reason");
      return NextResponse.json({ ok: true, ...result });
    }
    return NextResponse.json({ error: "action must be accept or reject" }, { status: 400 });
  } catch (e: any) {
    if (e.message && /not found|cannot/i.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    logger.error("[api/quotations/[id]] PATCH failed", { error: e?.message });
    return NextResponse.json({ error: e?.message || "update failed" }, { status: 500 });
  }
}
