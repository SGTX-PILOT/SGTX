import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { resolveDocumentRequirements } from "@/lib/sgtx/trade-request/doc-rules";

// POST /api/sgtx/trade-request/documentation-requirements
// Body: { hsCode, originCountry, destCountry, incoterm, transportMode, coldChain, lcSelected, financingRequested, preferenceAgreement, tradeRequestId? }
// Returns: { ok, requirements: DocumentRequirementSpec[] }
// If tradeRequestId provided, persists requirements to DocumentRequirement table (replaces existing).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      hsCode, originCountry, destCountry, incoterm, transportMode,
      coldChain = false, lcSelected = false, financingRequested = false,
      preferenceAgreement = false, tradeRequestId,
    } = body || {};

    const requirements = resolveDocumentRequirements({
      hsCode, originCountry, destCountry, incoterm, transportMode,
      coldChain, lcSelected, financingRequested, preferenceAgreement,
    });

    // Persist to DB if a trade request id is provided (post-creation save)
    if (tradeRequestId) {
      // Verify trade exists
      const trade = await db.trade.findUnique({ where: { id: tradeRequestId } });
      if (!trade) {
        return NextResponse.json({ error: `Trade ${tradeRequestId} not found` }, { status: 404 });
      }
      // Replace existing requirements
      await db.documentRequirement.deleteMany({ where: { tradeId: tradeRequestId } });
      if (requirements.length > 0) {
        await db.documentRequirement.createMany({
          data: requirements.map(r => ({
            tradeId: tradeRequestId,
            docType: r.docType,
            docName: r.docName,
            trigger: r.trigger,
            mandatory: r.mandatory,
            issuingAuthority: r.issuingAuthority || null,
            format: r.format || null,
            notes: r.notes || null,
          })),
        });
      }
      return NextResponse.json({ ok: true, requirements, persisted: true, tradeRequestId });
    }

    return NextResponse.json({ ok: true, requirements, persisted: false });
  } catch (e: any) {
    logger.error("[doc-requirements] error:", e);
    return NextResponse.json({ error: e.message || "Failed to resolve documentation requirements" }, { status: 500 });
  }
}

// GET /api/sgtx/trade-request/documentation-requirements?tradeRequestId=...
// Returns the persisted document requirements for a trade.
export async function GET(req: NextRequest) {
  const tradeRequestId = req.nextUrl.searchParams.get("tradeRequestId");
  if (!tradeRequestId) return NextResponse.json({ error: "tradeRequestId required" }, { status: 400 });
  const requirements = await db.documentRequirement.findMany({
    where: { tradeId: tradeRequestId },
    orderBy: [{ mandatory: "desc" }, { trigger: "asc" }],
  });
  return NextResponse.json({ ok: true, requirements });
}
