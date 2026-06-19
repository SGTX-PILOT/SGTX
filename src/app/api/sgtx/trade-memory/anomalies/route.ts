import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// SGTX Anomaly Detection (Blueprint Part 19)
// GET /api/sgtx/trade-memory/anomalies — list anomalies.
//
// Query params (any combination):
//   ?entityType=...   filter by entity type
//   ?severity=...     filter by severity (LOW | MEDIUM | HIGH | CRITICAL)
//   ?resolved=false   "true" → only resolved; "false" → only unresolved;
//                     omit → all
//   ?limit=50         default 50, capped at 500

const VALID_SEVERITIES = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const entityType = sp.get("entityType") || undefined;
    const severity = sp.get("severity") || undefined;
    const resolvedParam = sp.get("resolved");

    const rawLimit = Number.parseInt(sp.get("limit") || "50", 10);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(500, rawLimit)) : 50;

    if (severity && !VALID_SEVERITIES.has(severity)) {
      return NextResponse.json(
        { error: `severity must be one of: ${[...VALID_SEVERITIES].join(", ")}` },
        { status: 400 },
      );
    }

    const where: Record<string, unknown> = {};
    if (entityType) where.entityType = entityType;
    if (severity) where.severity = severity;
    if (resolvedParam === "true") {
      where.resolvedAt = { not: null };
    } else if (resolvedParam === "false") {
      where.resolvedAt = null;
    }

    const anomalies = await db.anomalyDetectionLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ anomalies });
  } catch (e: any) {
    console.error("[trade-memory/anomalies] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to list anomalies" },
      { status: 500 },
    );
  }
}
