import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { revokeGtid, invalidateGtidCache } from "@/lib/sgtx/identity/gtid";

// POST /api/sgtx/gtid/revoke  (Part 2.1.8.3)
// Body: { gtid, revocationType, reason?, revokedBy? }
//
// Revocation triggers per blueprint 2.1.8.3:
//   - TENANT_EXIT       → lifecycle_state = ARCHIVED; resolution returns 404 after 7 days
//   - SANCTIONS_HIT     → lifecycle_state = SUSPENDED; resolution shows sanctions flag
//   - PLATFORM_SUSPENSION → lifecycle_state = SUSPENDED; resolution returns "ACCOUNT_SUSPENDED"
//   - MANUAL_OVERRIDE   → lifecycle_state = ARCHIVED; immediate 404
//
// This endpoint records the revocation in GtidRevocationLog, transitions the
// tenant's lifecycle_state, invalidates the GTID resolution cache, and emits
// a Smart Inbox notification to the affected tenant (when applicable).

const REVOCATION_TO_LIFECYCLE: Record<string, "SUSPENDED" | "ARCHIVED"> = {
  SANCTIONS_HIT: "SUSPENDED",
  PLATFORM_SUSPENSION: "SUSPENDED",
  TENANT_EXIT: "ARCHIVED",
  MANUAL_OVERRIDE: "ARCHIVED",
};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const gtid = (body.gtid || "").trim().toUpperCase();
  const revocationType = (body.revocationType || "").trim().toUpperCase();
  const reason = body.reason || null;
  const revokedBy = body.revokedBy || null;

  if (!gtid) return NextResponse.json({ error: "gtid required" }, { status: 400 });
  if (!REVOCATION_TO_LIFECYCLE[revocationType]) {
    return NextResponse.json({ error: `revocationType must be one of: ${Object.keys(REVOCATION_TO_LIFECYCLE).join(", ")}` }, { status: 400 });
  }

  const tenant = await db.tenant.findUnique({ where: { gtid } });
  if (!tenant) return NextResponse.json({ error: "GTID_NOT_FOUND" }, { status: 404 });

  const fromState = tenant.lifecycleState;
  const toState = REVOCATION_TO_LIFECYCLE[revocationType];

  // Transition tenant lifecycle state + record revocation. The revokeGtid
  // helper writes the GtidRevocationLog row + invalidates the cache; we run
  // it sequentially (not in $transaction) because revokeGtid returns a plain
  // Promise, not a PrismaPromise — $transaction's array form requires the
  // latter. Order matters: lifecycle update first so concurrent resolvers
  // see the new state immediately, then the revocation log.
  await db.tenant.update({ where: { gtid }, data: { lifecycleState: toState } });
  const revocationLog = await revokeGtid(gtid, revocationType, reason || undefined, revokedBy || undefined);

  // Lifecycle history row (Part 2.5)
  await db.tenantLifecycleHistory.create({
    data: { tenantGtid: gtid, fromState, toState, reason: `GTID revocation: ${revocationType} — ${reason || "no reason provided"}`, changedBy: revokedBy },
  }).catch(() => null);

  // Smart Inbox notification to the affected tenant (unless ARCHIVED → no login)
  if (toState === "SUSPENDED") {
    await db.inboxItem.create({
      data: {
        tenantGtid: gtid,
        category: "COMPLIANCE",
        priority: 95,
        title: `Account suspended — ${revocationType}`,
        description: reason || "Your account has been suspended. Contact compliance for details.",
        ctaLabel: "Contact Compliance",
      },
    }).catch(() => null);
  }

  // Activity log
  await db.activity.create({
    data: {
      actorGtid: revokedBy || gtid,
      action: `GTID_REVOKED_${revocationType}`,
      type: toState === "SUSPENDED" ? "WARNING" : "INFO",
      description: `GTID ${gtid} revoked (${revocationType}). Lifecycle: ${fromState} → ${toState}. Reason: ${reason || "n/a"}.`,
      metadata: JSON.stringify({ revocationType, fromState, toState, reason, revokedBy }),
    },
  }).catch(() => null);

  // Invalidate cache (revokeGtid already did this — belt and braces)
  invalidateGtidCache(gtid);

  return NextResponse.json({
    ok: true,
    gtid,
    revocationType,
    fromState,
    toState,
    reason,
    revocation_log_id: revocationLog.id,
    message: `GTID ${gtid} revoked. Lifecycle state: ${fromState} → ${toState}. Resolution will return ${toState === "ARCHIVED" ? "404 (immediate)" : "403 (suspended)"}.`,
  });
}
