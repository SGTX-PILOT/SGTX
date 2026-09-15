// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupportTicket, listSupportTickets } from "@/lib/sgtx/help-center";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/sgtx/help-center/ticket?tenantGtid=X[&limit=N] — list a tenant's support tickets.
export async function GET(req: NextRequest) {
  const tenantGtid = req.nextUrl.searchParams.get("tenantGtid");
  if (!tenantGtid) return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });
  const limit = Number(req.nextUrl.searchParams.get("limit") || 50);
  try {
    const result = await listSupportTickets(tenantGtid, limit);
    return NextResponse.json(result);
  } catch (e: any) {
    logger.error("[api/help-center/ticket] GET failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "fetch failed" }, { status: 500 });
  }
}

// POST /api/sgtx/help-center/ticket — create a support ticket.
// Body: { tenantGtid, subject, description, priority?, url?, userAgent? }
//   → { ok, ticketId, ticket }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  try {
    const result = await createSupportTicket({
      tenantGtid: body.tenantGtid,
      subject: body.subject,
      description: body.description,
      priority: body.priority,
      url: body.url,
      userAgent: body.userAgent,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("[api/help-center/ticket] POST failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "create failed" }, { status: 400 });
  }
}
