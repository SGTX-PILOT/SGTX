// @ts-nocheck
// §4 Gap Analysis — list (GET) + create (POST)
// GET  /api/sgtx/integrations/gaps?jurisdictionCode=X&authority=Y&status=Z&priority=W&procedure=V&transportMode=U
// POST /api/sgtx/integrations/gaps  body: CreateGapInput  → createGapRecord
import { NextResponse } from "next/server";
import { listGapRecords, createGapRecord } from "@/lib/sgtx/gap-analysis";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const filters: any = {};
    const jurisdictionCode = url.searchParams.get("jurisdictionCode") || undefined;
    const authority = url.searchParams.get("authority") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const priorityRaw = url.searchParams.get("priority");
    const procedure = url.searchParams.get("procedure") || undefined;
    const transportMode = url.searchParams.get("transportMode") || undefined;
    if (jurisdictionCode) filters.jurisdictionCode = jurisdictionCode;
    if (authority) filters.authority = authority;
    if (status) filters.status = status;
    if (priorityRaw !== null) {
      const n = Number(priorityRaw);
      if (Number.isFinite(n)) filters.priority = n;
    }
    if (procedure) filters.procedure = procedure;
    if (transportMode) filters.transportMode = transportMode;

    const gaps = await listGapRecords(filters);
    return NextResponse.json({ gaps });
  } catch (err: any) {
    logger.error("[api/sgtx/integrations/gaps] GET failed", {
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
    if (!body.jurisdictionCode) {
      return NextResponse.json(
        { error: "jurisdictionCode required" },
        { status: 400 },
      );
    }
    if (!body.authority) {
      return NextResponse.json({ error: "authority required" }, { status: 400 });
    }
    const gap = await createGapRecord(body);
    return NextResponse.json({ gap });
  } catch (err: any) {
    logger.error("[api/sgtx/integrations/gaps] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
