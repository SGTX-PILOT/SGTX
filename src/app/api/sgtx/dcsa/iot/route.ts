// @ts-nocheck
// DCSA IoT API — record and query container telemetry
import { NextRequest, NextResponse } from "next/server";
import { recordIoTReading, getIoTReadings } from "@/lib/sgtx/dcsa";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filters: any = {};
    const ustn = searchParams.get("ustn");
    const containerId = searchParams.get("containerId");
    const source = searchParams.get("source");
    const limit = searchParams.get("limit");
    if (ustn) filters.ustn = ustn;
    if (containerId) filters.containerId = containerId;
    if (source) filters.source = source;
    if (limit) filters.limit = parseInt(limit);
    const readings = await getIoTReadings(filters);
    return NextResponse.json({ ok: true, readings });
  } catch (err: any) {
    logger.error("[api/dcsa/iot] GET failed", { error: err?.message });
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const reading = await recordIoTReading(body);
    return NextResponse.json({ ok: true, reading });
  } catch (err: any) {
    logger.error("[api/dcsa/iot] POST failed", { error: err?.message });
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
