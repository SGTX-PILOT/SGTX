// @ts-nocheck
// SGTX v13.1 Art 129 — Stage 3: Proforma Invoice (by id)
// GET   /api/sgtx/proforma/[id]   — fetch proforma
// PATCH /api/sgtx/proforma/[id]   — lifecycle transition
//   body: { action: "send" | "accept" | "reject" | "convert" }
import { NextRequest, NextResponse } from "next/server";
import {
  getProforma,
  sendProforma,
  acceptProforma,
  rejectProforma,
  convertToInvoice,
} from "@/lib/sgtx/proforma";
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
    const proforma = await getProforma(id);
    if (!proforma) {
      return NextResponse.json(
        { error: "proforma not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, proforma });
  } catch (err: any) {
    logger.error("[api/sgtx/proforma/[id]] GET failed", {
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
    const action = String(body.action || "").toLowerCase();
    if (!action) {
      return NextResponse.json(
        { error: "action required (send | accept | reject | convert)" },
        { status: 400 },
      );
    }
    if (action === "send") {
      const proforma = await sendProforma(id);
      if (!proforma) {
        return NextResponse.json(
          { error: "proforma not found or update failed" },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true, proforma });
    }
    if (action === "accept") {
      const proforma = await acceptProforma(id);
      if (!proforma) {
        return NextResponse.json(
          { error: "proforma not found or update failed" },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true, proforma });
    }
    if (action === "reject") {
      const proforma = await rejectProforma(id);
      if (!proforma) {
        return NextResponse.json(
          { error: "proforma not found or update failed" },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true, proforma });
    }
    if (action === "convert") {
      const { proforma, invoice } = await convertToInvoice(id);
      if (!proforma) {
        return NextResponse.json(
          { error: "proforma not found or update failed" },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true, proforma, invoice });
    }
    return NextResponse.json(
      { error: `unknown action: ${action}` },
      { status: 400 },
    );
  } catch (err: any) {
    logger.error("[api/sgtx/proforma/[id]] PATCH failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
