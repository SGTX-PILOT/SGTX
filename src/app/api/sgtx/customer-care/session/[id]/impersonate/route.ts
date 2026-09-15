// @ts-nocheck
// SGTX v17 §16.7 — Customer Care Chatbot · impersonation endpoint
// POST /api/sgtx/customer-care/session/<id>/impersonate
//   body: {
//     userGtid: string,           // user being impersonated
//     pin: string,                // 6-10 digit PIN (user-supplied out-of-band)
//     scope?: "READ_ONLY" | "DOCUMENT_SUBMIT" | "PAYMENT_AUTH",  // default READ_ONLY
//     requestingAgentGtid?: string
//   }
//   → 200 {
//       ok,
//       approved: boolean,
//       scope,
//       duration,            // minutes (max 30)
//       expiresAt: string,   // ISO
//       reason?: string
//     }
//
// Per v17 §16.7, every impersonation is:
//   - PIN-protected (PBKDF2-SHA256 with per-user salt)
//   - Logged with full audit trail
//   - Time-limited (30 minutes max — auto-expires)
//   - Scope-limited (READ_ONLY or specific actions)

import { NextRequest, NextResponse } from "next/server";
import {
  requestImpersonation,
  endImpersonation,
  recordImpersonationAction,
  type ImpersonationScope,
} from "@/lib/sgtx/customer-care";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

const VALID_SCOPES = new Set<ImpersonationScope>([
  "READ_ONLY",
  "DOCUMENT_SUBMIT",
  "PAYMENT_AUTH",
]);

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
    }
    const userGtid = String(body.userGtid ?? "");
    const pin = String(body.pin ?? "");
    if (!userGtid) {
      return NextResponse.json({ ok: false, error: "userGtid required" }, { status: 400 });
    }
    if (!/^\d{6,10}$/.test(pin)) {
      return NextResponse.json(
        { ok: false, error: "pin must be 6-10 digits" },
        { status: 400 },
      );
    }
    const scope: ImpersonationScope = (body.scope as ImpersonationScope) || "READ_ONLY";
    if (!VALID_SCOPES.has(scope)) {
      return NextResponse.json(
        { ok: false, error: `invalid scope: ${scope}` },
        { status: 400 },
      );
    }
    const result = requestImpersonation(id, userGtid, pin, scope, body.requestingAgentGtid);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("customer-care.impersonate.post.failed", { err: String(err) });
    return NextResponse.json({ ok: false, error: "impersonation failed" }, { status: 500 });
  }
}

// DELETE — end impersonation early (agent or system)
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const result = endImpersonation(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("customer-care.impersonate.delete.failed", { err: String(err) });
    return NextResponse.json({ ok: false, error: "end failed" }, { status: 500 });
  }
}
