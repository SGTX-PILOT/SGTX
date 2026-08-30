// @ts-nocheck
// DCSA JIT Port Call API
import { NextRequest, NextResponse } from "next/server";
import { createJitPortCall, updateJitPortCall } from "@/lib/sgtx/dcsa";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const vesselImo = searchParams.get("vesselImo");
    const portUnlocode = searchParams.get("portUnlocode");
    const where: any = {};
    if (vesselImo) where.vesselImo = vesselImo;
    if (portUnlocode) where.portUnlocode = portUnlocode;
    const calls = await db.dcsaJitPortCall.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 });
    return NextResponse.json({ ok: true, calls });
  } catch (err: any) {
    logger.error("[api/dcsa/jit] GET failed", { error: err?.message });
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === "update") {
      const { id, ...update } = body;
      const jit = await updateJitPortCall(id, update);
      return NextResponse.json({ ok: true, jit });
    }
    const jit = await createJitPortCall(body);
    return NextResponse.json({ ok: true, jit });
  } catch (err: any) {
    logger.error("[api/dcsa/jit] POST failed", { error: err?.message });
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
