// @ts-nocheck
// SGTX v18 §16.8.9 — CBR Audit Representation
//
// GET  /api/sgtx/audit/invitations?brokerGtid=<gtid>
//   Returns audit invitations for this broker. Stored as FeedbackTicket rows
//   with type=AUDIT_INVITATION. If none exist, a synthesised "no invitations"
//   empty state is returned by the UI (this endpoint returns 0 rows, not 404).
//
//   Response shape:
//   {
//     ok: true,
//     count: N,
//     invitations: [
//       { auditId, agency, scope, date, status, brokerGtid, ticketId, ... }
//     ]
//   }
//
// POST /api/sgtx/audit/invitations
//   body: { auditId, brokerGtid, action: "accept" | "decline" | "complete", notes? }
//   → 200 { ok, auditId, newStatus, activityId }
//
// Persisted as FeedbackTicket updates (status: ACCEPTED / DECLINED / COMPLETED)
// plus an Activity log entry. No schema changes.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

function parseAuditTicket(t: any) {
  // The FeedbackTicket stores audit metadata in subject/description.
  // Convention: subject="AUDIT — <agency> — <scope>", description="<ISO date> | <agency> | <scope> | <details>"
  let agency = "—";
  let scope = "—";
  let date: string | null = null;
  if (t.subject) {
    const m = String(t.subject).match(/AUDIT\s*[—\-:]\s*([^—\-:]+)\s*[—\-:]\s*(.+)/i);
    if (m) { agency = m[1].trim(); scope = m[2].trim(); }
    else { agency = String(t.subject); }
  }
  if (t.description) {
    const dMatch = String(t.description).match(/^(\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?)/i);
    if (dMatch) date = dMatch[1];
    const parts = String(t.description).split("|").map((s) => s.trim());
    if (parts.length >= 2) agency = parts[1] || agency;
    if (parts.length >= 3) scope = parts[2] || scope;
  }
  if (!date && t.createdAt) date = new Date(t.createdAt).toISOString();
  return {
    auditId: t.id,
    ticketId: t.id,
    agency,
    scope,
    date,
    status: (t.status || "PENDING").toUpperCase(),
    notes: t.userAgent || null,
    brokerGtid: t.tenantGtid,
    createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : null,
    resolvedAt: t.resolvedAt ? new Date(t.resolvedAt).toISOString() : null,
  };
}

export async function GET(req: NextRequest) {
  try {
    const brokerGtid = req.nextUrl.searchParams.get("brokerGtid");
    if (!brokerGtid) {
      return NextResponse.json({ ok: false, error: "brokerGtid required" }, { status: 400 });
    }
    const tickets = await db.feedbackTicket.findMany({
      where: { tenantGtid: brokerGtid, type: "AUDIT_INVITATION" },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const invitations = tickets.map(parseAuditTicket);
    return NextResponse.json({ ok: true, count: invitations.length, invitations });
  } catch (e: any) {
    logger.error("[audit/invitations/GET] error:", e);
    return NextResponse.json({ error: e?.message || "fetch failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
    }
    const auditId = String(body.auditId || body.ticketId || "");
    const brokerGtid = String(body.brokerGtid || "");
    const action = String(body.action || "").toLowerCase();
    const notes = body.notes ? String(body.notes) : null;
    if (!auditId || !brokerGtid || !action) {
      return NextResponse.json(
        { ok: false, error: "auditId, brokerGtid, action required" },
        { status: 400 },
      );
    }
    const newStatusMap: Record<string, string> = {
      accept: "ACCEPTED",
      accepted: "ACCEPTED",
      decline: "DECLINED",
      declined: "DECLINED",
      complete: "COMPLETED",
      completed: "COMPLETED",
    };
    const newStatus = newStatusMap[action];
    if (!newStatus) {
      return NextResponse.json(
        { ok: false, error: `unsupported action: ${action}` },
        { status: 400 },
      );
    }

    const ticket = await db.feedbackTicket.findUnique({
      where: { id: auditId },
      select: { id: true, tenantGtid: true, subject: true, description: true },
    });
    if (!ticket) {
      return NextResponse.json({ ok: false, error: "audit invitation not found" }, { status: 404 });
    }
    if (ticket.tenantGtid !== brokerGtid) {
      return NextResponse.json({ ok: false, error: "audit invitation does not belong to this broker" }, { status: 403 });
    }

    await db.feedbackTicket.update({
      where: { id: auditId },
      data: {
        status: newStatus,
        resolvedAt: ["ACCEPTED", "DECLINED", "COMPLETED"].includes(newStatus) ? new Date() : undefined,
        userAgent: notes || undefined,
      },
    });

    let activityId: string | undefined;
    try {
      const a = await db.activity.create({
        data: {
          tradeId: null,
          actorGtid: brokerGtid,
          action: `AUDIT_${newStatus}`,
          description: `Broker ${brokerGtid} ${action}ed audit ${auditId} (${ticket.subject || "—"})${notes ? ` — notes: ${notes}` : ""}`,
          type: "INFO",
        },
      });
      activityId = a.id;
    } catch { /* best-effort */ }

    return NextResponse.json({ ok: true, auditId, newStatus, activityId });
  } catch (e: any) {
    logger.error("[audit/invitations/POST] error:", e);
    return NextResponse.json({ error: e?.message || "action failed" }, { status: 500 });
  }
}
