// @ts-nocheck
// POST /api/sgtx/compliance/ephyto                 — generate a phytosanitary certificate (ISPM 12 XML)
// GET  /api/sgtx/compliance/ephyto?verify=NUMBER   — verify against IPPC ePhyto Hub
import { NextRequest, NextResponse } from "next/server";
import {
  generatePhytosanitaryCertificate,
  verifyPhytosanitaryCertificate,
} from "@/lib/sgtx/compliance/ephyto";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "PhytoData body required" }, { status: 400 });
    }
    const result = await generatePhytosanitaryCertificate(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("ephyto POST failed", { error: e?.message ?? String(e) });
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const cert = (searchParams.get("verify") ?? "").trim();
    if (!cert) {
      return NextResponse.json(
        { ok: false, error: "Required: ?verify=CERTIFICATE_NUMBER" },
        { status: 400 },
      );
    }
    const result = await verifyPhytosanitaryCertificate(cert);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("ephyto GET failed", { error: e?.message ?? String(e) });
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
