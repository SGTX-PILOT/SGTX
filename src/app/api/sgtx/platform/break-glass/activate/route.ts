// POST /api/sgtx/platform/break-glass/activate
// Body: { targetGtid, triggerReason, severity?, description, initiatedBy, actions?, durationHours? }
//
// Side effects:
//   1. Create BreakGlassEvent (status=ACTIVE, expiresAt = now + durationHours)
//   2. Freeze target tenant → lifecycle_state = SUSPENDED
//   3. Freeze all ACTIVE FeeLocks for the tenant's trades
//   4. Create Governor decision (verdict=DENY for break_glass.deny-all on this tenant)
//   5. Create P0 Incident
//   6. Smart Inbox to all admins + the target tenant
//   7. Anchor in Loom hash chain (loomHash stored on BreakGlassEvent)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createHash } from "crypto";
import { signWithPlatformKeySync } from "@/lib/sgtx/crypto/platform-key";
import {
  generateBreakGlassEventId,
  computeBreakGlassLoomHash,
  getLatestLoomHash,
  TRIGGER_META,
  type BreakGlassTrigger,
  type BreakGlassSeverity,
} from "@/lib/sgtx/platform/break-glass";

const ADMIN_GTID = "SGTX-XX-ADM-000001-CORE";

const VALID_TRIGGERS: BreakGlassTrigger[] = [
  "ACCOUNT_LOCKOUT",
  "SUSPICIOUS_ACTIVITY",
  "COMPLIANCE_FREEZE",
  "COURT_ORDER",
  "TECHNICAL_EMERGENCY",
  "GOVERNOR_OVERRIDE",
];

