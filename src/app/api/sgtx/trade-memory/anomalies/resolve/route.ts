import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// SGTX Anomaly Detection (Blueprint Part 19)
// POST /api/sgtx/trade-memory/anomalies/resolve — mark an anomaly resolved.
//
// Body: { anomalyId }
// Sets resolvedAt = now(). Idempotent — re-resolving an already-resolved
// anomaly is a no-op (still returns 200 ok).

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { anomalyId } = body as { anomalyId?: string };
    if (!anomalyId || typeof anomalyId !== "string") {
      return NextResponse.json({ error: "anomalyId is required" }, { status: 400 });
    }

    const existing = await db.anomalyDetectionLog.findUnique({
      where: { id: anomalyId },
      select: { id: true, resolvedAt: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Anomaly not found" }, { status: 404 });
    }
    if (existing.resolvedAt) {
      // Idempotent — already resolved.
      return NextResponse.json({ ok: true, resolvedAt: existing.resolvedAt });
    }

    const now = new Date();
    await db.anomalyDetectionLog.update({
      where: { id: anomalyId },
      data: { resolvedAt: now },
    });

    return NextResponse.json({ ok: true, resolvedAt: now });
  } catch (e: any) {
    console.error("[trade-memory/anomalies/resolve] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to resolve anomaly" },
      { status: 500 },
    );
  }
}
