import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getDeclarationStatus } from "@/lib/sgtx/gov";

// GET /api/sgtx/gov/nafeza/declaration/[id]/status — poll Nafeza declaration lifecycle (Blueprint 7.2.4)
//
// Path param:
//   id — Nafeza declaration ID returned by POST /api/sgtx/gov/nafeza/declare
//
// Returns: { ok, declarationId, status, clearanceStatus }
//   status cycles: SUBMITTED → ASSESSED → CLEARED (based on age of declaration id)
//   clearanceStatus: PENDING_INSPECTION | CLEARED | undefined
//
// Per Blueprint 7.2.4 SGTX polls this endpoint every 30 minutes after submission
// to detect when the declaration has transitioned to CLEARED. When certificates
// are issued alongside the declaration, the caller polls the certificate
// request_ids (returned by /nafeza/declare) via /api/sgtx/gov/nafeza/certificate.

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: "Missing path parameter: id (declaration ID)" },
        { status: 400 }
      );
    }

    const result = await getDeclarationStatus(id);

    return NextResponse.json({
      ok: true,
      declarationId: id,
      status: result.status,
      clearanceStatus: result.clearanceStatus ?? null,
      polledAt: new Date().toISOString(),
    });
  } catch (e: any) {
    logger.error("[gov/nafeza/declaration/[id]/status GET] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to fetch declaration status" },
      { status: 500 }
    );
  }
}
