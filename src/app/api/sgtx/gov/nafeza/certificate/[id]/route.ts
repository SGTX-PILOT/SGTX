import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { downloadCertificate } from "@/lib/sgtx/gov";

// GET /api/sgtx/gov/nafeza/certificate/[id] — download an issued Nafeza certificate PDF + SHA-256 hash
//
// Path param:
//   id — certificate ID (returned by POST /api/sgtx/gov/nafeza/certificate)
//
// Query params:
//   format — "json" (default) | "raw"
//     json → returns { ok, certificateId, pdfBase64, certificateHash, downloadedAt }
//     raw  → returns the PDF bytes directly with Content-Type application/pdf
//
// Per Blueprint 7.2.4, when Nafeza issues a certificate SGTX downloads the PDF
// and stores it with a SHA-256 hash. This endpoint exposes that download so
// SGTX trade-side callers can persist the PDF + hash in the documents table
// against the USTN.

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: "Missing path parameter: id (certificate ID)" },
        { status: 400 }
      );
    }

    const format = new URL(req.url).searchParams.get("format") ?? "json";
    const result = await downloadCertificate(id);

    if (format === "raw") {
      const pdfBytes = Buffer.from(result.pdfBase64, "base64");
      return new NextResponse(pdfBytes, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${id}.pdf"`,
          "X-Certificate-Hash": result.certificateHash,
          "X-Certificate-Id": result.certificateId,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      certificateId: result.certificateId,
      pdfBase64: result.pdfBase64,
      certificateHash: result.certificateHash,
      downloadedAt: result.downloadedAt,
    });
  } catch (e: any) {
    logger.error("[gov/nafeza/certificate/[id] GET] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to download certificate" },
      { status: 500 }
    );
  }
}
