import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { requestCertificate } from "@/lib/sgtx/gov";

// POST /api/sgtx/gov/nafeza/certificate — request a customs certificate from Nafeza
// Body: { declarationId: string, certificateType: string }
// certificateType examples: "FORM_D" | "ORIGIN" | "PHYTO" | "HEALTH" | "FUMIGATION"
// Returns: { ok, certificateId, status, pdfUrl, issuedAt, certificateType }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { declarationId, certificateType } = body || {};

    const missing: string[] = [];
    if (!declarationId) missing.push("declarationId");
    if (!certificateType) missing.push("certificateType");
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    const result = await requestCertificate(declarationId, certificateType);

    return NextResponse.json({
      ok: true,
      certificateId: result.certificateId,
      status: result.status,
      pdfUrl: result.pdfUrl,
      issuedAt: new Date().toISOString(),
      certificateType,
    });
  } catch (e: any) {
    logger.error("[gov/nafeza/certificate] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to request certificate" },
      { status: 500 }
    );
  }
}
