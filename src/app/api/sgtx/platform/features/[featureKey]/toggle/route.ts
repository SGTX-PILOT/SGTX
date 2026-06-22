import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { freshDb } from "@/lib/db-fresh";
import { invalidateFeatureCache } from "@/lib/sgtx/platform/feature-check";

const _db = (freshDb ?? db) as typeof db;

// POST /api/sgtx/platform/features/[featureKey]/toggle — Toggle a feature on/off
export async function POST(req: NextRequest, { params }: { params: Promise<{ featureKey: string }> }) {
  const { featureKey } = await params;
  const body = await req.json().catch(() => ({}));
  const activate = body.activate !== false;
  const adminGtid = body.adminGtid || "SGTX-XX-ADM-000001-CORE";
  const reason = body.reason || (activate ? "Reactivated" : "Deactivated for maintenance");

  const feature = await _db.platformFeatureToggle.findUnique({ where: { featureKey } });
  if (!feature) return NextResponse.json({ error: `Feature "${featureKey}" not found. Call /seed first.` }, { status: 404 });

  if (!activate && !feature.canDeactivate) {
    return NextResponse.json({ error: `Feature "${feature.featureName}" cannot be deactivated (core platform feature).` }, { status: 403 });
  }

  if (feature.isActive === activate) {
    return NextResponse.json({ ok: true, message: `Feature already ${activate ? "active" : "inactive"}`, feature });
  }

  const updated = await _db.platformFeatureToggle.update({
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
  await _db.activity.create({
    data: {
      actorGtid: adminGtid,
      action: activate ? "FEATURE_REACTIVATED" : "FEATURE_DEACTIVATED",
      type: activate ? "SUCCESS" : "WARNING",
      description: `Platform feature "${feature.featureName}" (${featureKey}) ${activate ? "reactivated" : "deactivated"} by ${adminGtid}. Reason: ${reason}`,
    },
  }).catch(() => null);

  // Smart Inbox to all admins
  await _db.inboxItem.create({
    data: {
      tenantGtid: "SGTX-EG-GOV-000001-9A0B",
      category: "COMPLIANCE",
      priority: activate ? 70 : 90,
      title: `Feature ${activate ? "Reactivated" : "Deactivated"}: ${feature.featureName}`,
      description: `${feature.featureName} (${feature.featureCategory}) has been ${activate ? "reactivated" : "deactivated"}. Reason: ${reason}. ${activate ? "All related endpoints are now available." : "All related endpoints will return 503."}`,
      ctaLabel: "View Features",
    },
  }).catch(() => null);

  return NextResponse.json({ ok: true, feature: updated, message: `Feature "${feature.featureName}" ${activate ? "activated" : "deactivated"}.` });
}
