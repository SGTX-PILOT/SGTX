// GET /api/sgtx/platform/features/[featureKey] — single feature status
// PATCH /api/sgtx/platform/features/[featureKey] — set isActive true/false (Platform Admin)
//   Body: { isActive: boolean, adminGtid?: string, reason?: string }
import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
import { getFeatureSpec } from "@/lib/sgtx/platform/feature-registry";
import { invalidateFeatureCache } from "@/lib/sgtx/platform/feature-check";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ featureKey: string }> },
) {
  const { featureKey } = await params;
  const spec = getFeatureSpec(featureKey);
  if (!spec) {
    return NextResponse.json(
      { error: `Unknown feature key: ${featureKey}` },
      { status: 404 },
    );
  }

  const row = await db.platformFeatureToggle.findUnique({
    where: { featureKey },
  });

  return NextResponse.json({
    featureKey: spec.featureKey,
    featureName: spec.featureName,
    featureCategory: spec.featureCategory,
    description: spec.description,
    canDeactivate: spec.canDeactivate,
    isActive: row ? row.isActive : true,
    reason: row?.reason ?? null,
    deactivatedAt: row?.deactivatedAt ?? null,
    deactivatedBy: row?.deactivatedBy ?? null,
    reactivatedAt: row?.reactivatedAt ?? null,
    reactivatedBy: row?.reactivatedBy ?? null,
    seeded: !!row,
    config: row?.config ?? null,
    updatedAt: row?.updatedAt ?? null,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ featureKey: string }> },
) {
  const { featureKey } = await params;
  const spec = getFeatureSpec(featureKey);
  if (!spec) {
    return NextResponse.json(
      { error: `Unknown feature key: ${featureKey}` },
      { status: 404 },
    );
  }

  const body = await req.json().catch(() => ({}));
  if (typeof body.isActive !== "boolean") {
    return NextResponse.json(
      { error: "Body must include isActive (boolean)" },
      { status: 400 },
    );
  }

  const activate = body.isActive;
  const adminGtid = body.adminGtid || "SGTX-XX-ADM-000001-CORE";
  const reason = body.reason || (activate ? "Reactivated" : "Deactivated for maintenance");

  // CORE features cannot be deactivated
  if (!activate && !spec.canDeactivate) {
    return NextResponse.json(
      {
        error: `Feature "${spec.featureName}" cannot be deactivated (CORE platform feature).`,
        featureKey,
      },
      { status: 403 },
    );
  }

  const feature = await db.platformFeatureToggle.findUnique({ where: { featureKey } });
  if (!feature) {
    return NextResponse.json(
      { error: `Feature "${featureKey}" not seeded. Call POST /api/sgtx/platform/features?seed=true first.` },
      { status: 404 },
    );
  }

  if (feature.isActive === activate) {
    return NextResponse.json({
      ok: true,
      message: `Feature already ${activate ? "active" : "inactive"}`,
      feature,
    });
  }

  const updated = await db.platformFeatureToggle.update({
    where: { featureKey },
    data: {
      isActive: activate,
      deactivatedAt: activate ? null : new Date(),
      deactivatedBy: activate ? null : adminGtid,
      reactivatedAt: activate ? new Date() : null,
      reactivatedBy: activate ? adminGtid : null,
      reason,
    },
  });

  invalidateFeatureCache();

  // Activity log
  await db.activity.create({
    data: {
      actorGtid: adminGtid,
      action: activate ? "FEATURE_REACTIVATED" : "FEATURE_DEACTIVATED",
      type: activate ? "SUCCESS" : "WARNING",
      description: `Platform feature "${spec.featureName}" (${featureKey}) ${activate ? "reactivated" : "deactivated"} by ${adminGtid}. Reason: ${reason}`,
    },
  }).catch(() => null);

  // Smart Inbox notification to platform admin tenant
  await db.inboxItem.create({
    data: {
      tenantGtid: "SGTX-XX-ADM-000001-CORE",
      category: "COMPLIANCE",
      priority: activate ? 70 : 90,
      title: `Feature ${activate ? "Reactivated" : "Deactivated"}: ${spec.featureName}`,
      description: `${spec.featureName} (${spec.featureCategory}) has been ${activate ? "reactivated" : "deactivated"}. Reason: ${reason}. ${activate ? "All related endpoints are now available." : "All related endpoints will return 503."}`,
      ctaLabel: "View Features",
    },
  }).catch(() => null);

  return NextResponse.json({
    ok: true,
    feature: updated,
    message: `Feature "${spec.featureName}" ${activate ? "activated" : "deactivated"}.`,
  });
}
