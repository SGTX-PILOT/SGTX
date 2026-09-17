// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import {
  constructPaymentManifest,
  getPaymentManifest,
} from "@/lib/sgtx/payment-manifest";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/sgtx/payment-manifest — construct (or re-construct) the
// payment manifest for a USTN. v18 §8.9 — the single financial
// contract of the USTN.
// Body: { ustn }
// → { ok, manifestId, manifestVersion, manifestHash, totalEgp,
//     totalUsd, egpLegs, usdLegs }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  if (!body.ustn) {
    return NextResponse.json({ error: "ustn required" }, { status: 400 });
  }
  try {
    const result = await constructPaymentManifest(body.ustn);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    if (e.message && /not found/i.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: 404 });
    }
    logger.error("[api/payment-manifest] POST construct failed", { error: e?.message });
    return NextResponse.json({ error: e?.message || "construct failed" }, { status: 500 });
  }
}

// GET /api/sgtx/payment-manifest?ustn=X — retrieve the most recent
// stored manifest for a USTN.
// → { manifest: {...} | null }
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const ustn = url.searchParams.get("ustn");
  if (!ustn) {
    return NextResponse.json({ error: "ustn query param required" }, { status: 400 });
  }
  try {
    const manifest = await getPaymentManifest(ustn);
    return NextResponse.json({ manifest });
  } catch (e: any) {
    logger.error("[api/payment-manifest] GET failed", { error: e?.message });
    return NextResponse.json({ error: e?.message || "fetch failed" }, { status: 500 });
  }
}
