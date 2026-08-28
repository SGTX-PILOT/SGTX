// @ts-nocheck
// SGTX Part 103 — Trade Lane Passport Generator
// GET /api/sgtx/trade-lane-passport?origin=EG&destination=DE&transit=&hsCode=&mode=SEA&incoterm=CIF
import { NextResponse } from "next/server";
import { generatePassport } from "@/lib/sgtx/trade-lane-passport";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const origin = url.searchParams.get("origin");
    const destination = url.searchParams.get("destination");
    const transitRaw = url.searchParams.get("transit") || "";
    const hsCode = url.searchParams.get("hsCode") || "";
    const mode = url.searchParams.get("mode") || "SEA";
    const incoterm = url.searchParams.get("incoterm") || "CIF";

    if (!origin || !destination) {
      return NextResponse.json({ error: "origin and destination required (ISO2)" }, { status: 400 });
    }
    const transit = transitRaw ? transitRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const passport = await generatePassport(origin, destination, transit, hsCode, mode, incoterm);
    return NextResponse.json({ ok: true, passport });
  } catch (err: any) {
    logger.error("[api/sgtx/trade-lane-passport] GET failed", { error: err?.message });
    return NextResponse.json({ error: err?.message || "internal error" }, { status: 500 });
  }
}
