// @ts-nocheck
// POST /api/sgtx/jurisdiction/sources
// Body: {
//   jurisdictionCode?: string,   // links source to a jurisdiction by code
//   jurisdictionId?: string,    // OR direct id (one of the two)
//   sourceType: string,         // LAW | REGULATION | CUSTOMS_TARIFF | ...
//   title: string,
//   officialUrl?: string,
//   publicationDate?: string (ISO),
//   effectiveDate?: string (ISO),
//   expiryDate?: string (ISO),
//   sourceHash?: string,        // SHA-256 of the source document
//   authority?: string,
//   language?: string,
//   legalStatus?: string,       // IN_FORCE | SUPERSEDED | REPEALED | DRAFT | PROPOSED
//   verificationStatus?: string, // VERIFIED | UNVERIFIED | STALE | MISSING_SOURCE
//   lastChecked?: string (ISO),
//   description?: string,
// }
// Creates a new RegulatorySource row. Returns the created source.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

function parseDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.sourceType || !body?.title) {
      return NextResponse.json(
        { error: "sourceType and title required" },
        { status: 400 },
      );
    }

    // Resolve jurisdiction — prefer explicit id, fall back to code lookup.
    let jurisdictionId: string | null = body.jurisdictionId || null;
    if (!jurisdictionId && body.jurisdictionCode) {
      try {
        const j = await db.jurisdictionFabric.findUnique({
          where: { code: String(body.jurisdictionCode).toUpperCase() },
          select: { id: true },
        });
        jurisdictionId = j ? j.id : null;
      } catch (e: any) {
        logger.warn(
          "[api/sgtx/jurisdiction/sources] jurisdiction lookup failed",
          { code: body.jurisdictionCode, error: e?.message },
        );
      }
    }

    const created = await db.regulatorySource.create({
      data: {
        jurisdictionId,
        sourceType: String(body.sourceType),
        title: String(body.title),
        officialUrl: body.officialUrl || null,
        publicationDate: parseDate(body.publicationDate),
        effectiveDate: parseDate(body.effectiveDate),
        expiryDate: parseDate(body.expiryDate),
        sourceHash: body.sourceHash || null,
        authority: body.authority || null,
        language: body.language || null,
        legalStatus: body.legalStatus || "IN_FORCE",
        verificationStatus: body.verificationStatus || "UNVERIFIED",
        lastChecked: parseDate(body.lastChecked) || new Date(),
        description: body.description || null,
      },
    });

    logger.info("[api/sgtx/jurisdiction/sources] POST created", {
      id: created.id,
      jurisdictionId,
      sourceType: created.sourceType,
    });
    return NextResponse.json({ source: created });
  } catch (err: any) {
    logger.error("[api/sgtx/jurisdiction/sources] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
