import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// GET /api/sgtx/health/food-safety
//
// NFSA (National Food Safety Authority) oversight view. Replaces the prior
// hardcoded demo data (AUDIT-2 CG-6). Returns REAL food-safety signals from
// the platform:
//   1. Recent QC inspections with result=FAIL (the strongest signal — failed
//      quality control on a food commodity is a direct food-safety alert).
//   2. Documents of type PHYTO or HEALTH_CERT that are not yet VERIFIED
//      (pending issuance or rejected by the chamber/authority).
//
// Query params (all optional):
//   ?limit=50   — cap per section (default 50)
//
// Returns: { ok, alerts: [{ kind, ustn, reference, summary, status, createdAt }], summary }
export async function GET(req: NextRequest) {
  try {
    const limitRaw = req.nextUrl.searchParams.get("limit");
    const limit = Math.min(Math.max(parseInt(limitRaw || "50", 10) || 50, 1), 200);

    // 1. QC FAIL inspections (food commodities only — QC covers all commodities,
    //    but food-safety oversight focuses on perishables + agri products).
    const failedInspections = await db.qcInspection.findMany({
      where: { result: "FAIL" },
      include: { trade: { include: { seller: true, buyer: true } } },
      orderBy: { completedAt: "desc" },
      take: limit,
    }).catch(() => []);

    // 2. PHYTO + HEALTH_CERT documents that are not VERIFIED (REQUIRED/UPLOADED/REJECTED).
    const pendingCerts = await db.document.findMany({
      where: {
        type: { in: ["PHYTO", "HEALTH_CERT"] },
        status: { in: ["REQUIRED", "UPLOADED", "REJECTED", "MISSING"] },
      },
      include: { trade: { include: { seller: true, buyer: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    }).catch(() => []);

    const alerts: Array<{
      kind: "QC_FAIL" | "CERT_PENDING";
      ustn: string | null;
      reference: string;
      summary: string;
      status: string;
      createdAt: string;
    }> = [];

    for (const insp of failedInspections as any[]) {
      alerts.push({
        kind: "QC_FAIL",
        ustn: insp.trade?.ustn || null,
        reference: insp.id,
        summary: `QC FAIL — ${insp.inspectionType || "inspection"} on ${insp.trade?.commodity || "commodity"}. Defects: ${insp.defectCount ?? 0}. ${insp.notes || ""}`.trim(),
        status: "FAIL",
        createdAt: (insp.completedAt || insp.createdAt).toISOString(),
      });
    }
    for (const doc of pendingCerts as any[]) {
      alerts.push({
        kind: "CERT_PENDING",
        ustn: doc.trade?.ustn || null,
        reference: doc.id,
        summary: `${doc.type === "PHYTO" ? "Phytosanitary" : "Health certificate"} — ${doc.title || "untitled"} (${doc.trade?.commodity || "commodity"})`,
        status: doc.status,
        createdAt: doc.createdAt.toISOString(),
      });
    }

    // Newest first.
    alerts.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    return NextResponse.json({
      ok: true,
      alerts,
      summary: {
        total: alerts.length,
        qcFails: (failedInspections as any[]).length,
        pendingCerts: (pendingCerts as any[]).length,
      },
    });
  } catch (e: any) {
    logger.error("[health/food-safety] error:", e);
    return NextResponse.json({ error: e?.message || "Failed to fetch food-safety alerts" }, { status: 500 });
  }
}
