// @ts-nocheck
// POST /api/sgtx/compliance/eco                 — generate a Certificate of Origin (ICC WCF eCO XML)
// GET  /api/sgtx/compliance/eco?verify=NUMBER&type=EUR1   — verify against ICC WCF eCO network
import { NextRequest, NextResponse } from "next/server";
import {
  generateCertificateOfOrigin,
  verifyCertificateOfOrigin,
  CertificateOriginType,
} from "@/lib/sgtx/compliance/eco";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "COOData body required" }, { status: 400 });
    }
    const type = (body?.type ?? body?.certificateType ?? "regular") as CertificateOriginType;
    const validTypes: CertificateOriginType[] = ["EUR1", "FormA", "FormE", "GSP", "regular"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { ok: false, error: `type must be one of: ${validTypes.join(", ")}` },
        { status: 400 },
      );
    }
    const data = body?.data ?? body;
    const result = await generateCertificateOfOrigin(data, type);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("eco POST failed", { error: e?.message ?? String(e) });
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const cert = (searchParams.get("verify") ?? "").trim();
    const type = (searchParams.get("type") ?? "regular").trim();
    if (!cert) {
      return NextResponse.json(
        { ok: false, error: "Required: ?verify=CERTIFICATE_NUMBER[&type=EUR1]" },
        { status: 400 },
      );
    }
    const result = await verifyCertificateOfOrigin(cert, type);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("eco GET failed", { error: e?.message ?? String(e) });
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
