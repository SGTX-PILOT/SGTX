// @ts-nocheck
// GET  /api/sgtx/road-corridor/driver — list drivers (filter by ownerGtid)
// POST /api/sgtx/road-corridor/driver — register a driver
//
// Blueprint v13.1 FINAL — Article 46 (Driver Authorization). Validates passport,
// license, visa countries, DG authorization, international license.

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  registerDriver,
  listDrivers,
} from "@/lib/sgtx/road-corridor/mvp";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const ownerGtid = url.searchParams.get("ownerGtid") || undefined;
    const drivers = await listDrivers(ownerGtid);
    return NextResponse.json({ drivers, count: drivers.length });
  } catch (e: any) {
    logger.error("[api/road-corridor/driver] GET list failed", { error: e?.message || String(e) });
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const driver = await registerDriver(body || {});
    if (!driver) {
      return NextResponse.json(
        { error: "Failed to register driver (check required field: fullName)" },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true, driver }, { status: 201 });
  } catch (e: any) {
    logger.error("[api/road-corridor/driver] POST register failed", { error: e?.message || String(e) });
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
