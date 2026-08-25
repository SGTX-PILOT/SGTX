// @ts-nocheck
// SGTX v13.1 Art 129 — Stage 1: Negotiation
// GET  /api/sgtx/negotiation            — list negotiations (optional ?ustn=)
// POST /api/sgtx/negotiation            — create a new negotiation round
import { NextResponse } from "next/server";
import {
  createNegotiation,
  listNegotiations,
  expireStaleNegotiations,
} from "@/lib/sgtx/negotiation";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn") || undefined;
    // Opportunistically expire stale negotiations on each list call.
    // Best-effort — non-blocking.
    try {
      await expireStaleNegotiations();
    } catch {
      // swallow — never break the list call
    }
    const rows = await listNegotiations(ustn);
    return NextResponse.json({
      ok: true,
      negotiations: rows,
      count: rows.length,
      filter: ustn ? { ustn } : null,
    });
  } catch (err: any) {
    logger.error("[api/sgtx/negotiation] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    if (!body.ustn || typeof body.ustn !== "string") {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    if (!body.tradeId || typeof body.tradeId !== "string") {
      return NextResponse.json({ error: "tradeId required" }, { status: 400 });
    }
    if (!body.proposedBy || typeof body.proposedBy !== "string") {
      return NextResponse.json(
        { error: "proposedBy required" },
        { status: 400 },
      );
    }
    if (!body.proposalType || typeof body.proposalType !== "string") {
      return NextResponse.json(
        { error: "proposalType required" },
        { status: 400 },
      );
    }
    if (
      body.proposalDetails === undefined ||
      body.proposalDetails === null
    ) {
      return NextResponse.json(
        { error: "proposalDetails required" },
        { status: 400 },
      );
    }
    const negotiation = await createNegotiation({
      ustn: body.ustn,
      tradeId: body.tradeId,
      proposedBy: body.proposedBy,
      proposalType: body.proposalType,
      proposalDetails: body.proposalDetails,
      expiresAt: body.expiresAt || null,
    });
    if (!negotiation) {
      return NextResponse.json(
        { error: "failed to create negotiation" },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, negotiation }, { status: 201 });
  } catch (err: any) {
    logger.error("[api/sgtx/negotiation] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
