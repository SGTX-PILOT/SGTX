// @ts-nocheck
// DCSA Commercial Schedules API
import { NextRequest, NextResponse } from "next/server";
import { createCommercialSchedule, getCommercialSchedules } from "@/lib/sgtx/dcsa";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filters: any = {};
    const carrierGtid = searchParams.get("carrierGtid");
    const polUnlocode = searchParams.get("polUnlocode");
    const podUnlocode = searchParams.get("podUnlocode");
    const scheduleStatus = searchParams.get("scheduleStatus");
    if (carrierGtid) filters.carrierGtid = carrierGtid;
    if (polUnlocode) filters.polUnlocode = polUnlocode;
    if (podUnlocode) filters.podUnlocode = podUnlocode;
    if (scheduleStatus) filters.scheduleStatus = scheduleStatus;
    const schedules = await getCommercialSchedules(filters);
    return NextResponse.json({ ok: true, schedules });
  } catch (err: any) {
    logger.error("[api/dcsa/schedules] GET failed", { error: err?.message });
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const schedule = await createCommercialSchedule(body);
    return NextResponse.json({ ok: true, schedule });
  } catch (err: any) {
    logger.error("[api/dcsa/schedules] POST failed", { error: err?.message });
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
