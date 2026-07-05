// 7.2 — Nafeza: submit declaration, request certificate, certify
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { submitNafezaDeclaration, requestNafezaCertificate, certifyNafezaDeclaration } from "@/lib/sgtx/government";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;
    if (action === "certificate") {
      const result = await requestNafezaCertificate({ declarationId: body.declarationId, type: body.type, labReportRef: body.labReportRef, ustn: body.ustn });
      if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
      return NextResponse.json(result);
    }
    if (action === "certify") {
      const result = await certifyNafezaDeclaration({ declarationId: body.declarationId, brokerGtid: body.brokerGtid, ustn: body.ustn });
      if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
      return NextResponse.json(result);
    }
    // Default: submit declaration
    const result = await submitNafezaDeclaration(body);
    if (!result.ok) return NextResponse.json({ error: result.reason, fallback: (result as any).fallback }, { status: 400 });
    return NextResponse.json(result);
  } catch (e: any) { logger.error("[government/nafeza]", e); return NextResponse.json({ error: e.message }, { status: 500 }); }
}
