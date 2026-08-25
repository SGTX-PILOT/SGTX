// @ts-nocheck
// SGTX v13.1 Art 129 — Stage 1: Negotiation
// GET  /api/sgtx/negotiation/[id]   — fetch a negotiation by id
// PATCH /api/sgtx/negotiation/[id]  — counterparty responds
//   body: { response: "ACCEPTED" | "REJECTED" | "COUNTERED", counterDetails? }
import { NextRequest, NextResponse } from "next/server";
import {
  getNegotiation,
  respondToNegotiation,
} from "@/lib/sgtx/negotiation";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const negotiation = await getNegotiation(id);
    if (!negotiation) {
      return NextResponse.json(
        { error: "negotiation not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, negotiation });
  } catch (err: any) {
    logger.error("[api/sgtx/negotiation/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    if (!body.response || typeof body.response !== "string") {
      return NextResponse.json(
        { error: "response required (ACCEPTED | REJECTED | COUNTERED)" },
        { status: 400 },
      );
    }
    const updated = await respondToNegotiation({
      id,
      response: body.response,
      counterDetails: body.counterDetails || null,
    });
    if (!updated) {
      return NextResponse.json(
        { error: "negotiation not found or update failed" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, negotiation: updated });
  } catch (err: any) {
    logger.error("[api/sgtx/negotiation/[id]] PATCH failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
