// @ts-nocheck
// SGTX v17 §16.7 — Customer Care Chatbot · session collection endpoint
// POST /api/sgtx/customer-care/session          → start a chat session
// GET  /api/sgtx/customer-care/session           → list user/agent sessions
//
// POST body: { userGtid, issue: { category, description, tradeUstn? }, preferredLanguage? }
//   → 200 { ok, sessionId, assignedTo, mode, aiGreeting }
// GET  ?userGtid=X&status=OPEN
//   → 200 { ok, sessions: ChatSession[] }

import { NextRequest, NextResponse } from "next/server";
import {
  startChatSession,
  listUserSessions,
  listAgentSessions,
  type IssueCategory,
} from "@/lib/sgtx/customer-care";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

const VALID_CATEGORIES = new Set<IssueCategory>([
  "missing_document",
  "payment_delay",
  "customs_hold",
  "shipment_delay",
  "qc_dispute",
  "rate_inquiry",
  "status_inquiry",
  "account_access",
  "billing",
  "other",
]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
    }
    const userGtid = String(body.userGtid ?? "");
    if (!userGtid) {
      return NextResponse.json({ ok: false, error: "userGtid required" }, { status: 400 });
    }
    const issue = body.issue;
    if (!issue || !issue.category || !issue.description) {
      return NextResponse.json(
        { ok: false, error: "issue.category + issue.description required" },
        { status: 400 },
      );
    }
    if (!VALID_CATEGORIES.has(issue.category)) {
      return NextResponse.json(
        { ok: false, error: `invalid category: ${issue.category}` },
        { status: 400 },
      );
    }
    const result = await startChatSession(
      userGtid,
      {
        category: issue.category,
        description: String(issue.description),
        tradeUstn: issue.tradeUstn,
      },
      body.preferredLanguage || "en",
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("customer-care.session.post.failed", { err: String(err) });
    return NextResponse.json({ ok: false, error: "start failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userGtid = searchParams.get("userGtid");
    const agentGtid = searchParams.get("agentGtid");
    const status = searchParams.get("status") || undefined;
    if (!userGtid && !agentGtid) {
      return NextResponse.json(
        { ok: false, error: "userGtid or agentGtid required" },
        { status: 400 },
      );
    }
    const result = userGtid
      ? listUserSessions(userGtid, status)
      : listAgentSessions(agentGtid!, status);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("customer-care.session.get.failed", { err: String(err) });
    return NextResponse.json({ ok: false, error: "list failed" }, { status: 500 });
  }
}
