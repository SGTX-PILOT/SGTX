// EU Pesticides Database Status API
// GET /api/sgtx/eu-pesticides/status — full status: counts, last sync, sample data

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchMrlDownloadList } from "@/lib/sgtx/compliance/eu-pesticides-client";

export const dynamic = "force-dynamic";

export async function GET() {
  const productCount = await db.euPesticideProduct.count();
  const residueCount = await db.euPesticideResidue.count();
  const mrlCount = await db.euPesticideMrl.count();
  const lastSync = await db.euPesticideSyncLog.findFirst({ orderBy: { syncedAt: "desc" } });
  const syncHistory = await db.euPesticideSyncLog.findMany({ orderBy: { syncedAt: "desc" }, take: 5 });

  // Sample products (top-level categories)
  const sampleProducts = await db.euPesticideProduct.findMany({
    where: { parentId: null },
    take: 10,
    orderBy: { productCode: "asc" },
  });

  // Sample residues
  const sampleResidues = await db.euPesticideResidue.findMany({ take: 10 });

  // Check EU API availability + get latest publication files
  let euApiAvailable = false;
  let publicationFiles: any[] = [];
  try {
    publicationFiles = await fetchMrlDownloadList();
    euApiAvailable = true;
  } catch { /* EU API unreachable */ }

  return NextResponse.json({
    ok: true,
    database: {
      products: productCount,
      residues: residueCount,
      mrls: mrlCount,
      targetProducts: 381,
      targetResidues: 679,
      targetMrls: 258599,
      coveragePct: productCount > 0 ? Math.round((mrlCount / 258599) * 100) : 0,
    },
    lastSync: lastSync ? {
      syncedAt: lastSync.syncedAt,
      productsCount: lastSync.productsCount,
      residuesCount: lastSync.residuesCount,
      mrlsCount: lastSync.mrlsCount,
      errorCount: lastSync.errorCount,
      durationMs: lastSync.durationMs,
    } : null,
    syncHistory: syncHistory.map(s => ({
      syncedAt: s.syncedAt,
      mrlsCount: s.mrlsCount,
      errorCount: s.errorCount,
      durationMs: s.durationMs,
    })),
    euApi: {
      available: euApiAvailable,
      baseUrl: "https://ec.europa.eu/food/plant/pesticides/eu-pesticides-database/backend/api",
      publicationFiles,
    },
    sampleProducts: sampleProducts.map(p => ({ code: p.productCode, name: p.productName })),
    sampleResidues: sampleResidues.map(r => ({ id: r.pestResId, name: r.pestResName })),
    nextSync: lastSync
      ? new Date(lastSync.syncedAt.getTime() + 24 * 60 * 60 * 1000).toISOString()
      : "immediate (call POST /api/sgtx/eu-pesticides/sync)",
  });
}