function sha256(data: string): string {
  return "sha256:" + createHash("sha256").update(data).digest("hex");
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    targetGtid,
    triggerReason,
    severity,
    description,
    initiatedBy,
    actions,
    durationHours,
  } = body as {
    targetGtid?: string;
    triggerReason?: string;
    severity?: string;
    description?: string;
    initiatedBy?: string;
    actions?: string[];
    durationHours?: number;
  };

  if (!targetGtid || !triggerReason || !description || !initiatedBy) {
    return NextResponse.json(
      { error: "targetGtid, triggerReason, description, and initiatedBy are required" },
      { status: 400 },
    );
  }

  if (!VALID_TRIGGERS.includes(triggerReason as BreakGlassTrigger)) {
    return NextResponse.json(
      { error: `triggerReason must be one of: ${VALID_TRIGGERS.join(", ")}` },
      { status: 400 },
    );
  }

  const trigger = triggerReason as BreakGlassTrigger;
  const finalSeverity: BreakGlassSeverity =
    severity === "CRITICAL" || severity === "HIGH"
      ? (severity as BreakGlassSeverity)
      : TRIGGER_META[trigger].defaultSeverity;

  // Validate target tenant exists
  const tenant = await db.tenant.findUnique({ where: { gtid: targetGtid } });
  if (!tenant) {
    return NextResponse.json(
      { error: `Target tenant not found: ${targetGtid}` },
      { status: 404 },
    );
  }

  // Validate initiator is an admin tenant
  const initiator = await db.tenant.findUnique({ where: { gtid: initiatedBy } });
  if (!initiator || initiator.type !== "ADM") {
    return NextResponse.json(
      { error: `initiatedBy must reference an existing ADM tenant (got ${initiatedBy})` },
      { status: 403 },
    );
  }

  const now = new Date();
  const durationH = Math.max(1, Math.min(168, Number(durationHours) || 24)); // 1h..7d clamp
  const expiresAt = new Date(now.getTime() + durationH * 3600 * 1000);
  const eventId = await generateBreakGlassEventId(now);
  const actionsArray = Array.isArray(actions) ? actions : [];

  // 2. Freeze target tenant → SUSPENDED
  //    Capture the previous lifecycle state FIRST so we can restore it on resolve.
  const previousLifecycleState = tenant.lifecycleState;

  // 1. Persist the BreakGlassEvent first (without loomHash — we compute it after).
  //    Store previousLifecycleState so /resolve can restore the tenant to its
  //    exact prior state (VERIFIED, ONBOARDED, etc.) — not always "VERIFIED".
  const event = await db.breakGlassEvent.create({
    data: {
      eventId,
      targetGtid,
      triggerReason: trigger,
      severity: finalSeverity,
      initiatedBy,
      description,
      actions: JSON.stringify(actionsArray),
      status: "ACTIVE",
      expiresAt,
      previousLifecycleState,
    },
  });

  await db.tenant.update({
    where: { gtid: targetGtid },
    data: { lifecycleState: "SUSPENDED" },
  });
  await db.tenantLifecycleHistory.create({
    data: {
      tenantGtid: targetGtid,
      fromState: previousLifecycleState,
      toState: "SUSPENDED",
      reason: `Break-glass ${eventId} (${trigger}) — ${description}`,
      changedBy: initiatedBy,
    },
  });

  // 3. Freeze all ACTIVE FeeLocks for this tenant's trades
  const tenantTrades = await db.trade.findMany({
    where: { OR: [{ buyerGtid: targetGtid }, { sellerGtid: targetGtid }] },
    select: { id: true, ustn: true },
  });
  const tenantUstns = tenantTrades.map((t) => t.ustn);
  const feeLockFreezeResult = tenantUstns.length
    ? await db.feeLock.updateMany({
        where: { ustn: { in: tenantUstns }, status: "ACTIVE" },
        data: { status: "FROZEN", frozenAt: now, frozenReason: `break-glass:${eventId}` },
      })
    : { count: 0 };

  // 4. Create Governor decision (verdict=DENY) anchored in Loom chain
  const previousHash = await getLatestLoomHash();
  const decisionId = `dec-bg-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const decisionPayload = {
    decisionId,
    action: "break_glass.deny_all",
    actorGtid: initiatedBy,
    resourceUstn: undefined,
    payload: { targetGtid, eventId, triggerReason: trigger, severity: finalSeverity },
    verdict: "DENY",
    conditions: [
      {
        condition_id: "break_glass_active",
        label: `Break-glass ${eventId} active on ${targetGtid} — all tenant actions DENIED until resolution.`,
        status: "unmet",
      },
    ],
    previousHash,
  };
  const signature = signWithPlatformKeySync(JSON.stringify(decisionPayload));
  const govLoomHash = sha256((previousHash || "genesis") + JSON.stringify(decisionPayload) + signature);
  await db.governorDecision.create({
    data: {
      decisionId,
      action: "break_glass.deny_all",
      actorGtid: initiatedBy,
      resourceUstn: null,
      payload: JSON.stringify(decisionPayload.payload),
      verdict: "DENY",
      conditions: JSON.stringify(decisionPayload.conditions),
      tenantMessage: `Tenant ${tenant.legalName} is under break-glass ${eventId}. All actions are denied pending review.`,
      loomHash: govLoomHash,
      previousHash,
      signature,
      moduleVersions: JSON.stringify({ break_glass: "v1.0.0-emergency" }),
    },
  });

  // 5. Create P0 Incident
  const incident = await db.incident.create({
    data: {
      severity: "P0",
      title: `Break-Glass Activated — ${tenant.legalName} (${eventId})`,
      description: `Trigger: ${trigger} (${TRIGGER_META[trigger].label}). Severity: ${finalSeverity}. Description: ${description}. Initiated by ${initiatedBy}. Auto-expires at ${expiresAt.toISOString()}.`,
      affectedSystems: JSON.stringify(["tenant-lifecycle", "fealock", "governor", targetGtid]),
      status: "OPEN",
    },
  });

  // 6. Smart Inbox notifications
  //    a) Admin tenant
  await db.inboxItem.create({
    data: {
      tenantGtid: ADMIN_GTID,
      category: "COMPLIANCE",
      priority: 100,
      title: `🚨 Break-Glass ${eventId} ACTIVE — ${tenant.legalName}`,
      description: `Trigger: ${TRIGGER_META[trigger].label}. Severity: ${finalSeverity}. Target: ${targetGtid}. Tenant frozen (SUSPENDED), ${feeLockFreezeResult.count} FeeLock(s) frozen, Governor DENY-all decision recorded, P0 incident ${incident.id} opened. Auto-expires ${expiresAt.toISOString()}.`,
      ctaLabel: "View Break-Glass",
      deadline: expiresAt,
    },
  });
  //    b) Target tenant (so they see why they can't transact)
  await db.inboxItem.create({
    data: {
      tenantGtid: targetGtid,
      category: "COMPLIANCE",
      priority: 100,
      title: `Account Suspended — Break-Glass ${eventId}`,
      description: `Your account has been suspended under break-glass event ${eventId}. Trigger: ${TRIGGER_META[trigger].label}. Reason: ${description}. Please contact compliance. Auto-expires ${expiresAt.toISOString()} unless extended or resolved.`,
      ctaLabel: "Contact Compliance",
      deadline: expiresAt,
    },
  });

  // 7. Anchor in Loom hash chain (chain from Governor decision)
  const bgLoomHash = computeBreakGlassLoomHash(govLoomHash, {
    eventId,
    targetGtid,
    triggerReason: trigger,
    severity: finalSeverity,
    initiatedBy,
    description,
    actions: actionsArray,
    expiresAt: expiresAt.toISOString(),
    incidentId: incident.id,
    governorDecisionId: decisionId,
  });
  const updated = await db.breakGlassEvent.update({
    where: { id: event.id },
    data: { loomHash: bgLoomHash },
  });

  // Activity log
  await db.activity.create({
    data: {
      actorGtid: initiatedBy,
      action: "BREAK_GLASS_ACTIVATED",
      description: `Break-glass ${eventId} activated on ${targetGtid} (trigger: ${trigger}, severity: ${finalSeverity}). ${feeLockFreezeResult.count} FeeLock(s) frozen. P0 incident ${incident.id}. Governor decision ${decisionId}.`,
      type: "CRITICAL",
      metadata: JSON.stringify({ eventId, targetGtid, triggerReason: trigger, severity: finalSeverity, incidentId: incident.id, governorDecisionId: decisionId, feeLocksFrozen: feeLockFreezeResult.count }),
    },
  });

  return NextResponse.json({
    ok: true,
    event: updated,
    sideEffects: {
      tenantLifecycleFrom: previousLifecycleState,
      tenantLifecycleTo: "SUSPENDED",
      feeLocksFrozen: feeLockFreezeResult.count,
      tradesScanned: tenantTrades.length,
      governorDecisionId: decisionId,
      governorLoomHash: govLoomHash,
      incidentId: incident.id,
      loomHash: bgLoomHash,
    },
  });
}
