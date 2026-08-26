// @ts-nocheck
// SGTX v13.1 Art 129 — Stage 4: Per-trade Regulatory Snapshot
// GET  /api/sgtx/regulatory-snapshot  — list snapshots (filter: ?hsCode=&originCountry=&status=)
// POST /api/sgtx/regulatory-snapshot  — capture a snapshot for a USTN
//   body: { ustn }
import { NextResponse } from "next/server";
import {
  captureSnapshot,
  listSnapshots,
} from "@/lib/sgtx/regulatory-snapshot";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const hsCode = url.searchParams.get("hsCode") || undefined;
    const originCountry = url.searchParams.get("originCountry") || undefined;
    const destinationCountry =
      url.searchParams.get("destinationCountry") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const rows = await listSnapshots({
      hsCode: hsCode || undefined,
      originCountry: originCountry || undefined,
      destinationCountry: destinationCountry || undefined,
      status: status || undefined,
    });
    return NextResponse.json({
      ok: true,
      snapshots: rows,
      count: rows.length,
      filter: { hsCode, originCountry, destinationCountry, status },
    });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory-snapshot] GET failed", {
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
    const snapshot = await captureSnapshot(body.ustn);
    if (!snapshot) {
      return NextResponse.json(
        { error: "failed to capture snapshot (trade not found or table missing)" },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { ok: true, snapshot },
      { status: 201 },
    );
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory-snapshot] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
