// POST /api/sgtx/platform/features/seed
// Idempotently seeds all default platform feature toggles (active by default).
// Safe to call multiple times — existing rows are preserved.
import { NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
import { PLATFORM_FEATURES } from "@/lib/sgtx/platform/feature-registry";
import { invalidateFeatureCache } from "@/lib/sgtx/platform/feature-check";

export async function POST() {
  const created: string[] = [];
  const existing: string[] = [];

  for (const spec of PLATFORM_FEATURES) {
    const found = await db.platformFeatureToggle.findUnique({
      where: { featureKey: spec.featureKey },
    });
    if (found) {
      existing.push(spec.featureKey);
      continue;
    }
    await db.platformFeatureToggle.create({
      data: {
        featureKey: spec.featureKey,
        featureName: spec.featureName,
        featureCategory: spec.featureCategory,
        isActive: true,
        canDeactivate: spec.canDeactivate,
      },
    });
    created.push(spec.featureKey);
  }

  invalidateFeatureCache();

  return NextResponse.json({
    ok: true,
    seeded: created.length,
    alreadyExisted: existing.length,
    total: PLATFORM_FEATURES.length,
    created,
  });
}
