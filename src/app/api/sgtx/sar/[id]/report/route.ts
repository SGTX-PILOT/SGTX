// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { generateSarReport } from "@/lib/sgtx/sar/fiu-filing";

export const dynamic = "force-dynamic";

// GET /api/sgtx/sar/[id]/report — Generate SAR report for FIU submission (v17 §3.5)
//
// Query params:
//   ?format=PDF|XML|JSON  (default: derived from jurisdiction — EG→PDF, EU→XML, US→XML, etc.)
//
// Returns the SAR report as a base64-encoded payload (signed):
//   {
//     "reportBase64": "<base64>",
//     "format": "PDF"|"XML"|"JSON",
//     "signed": true,
//     "signedAt": <ISO-8601>,
//     "signatureAlgorithm": "ed25519+dilithium3-hybrid (simulated)",
//     "keyId": "sgtx-pqc-dilithium3-001",
//     "loomHash": "sha256:...",
//     "contentType": "application/pdf"|"application/xml"|"application/json",
//     "filename": "SAR-EG-<sarId>.pdf",
//     "generatedAt": <ISO-8601>,
//     "simulated": true
//   }
//
// Public read endpoint — the SAR id acts as a capability token. Rate-limited
// 30 req/min/IP via the middleware anonymous bucket (lower because report
// generation is more expensive than status query).
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    if (!id) {
      return NextResponse.json({ error: "SAR id required" }, { status: 400 });
    }
    const sp = req.nextUrl.searchParams;
    const formatParam = sp.get("format")?.toUpperCase() as "PDF" | "XML" | "JSON" | null;
    const format = formatParam && ["PDF", "XML", "JSON"].includes(formatParam) ? formatParam : undefined;

    const report = await generateSarReport(id, format);
    return NextResponse.json(report, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (e: any) {
    logger.error("[api/sgtx/sar/[id]/report] error:", { error: e?.message || String(e) });
    const status = e?.message?.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: e?.message || "SAR report generation failed" }, { status });
  }
}
