// SGTX EU Pesticides Daily Sync Cron
// Runs daily to fetch the latest EU Pesticide MRL data from ec.europa.eu
// and pushes it to the SGTX Brain OS (knowledge graph + event bus).

import { NextRequest, NextResponse } from "next/server";
import { syncEuPesticides } from "@/lib/sgtx/compliance/eu-pesticides-client";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const lastSync = await db.euPesticideSyncLog.findFirst({ orderBy: { syncedAt: "desc" } });
  if (lastSync) {
    const hoursSinceSync = (Date.now() - lastSync.syncedAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceSync < 12) {
      return NextResponse.json({
        ok: true,
        message: `Sync already run ${hoursSinceSync.toFixed(1)}h ago.`,
        lastSync: { syncedAt: lastSync.syncedAt, productsCount: lastSync.productsCount, residuesCount: lastSync.residuesCount, mrlsCount: lastSync.mrlsCount },
      });
    }
  }

  try {
    const result = await syncEuPesticides();

    // Push to Brain OS
    try {
      const { eventBus } = await import("@/lib/sgtx/brain-os/core/event-bus");
      await eventBus.publish("eu.pesticides.synced", "eu-pesticides-database", {
        productsCount: result.productsCount,
        residuesCount: result.residuesCount,
        mrlsCount: result.mrlsCount,
        errors: result.errors.length,
        syncedAt: result.syncedAt,
      }, { source: "eu-pesticides-sync-cron" });
    } catch { /* non-fatal */ }

    return NextResponse.json({
      ok: true,
      result: {
        productsCount: result.productsCount,
        residuesCount: result.residuesCount,
        mrlsCount: result.mrlsCount,
        errors: result.errors.length,
        durationMs: result.durationMs,
        syncedAt: result.syncedAt,
        firstErrors: result.errors.slice(0, 5),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function GET() {
  const lastSync = await db.euPesticideSyncLog.findFirst({ orderBy: { syncedAt: "desc" } });
  const productCount = await db.euPesticideProduct.count();
  const residueCount = await db.euPesticideResidue.count();
  const mrlCount = await db.euPesticideMrl.count();

  return NextResponse.json({
    ok: true,
    lastSync: lastSync ? {
      syncedAt: lastSync.syncedAt,
      productsCount: lastSync.productsCount,
      residuesCount: lastSync.residuesCount,
      mrlsCount: lastSync.mrlsCount,
      errorCount: lastSync.errorCount,
      durationMs: lastSync.durationMs,
    } : null,
    currentDbState: { products: productCount, residues: residueCount, mrls: mrlCount },
    nextScheduledSync: lastSync
      ? new Date(lastSync.syncedAt.getTime() + 24 * 60 * 60 * 1000).toISOString()
      : "immediate",
  });
}
