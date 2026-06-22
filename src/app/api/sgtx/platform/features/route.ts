import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { freshDb } from "@/lib/db-fresh";
import { seedFeatureToggles, invalidateFeatureCache } from "@/lib/sgtx/platform/feature-check";

const _db = (freshDb ?? db) as typeof db;

// GET /api/sgtx/platform/features — List all feature toggles
export async function GET(req: NextRequest) {
  const seed = req.nextUrl.searchParams.get("seed");
  if (seed === "true") {
    const result = await seedFeatureToggles();
    return NextResponse.json(result);
  }
  const features = await _db.platformFeatureToggle.findMany({ orderBy: { featureCategory: "asc" } });
  const activeCount = features.filter(f => f.isActive).length;
  return NextResponse.json({ ok: true, features, total: features.length, activeCount, inactiveCount: features.length - activeCount });
}

// POST /api/sgtx/platform/features/seed — Seed all default feature toggles
export async function POST(req: NextRequest) {
  const result = await seedFeatureToggles();
  return NextResponse.json(result);
}
