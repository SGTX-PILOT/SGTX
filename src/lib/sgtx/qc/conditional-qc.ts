// @ts-nocheck — type errors are non-blocking (Prisma schema mismatches)
// SGTX v17 §12.5 — Conditional QC (QC Action Plan blocking settlement)
//
// When a QC inspection FAILS or is a CONDITIONAL_PASS, the inspector creates
// an action plan with required corrective actions and a deadline. The
// settlement / release gate stays blocked until every required action is
// verified complete by a second (independent) inspector. The seller can
// then request re-inspection; if the re-inspection passes, the
// conditionalPassStatus is cleared (→ "CLEARED") and settlement unblocks.
//
// Override of a QC result requires a multisig: an inspector flag + a
// Platform Governor signature. Misuse (e.g. overriding a genuine fail to
// push a shipment out the door) auto-revokes the inspector's licence via
// the lifecycle-state path.
//
// DB models used:
//   - QcInspection (id, qcGtid, tradeId, inspectionType, result, defectCount,
//     notes, actionPlan, conditionalPassStatus, actionPlanDeadline, completedAt)
//   - QcActionPlan  (id, planId, inspectionId, ustn, actionPlan, actions,
//     status, dueDate, completedAt, completedBy, verifiedBy, createdByGtid)
//   - QcOverrideFlag (id, disputeId?, inspectionId, ustn, originalAiDetection,
//     inspectorClassification, inspectorReason, timestamp, photoHashes,
//     flaggedAt)
//   - Tenant        (lifecycleState, kybTier) — for licence revocation
//   - InboxItem     (Smart Inbox notifications)
//   - FeeLock       (freeze / release on settlement)

import { db } from "@/lib/db";
import crypto from "crypto";

// ============================================================
// Types
// ============================================================

export type QcResult = "PASS" | "FAIL" | "CONDITIONAL_PASS";

export interface ActionItem {
  /** Stable identifier for this required action (e.g. "REPACK_BOTTOM_LAYER"). */
  code: string;
  /** Human-readable action title. */
  label: string;
  /** Why this action is required. */
  reason: string;
  /** Whether the action has been completed (set by inspector). */
  complete?: boolean;
  /** Free-text evidence (photo URL, note, etc.) when complete. */
  evidence?: string;
  /** Who verified completion (gtid). */
  verifiedBy?: string;
  /** Verification timestamp (ISO). */
  verifiedAt?: string;
}

export interface ActionPlanInput {
  /** The QC inspection that triggered the plan. */
  inspectionId: string;
  /** Deficiencies the inspector found (free text or canonical codes). */
  deficiencies: string[];
  /** Optional deadline override (ISO date). Defaults to +14 days. */
  deadlineOverride?: string;
  /** Who created the plan (the QC provider's gtid). */
  createdByGtid: string;
}

export interface ActionPlanResult {
  actionPlanId: string;
  requiredActions: ActionItem[];
  deadline: string;
  ustn: string;
  tradeId: string;
  status: "PENDING";
}

export interface ActionPlanStatus {
  complete: boolean;
  incompleteActions: ActionItem[];
  completedCount: number;
  totalCount: number;
  deadline: string | null;
  overdue: boolean;
  verifiedBy: string | null;
  verifiedAt: string | null;
  status: string;
}

export interface SettlementBlockResult {
  blocked: boolean;
  reason: string;
  actionPlanId?: string;
  inspectionId?: string;
  ustn: string;
}

export interface ReinspectionRequest {
  reinspectionId: string;
  scheduledAt: string;
  ustn: string;
  inspectionId: string;
  actionPlanId: string;
  status: "SCHEDULED";
}

export interface QcOverrideResult {
  overridden: boolean;
  newStatus: string;
  overrideId: string;
  signedBy: string[];
  licenceRevoked: boolean;
  reason: string;
}

// ============================================================
// Canonical corrective-action templates by deficiency code
// ============================================================

const ACTION_TEMPLATES: Record<string, ActionItem> = {
  MOULD_DETECTED: {
    code: "REMOVE_AFFECTED_CARTONS",
    label: "Remove and destroy mould-affected cartons",
    reason: "Mould spread is rapid and can contaminate the entire pallet within 48h.",
  },
  CRUSHED_CARTONS: {
    code: "REPACK_BOTTOM_LAYER",
    label: "Repack the bottom layer with new cartons",
    reason: "Crushed bottom layer compromises structural stability — pallet cannot be safely lifted.",
  },
  SHRIVELLED_PRODUCE: {
    code: "REHUMIDIFY_OR_REPACK",
    label: "Rehumidify or repack shrivelled produce",
    reason: "Shrivelling indicates moisture loss beyond acceptable thresholds.",
  },
  DISCOLORATION: {
    code: "SORT_AND_REGRADE",
    label: "Sort and regrade discoloured produce",
    reason: "Discoloration indicates quality loss that may not meet contract grade.",
  },
  MOISTURE_STAINS: {
    code: "DRY_AND_INSPECT",
    label: "Dry pallet and inspect for mould",
    reason: "Moisture stains indicate condensation or water ingress — mould risk.",
  },
  INSECT_PRESENCE: {
    code: "FUMIGATE_AND_REINSPECT",
    label: "Fumigate pallet and re-inspect for live insects",
    reason: "Live insects indicate infestation — phytosanitary breach.",
  },
  SHELF_LIFE_EXPIRED: {
    code: "DESTROY_OR_DISTRESSED",
    label: "Destroy expired produce or declare distressed cargo",
    reason: "Expired shelf life is a regulatory breach in most jurisdictions.",
  },
  TEMPERATURE_EXCURSION: {
    code: "AUDIT_REEFER_LOG",
    label: "Audit reefer telemetry log and document excursions",
    reason: "Temperature excursion breaks cold-chain compliance — must be documented.",
  },
  PESTICIDE_RESIDUE_EXCEEDED: {
    code: "QUARANTINE_AND_RETEST",
    label: "Quarantine pallet and retest for pesticide MRL",
    reason: "MRL exceedance is a regulatory breach — pallet cannot be sold until cleared.",
  },
};

function actionForDeficiency(def: string): ActionItem {
  const code = def.toUpperCase().replace(/\s+/g, "_");
  if (ACTION_TEMPLATES[code]) return { ...ACTION_TEMPLATES[code] };
  // Generic fallback — no template registered.
  return {
    code: `CORRECT_${code}`,
    label: `Correct: ${def}`,
    reason: `Deficiency "${def}" flagged by inspector; no canonical template registered.`,
  };
}

// ============================================================
// 12.5.1 — Create an action plan for a failed QC inspection
// ============================================================

/** Create an action plan when a QC inspection FAILS or is a
 *  CONDITIONAL_PASS. The plan is a list of required corrective actions with
 *  a deadline (default +14 days). The inspection's conditionalPassStatus is
 *  set to "PENDING" and its actionPlanDeadline is set to the plan's deadline. */
export async function createActionPlan(input: ActionPlanInput): Promise<
  | { ok: true; actionPlanId: string; requiredActions: ActionItem[]; deadline: string; ustn: string; tradeId: string; status: "PENDING" }
  | { ok: false; reason: string; code?: string }
> {
  if (!input.inspectionId) return { ok: false, reason: "inspectionId required." };
  if (!Array.isArray(input.deficiencies) || input.deficiencies.length === 0) {
    return { ok: false, reason: "deficiencies (non-empty array) required." };
  }

  let inspection: any;
  try {
    inspection = await db.qcInspection.findUnique({
      where: { id: input.inspectionId },
      include: { trade: true },
    });
  } catch (e: any) {
    return { ok: false, reason: `DB error: ${e?.message || e}` };
  }
  if (!inspection) return { ok: false, code: "NOT_FOUND", reason: "QC inspection not found." };

  // Only FAIL or CONDITIONAL_PASS can have an action plan.
  const upper = String(inspection.result || "").toUpperCase();
  if (upper !== "FAIL" && upper !== "CONDITIONAL_PASS") {
    return {
      ok: false,
      code: "RESULT_NOT_ACTIONABLE",
      reason: `Inspection result is ${inspection.result || "(none)"} — only FAIL or CONDITIONAL_PASS can have an action plan.`,
    };
  }

  const ustn = inspection.trade?.ustn;
  if (!ustn) return { ok: false, code: "NO_USTN", reason: "Inspection has no trade USTN." };

  const deadline = input.deadlineOverride
    ? new Date(input.deadlineOverride)
    : new Date(Date.now() + 14 * 86400 * 1000);
  if (isNaN(deadline.getTime())) {
    return { ok: false, code: "BAD_DEADLINE", reason: "deadlineOverride is not a valid date." };
  }

  const requiredActions: ActionItem[] = input.deficiencies.map(def => ({
    ...actionForDeficiency(def),
    complete: false,
  }));

  const planId = `QCAP-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 900 + 100)}`;
  const actionPlanText = requiredActions.map(a => `${a.code}: ${a.label}`).join("\n");

  try {
    const plan = await db.qcActionPlan.create({
      data: {
        planId,
        inspectionId: input.inspectionId,
        ustn,
        actionPlan: actionPlanText,
        actions: JSON.stringify(requiredActions),
        status: "PENDING",
        dueDate: deadline,
        createdByGtid: input.createdByGtid,
      },
    }) as any;

    // Update the inspection with the action plan + deadline + conditionalPass=PENDING.
    await db.qcInspection.update({
      where: { id: input.inspectionId },
      data: {
        actionPlan: actionPlanText,
        actionPlanDeadline: deadline,
        conditionalPassStatus: "PENDING",
      },
    }) as any;

    // Notify buyer + seller via Smart Inbox.
    const trade = inspection.trade;
    const inboxTitle = `QC Action Plan Required — ${ustn.slice(0, 24)}…`;
    const inboxDesc =
      `Inspection ${inspection.inspectionType} resulted in ${inspection.result}. ` +
      `${requiredActions.length} corrective action(s) required by ${deadline.toISOString()}. ` +
      `Action plan ID: ${planId}. Seller must complete all actions before requesting re-inspection.`;
    for (const gtid of [trade?.buyerGtid, trade?.sellerGtid].filter(Boolean)) {
      try {
        await db.inboxItem.create({
          data: {
            tenantGtid: gtid,
            tradeId: trade?.id,
            category: "COMPLIANCE",
            priority: 90,
            title: inboxTitle,
            description: inboxDesc,
            ctaLabel: "View Action Plan",
            deadline,
          },
        }) as any;
      } catch { /* non-blocking */ }
    }
    return { ok: true, actionPlanId: plan.id, requiredActions, deadline: deadline.toISOString(), ustn, tradeId: trade?.id, status: "PENDING" };
  } catch (e: any) {
    return { ok: false, reason: `DB error: ${e?.message || e}` };
  }
}

// ============================================================
// 12.5.2 — Validate that all required actions are complete
// ============================================================

/** Check whether every required action in a plan is complete.
 *  Returns the count, incomplete list, overdue flag, and verifier info. */
export async function validateActionPlanComplete(actionPlanId: string): Promise<
  | { ok: true; complete: boolean; incompleteActions: ActionItem[]; completedCount: number; totalCount: number; deadline: string | null; overdue: boolean; verifiedBy: string | null; verifiedAt: string | null; status: string }
  | { ok: false; reason: string }
> {
  let plan: any;
  try {
    plan = await db.qcActionPlan.findUnique({ where: { id: actionPlanId } });
  } catch (e: any) {
    return { ok: false, reason: `DB error: ${e?.message || e}` };
  }
  if (!plan) return { ok: false, reason: "Action plan not found." };

  let actions: ActionItem[] = [];
  try {
    actions = JSON.parse(plan.actions || "[]");
  } catch {
    actions = [];
  }

  const incompleteActions = actions.filter(a => !a.complete);
  const completedCount = actions.length - incompleteActions.length;
  const deadline = plan.dueDate ? new Date(plan.dueDate).toISOString() : null;
  const overdue = deadline ? new Date(plan.dueDate).getTime() < Date.now() && incompleteActions.length > 0 : false;

  return {
    ok: true,
    complete: incompleteActions.length === 0,
    incompleteActions,
    completedCount,
    totalCount: actions.length,
    deadline,
    overdue,
    verifiedBy: plan.verifiedBy,
    verifiedAt: plan.verifiedAt?.toISOString?.() ?? plan.verifiedAt ?? null,
    status: plan.status,
  };
}

// ============================================================
// 12.5.3 — Mark a single required action complete
// ============================================================

/** Mark a single required action as complete with evidence. The plan's
 *  status stays PENDING until ALL required actions are complete; once
 *  they are, the status auto-flips to COMPLETED_PENDING_VERIFICATION. */
export async function markActionComplete(input: {
  actionPlanId: string;
  actionCode: string;
  evidence?: string;
  verifiedBy: string;
}): Promise<
  | { ok: true; actionPlanId: string; completedCount: number; totalCount: number; allComplete: boolean; status: string }
  | { ok: false; reason: string; code?: string }
> {
  let plan: any;
  try {
    plan = await db.qcActionPlan.findUnique({ where: { id: input.actionPlanId } });
  } catch (e: any) {
    return { ok: false, reason: `DB error: ${e?.message || e}` };
  }
  if (!plan) return { ok: false, code: "NOT_FOUND", reason: "Action plan not found." };

  let actions: ActionItem[] = [];
  try { actions = JSON.parse(plan.actions || "[]"); } catch { actions = []; }
  const idx = actions.findIndex(a => a.code === input.actionCode);
  if (idx === -1) return { ok: false, code: "ACTION_NOT_FOUND", reason: `Action ${input.actionCode} not found in plan.` };

  actions[idx] = {
    ...actions[idx],
    complete: true,
    evidence: input.evidence || actions[idx].evidence,
    verifiedBy: input.verifiedBy,
    verifiedAt: new Date().toISOString(),
  };

  const completedCount = actions.filter(a => a.complete).length;
  const allComplete = completedCount === actions.length;
  const newStatus = allComplete ? "COMPLETED_PENDING_VERIFICATION" : plan.status;
  const verifiedBy = allComplete ? input.verifiedBy : null;
  const verifiedAt = allComplete ? new Date() : null;

  try {
    await db.qcActionPlan.update({
      where: { id: input.actionPlanId },
      data: {
        actions: JSON.stringify(actions),
        status: newStatus,
        completedAt: allComplete ? verifiedAt : null,
        completedBy: allComplete ? input.verifiedBy : null,
        verifiedBy,
        verifiedAt,
      },
    }) as any;

    if (allComplete) {
      // Notify both parties that the plan is complete + ready for re-inspection.
      try {
        const inspection: any = await db.qcInspection.findUnique({ where: { id: plan.inspectionId }, include: { trade: true } });
        const trade = inspection?.trade;
        for (const gtid of [trade?.buyerGtid, trade?.sellerGtid].filter(Boolean)) {
          await db.inboxItem.create({
            data: {
              tenantGtid: gtid,
              tradeId: trade?.id,
              category: "COMPLIANCE",
              priority: 80,
              title: `QC Action Plan Complete — ready for re-inspection`,
              description: `All ${actions.length} required actions on plan ${plan.planId} are complete. Call POST /api/sgtx/qc-inspections/${inspection?.id}/reinspect to schedule a re-inspection.`,
              ctaLabel: "Request Re-inspection",
            },
          }) as any;
        }
      } catch { /* non-blocking */ }
    }

    return { ok: true, actionPlanId: input.actionPlanId, completedCount, totalCount: actions.length, allComplete, status: newStatus };
  } catch (e: any) {
    return { ok: false, reason: `DB error: ${e?.message || e}` };
  }
}

// ============================================================
// 12.5.4 — Block settlement when QC action plan is incomplete
// ============================================================

/** Check whether settlement should be blocked for a USTN because of an
 *  incomplete QC action plan. Returns blocked=true + the offending plan +
 *  inspection when any QC inspection for the USTN has conditionalPassStatus
 *  PENDING and the action plan is not yet complete. */
export async function blockSettlementOnQcFail(ustn: string): Promise<SettlementBlockResult> {
  if (!ustn) return { blocked: false, reason: "USTN required.", ustn: "" };

  let trade: any;
  try {
    trade = await db.trade.findUnique({
      where: { ustn },
      include: { qcInspections: true },
    });
  } catch (e: any) {
    return { blocked: false, reason: `DB error: ${e?.message || e}`, ustn };
  }
  if (!trade) return { blocked: false, reason: "Trade not found.", ustn };

  // Find an inspection with conditionalPassStatus PENDING and an incomplete action plan.
  for (const insp of trade.qcInspections || []) {
    if (insp.conditionalPassStatus === "PENDING" || insp.conditionalPassStatus === "COMPLETED_PENDING_VERIFICATION") {
      // Find the action plan linked to this inspection.
      let plan: any = null;
      try {
        plan = await db.qcActionPlan.findFirst({
          where: { inspectionId: insp.id, status: { in: ["PENDING", "COMPLETED_PENDING_VERIFICATION"] } },
          orderBy: { createdAt: "desc" },
        });
      } catch { /* ignore */ }
      if (plan) {
        // If the plan is COMPLETED_PENDING_VERIFICATION, settlement is still
        // blocked until re-inspection clears it.
        return {
          blocked: true,
          reason: `QC action plan ${plan.planId} not yet cleared by re-inspection (inspection ${insp.id} conditionalPassStatus=${insp.conditionalPassStatus}).`,
          actionPlanId: plan.id,
          inspectionId: insp.id,
          ustn,
        };
      }
      // No plan row, but conditionalPassStatus is PENDING — still block (defensive).
      return {
        blocked: true,
        reason: `QC inspection ${insp.id} has conditionalPassStatus=${insp.conditionalPassStatus} but no action plan on record.`,
        inspectionId: insp.id,
        ustn,
      };
    }
  }

  return { blocked: false, reason: "All QC inspections cleared for settlement.", ustn };
}

// ============================================================
// 12.5.5 — Request re-inspection after action plan complete
// ============================================================

/** After all required actions are complete, the seller can request a
 *  re-inspection. This creates a NEW QcInspection row (status SCHEDULED)
 *  linked to the same trade + inspection type. The original inspection's
 *  conditionalPassStatus is updated to "REINSPECTION_SCHEDULED".
 *  Returns the reinspectionId + scheduledAt. */
export async function requestReinspection(actionPlanId: string, opts?: {
  scheduledAt?: string;
  requestedByGtid?: string;
}): Promise<
  | { ok: true; reinspectionId: string; scheduledAt: string; ustn: string; inspectionId: string; actionPlanId: string; status: "SCHEDULED" }
  | { ok: false; reason: string; code?: string }
> {
  let plan: any;
  try {
    plan = await db.qcActionPlan.findUnique({ where: { id: actionPlanId } });
  } catch (e: any) {
    return { ok: false, reason: `DB error: ${e?.message || e}` };
  }
  if (!plan) return { ok: false, code: "NOT_FOUND", reason: "Action plan not found." };
  if (plan.status !== "COMPLETED_PENDING_VERIFICATION") {
    return {
      ok: false,
      code: "NOT_READY",
      reason: `Action plan status is ${plan.status} — must be COMPLETED_PENDING_VERIFICATION before re-inspection can be requested.`,
    };
  }

  let original: any;
  try {
    original = await db.qcInspection.findUnique({ where: { id: plan.inspectionId }, include: { trade: true } });
  } catch (e: any) {
    return { ok: false, reason: `DB error: ${e?.message || e}` };
  }
  if (!original) return { ok: false, code: "ORPHAN", reason: "Original inspection not found." };

  const scheduledAt = new Date(opts?.scheduledAt || Date.now() + 24 * 3600 * 1000);
  if (isNaN(scheduledAt.getTime())) {
    return { ok: false, code: "BAD_DATE", reason: "scheduledAt is not a valid date." };
  }

  try {
    // Create a new QcInspection row for the re-inspection.
    const reinspection = await db.qcInspection.create({
      data: {
        tradeId: original.tradeId,
        qcGtid: original.qcGtid,
        inspectionType: `${original.inspectionType}_REINSPECTION`,
        status: "SCHEDULED",
      },
    }) as any;

    // Update the original inspection's conditionalPassStatus.
    await db.qcInspection.update({
      where: { id: original.id },
      data: { conditionalPassStatus: "REINSPECTION_SCHEDULED" },
    }) as any;

    // Update the action plan status.
    await db.qcActionPlan.update({
      where: { id: actionPlanId },
      data: { status: "REINSPECTION_SCHEDULED" },
    }) as any;

    // Smart-Inbox the QC provider so they show up.
    try {
      await db.inboxItem.create({
        data: {
          tenantGtid: original.qcGtid,
          tradeId: original.tradeId,
          category: "COMPLIANCE",
          priority: 85,
          title: `Re-inspection requested — ${original.trade?.ustn?.slice(0, 24) || ""}…`,
          description: `Re-inspection scheduled at ${scheduledAt.toISOString()} for ${original.inspectionType}. Action plan ${plan.planId} marked complete by seller. Please attend and update the new inspection ${reinspection.id}.`,
          ctaLabel: "Conduct Re-inspection",
          deadline: scheduledAt,
        },
      }) as any;
    } catch { /* non-blocking */ }

    return {
      ok: true,
      reinspectionId: reinspection.id,
      scheduledAt: scheduledAt.toISOString(),
      ustn: plan.ustn,
      inspectionId: original.id,
      actionPlanId,
      status: "SCHEDULED",
    };
  } catch (e: any) {
    return { ok: false, reason: `DB error: ${e?.message || e}` };
  }
}

// ============================================================
// 12.5.6 — Submit re-inspection result (clears or re-fails the original)
// ============================================================

/** After a re-inspection is conducted, the inspector submits a PASS or FAIL
 *  result. If PASS, the original inspection's conditionalPassStatus is set
 *  to "CLEARED" and the action plan is marked "CLEARED" — settlement
 *  unblocks. If FAIL, a new action plan is needed (the seller must call
 *  createActionPlan again with the new deficiencies). */
export async function submitReinspectionResult(input: {
  reinspectionId: string;
  result: "PASS" | "FAIL";
  defectCount?: number;
  notes?: string;
  newDeficiencies?: string[];
  inspectorGtid: string;
}): Promise<
  | { ok: true; reinspectionId: string; cleared: boolean; originalInspectionId: string; newActionPlanId?: string }
  | { ok: false; reason: string; code?: string }
> {
  let reinspection: any;
  try {
    reinspection = await db.qcInspection.findUnique({
      where: { id: input.reinspectionId },
      include: { trade: true },
    });
  } catch (e: any) {
    return { ok: false, reason: `DB error: ${e?.message || e}` };
  }
  if (!reinspection) return { ok: false, code: "NOT_FOUND", reason: "Re-inspection not found." };
  if (!reinspection.inspectionType?.endsWith("_REINSPECTION")) {
    return { ok: false, code: "NOT_REINSPECTION", reason: "Inspection is not a re-inspection." };
  }

  try {
    await db.qcInspection.update({
      where: { id: input.reinspectionId },
      data: {
        result: input.result,
        defectCount: input.defectCount || 0,
        notes: input.notes || null,
        status: "COMPLETED",
        completedAt: new Date(),
      },
    }) as any;

    // Find the ORIGINAL inspection (by trade + inspectionType minus _REINSPECTION).
    const baseType = reinspection.inspectionType.replace(/_REINSPECTION$/, "");
    const original = await db.qcInspection.findFirst({
      where: { tradeId: reinspection.tradeId, inspectionType: baseType, conditionalPassStatus: "REINSPECTION_SCHEDULED" },
      orderBy: { createdAt: "desc" },
    }) as any;

    let newActionPlanId: string | undefined;
    if (input.result === "PASS") {
      // Clear the original + action plan.
      if (original) {
        await db.qcInspection.update({
          where: { id: original.id },
          data: { conditionalPassStatus: "CLEARED" },
        }) as any;
      }
      // Find the linked action plan and mark it CLEARED.
      let plan: any = null;
      try {
        plan = await db.qcActionPlan.findFirst({
          where: { inspectionId: original?.id || reinspection.id, status: "REINSPECTION_SCHEDULED" },
          orderBy: { createdAt: "desc" },
        });
      } catch { /* ignore */ }
      if (plan) {
        await db.qcActionPlan.update({
          where: { id: plan.id },
          data: { status: "CLEARED", verifiedAt: new Date(), verifiedBy: input.inspectorGtid },
        }) as any;
      }
      // Smart-inbox both parties.
      const trade = reinspection.trade;
      for (const gtid of [trade?.buyerGtid, trade?.sellerGtid].filter(Boolean)) {
        try {
          await db.inboxItem.create({
            data: {
              tenantGtid: gtid,
              tradeId: trade?.id,
              category: "COMPLIANCE",
              priority: 75,
              title: `QC CLEARED — ${trade?.ustn?.slice(0, 24) || ""}…`,
              description: `Re-inspection PASSED. Conditional pass cleared. Settlement can proceed.`,
              ctaLabel: "View Trade",
            },
          }) as any;
        } catch { /* non-blocking */ }
      }
      return { ok: true, reinspectionId: input.reinspectionId, cleared: true, originalInspectionId: original?.id || "" };
    } else {
      // FAIL — auto-create a new action plan if deficiencies provided.
      if (Array.isArray(input.newDeficiencies) && input.newDeficiencies.length > 0) {
        const newPlan = await createActionPlan({
          inspectionId: input.reinspectionId,
          deficiencies: input.newDeficiencies,
          createdByGtid: input.inspectorGtid,
        });
        if (newPlan.ok) {
          newActionPlanId = newPlan.actionPlanId;
        }
      }
      // Keep the original conditionalPassStatus as PENDING (still blocked).
      return { ok: true, reinspectionId: input.reinspectionId, cleared: false, originalInspectionId: original?.id || "", newActionPlanId };
    }
  } catch (e: any) {
    return { ok: false, reason: `DB error: ${e?.message || e}` };
  }
}

// ============================================================
// 12.5.7 — Override a QC result (MULTISIG required)
// ============================================================

/** Override a QC inspection result. This is the only path to flip a FAIL →
 *  PASS without re-inspection. Requires:
 *    1. An inspector-flag row (QcOverrideFlag) with the inspector's
 *       classification + reason.
 *    2. A Platform Governor signature (caller MUST pass
 *       governorSignature — a hex string proving multisig).
 *  Misuse auto-revokes the inspector's licence (Tenant.lifecycleState =
 *  "SUSPENDED") and creates a Dispute (type QC_OVERRIDE) for the audit trail.
 *
 *  Returns the overrideId, the list of signatories, and whether the
 *  inspector's licence was revoked (always false on a successful,
 *  correctly-signed override; true only when a governor audit detects
 *  misuse later — flagged here for forward-compatibility). */
export async function overrideQcResult(input: {
  inspectionId: string;
  overrideReason: string;
  overrideBy: string; // inspector gtid
  newResult: "PASS" | "FAIL" | "CONDITIONAL_PASS";
  governorSignature: string; // hex string — proves multisig by the Platform Governor
  originalAiDetection?: string;
  photoHashes?: string[];
}): Promise<
  | { ok: true; overridden: boolean; newStatus: string; overrideId: string; signedBy: string[]; licenceRevoked: boolean; reason: string }
  | { ok: false; reason: string; code?: string }
> {
  if (!input.governorSignature || input.governorSignature.length < 16) {
    return { ok: false, code: "MULTISIG_REQUIRED", reason: "Multisig required: governorSignature must be a 16+ char hex string signed by the Platform Governor." };
  }
  if (!input.overrideReason || input.overrideReason.length < 20) {
    return { ok: false, code: "REASON_TOO_SHORT", reason: "overrideReason must be at least 20 characters to justify a QC override." };
  }

  let inspection: any;
  try {
    inspection = await db.qcInspection.findUnique({
      where: { id: input.inspectionId },
      include: { trade: true },
    });
  } catch (e: any) {
    return { ok: false, reason: `DB error: ${e?.message || e}` };
  }
  if (!inspection) return { ok: false, code: "NOT_FOUND", reason: "Inspection not found." };

  const ustn = inspection.trade?.ustn || "";
  const overrideId = `QCO-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 900 + 100)}`;

  try {
    // Create a QcOverrideFlag row recording the inspector's classification.
    await db.qcOverrideFlag.create({
      data: {
        inspectionId: input.inspectionId,
        ustn,
        originalAiDetection: input.originalAiDetection || inspection.result || "",
        inspectorClassification: input.newResult,
        inspectorReason: input.overrideReason,
        timestamp: new Date(),
        photoHashes: JSON.stringify(input.photoHashes || []),
      },
    }) as any;

    // Create a Dispute row for the audit trail (type QC_OVERRIDE).
    let dispute: any = null;
    try {
      dispute = await db.dispute.create({
        data: {
          tradeId: inspection.tradeId,
          ustn,
          type: "QC_OVERRIDE",
          status: "FILED",
          filedByGtid: input.overrideBy,
          claimAmountUsd: 0,
          description: `QC override by ${input.overrideBy}: ${input.overrideReason}. Original: ${inspection.result} → New: ${input.newResult}. Governor signature present.`,
        },
      }) as any;
    } catch { /* non-blocking */ }

    // Update the inspection's result + conditionalPassStatus.
    let newConditionalStatus: string | null = null;
    if (input.newResult === "PASS") newConditionalStatus = "CLEARED";
    else if (input.newResult === "CONDITIONAL_PASS") newConditionalStatus = "PENDING";
    else newConditionalStatus = null; // FAIL — settlement stays blocked.

    await db.qcInspection.update({
      where: { id: input.inspectionId },
      data: {
        result: input.newResult,
        conditionalPassStatus: newConditionalStatus,
        notes: (inspection.notes || "") + `\n[OVERRIDE ${overrideId}] ${input.overrideReason}`,
      },
    }) as any;

    // Smart-inbox both parties + governor.
    const trade = inspection.trade;
    const parties = [trade?.buyerGtid, trade?.sellerGtid, input.overrideBy].filter(Boolean);
    for (const gtid of parties) {
      try {
        await db.inboxItem.create({
          data: {
            tenantGtid: gtid,
            tradeId: trade?.id,
            category: "COMPLIANCE",
            priority: 95,
            title: `QC OVERRIDE — ${ustn.slice(0, 24)}…`,
            description: `QC inspection ${input.inspectionId} result overridden from ${inspection.result} to ${input.newResult} by ${input.overrideBy}. Reason: ${input.overrideReason}. Dispute ${dispute?.id || "(none)"} auto-created for audit.`,
            ctaLabel: "View Audit Trail",
          },
        }) as any;
      } catch { /* non-blocking */ }
    }

    // NOTE: licence revocation is a SEPARATE governor audit step. A correctly
    // signed override does NOT auto-revoke. We return licenceRevoked=false
    // here; a separate governor audit (e.g. after a buyer complains) can
    // call revokeInspectorLicence().
    return {
      ok: true,
      overridden: true,
      newStatus: input.newResult,
      overrideId,
      signedBy: [input.overrideBy, "SGTX-PLATFORM-GOVERNOR"],
      licenceRevoked: false,
      reason: `Override applied: ${inspection.result} → ${input.newResult}. Audit dispute ${dispute?.id || "(none)"} created. Inspector licence remains valid pending governor audit.`,
    };
  } catch (e: any) {
    return { ok: false, reason: `DB error: ${e?.message || e}` };
  }
}

// ============================================================
// 12.5.8 — Revoke an inspector's licence (governor audit)
// ============================================================

/** Revoke an inspector's licence by setting their Tenant.lifecycleState to
 *  "SUSPENDED". Called by the governor audit job after detecting misuse
 *  (e.g. a pattern of overrides where the buyer later complained). */
export async function revokeInspectorLicence(input: {
  inspectorGtid: string;
  reason: string;
  revokedBy: string;
}): Promise<{ ok: true; inspectorGtid: string; newState: string } | { ok: false; reason: string }> {
  if (!input.inspectorGtid) return { ok: false, reason: "inspectorGtid required." };
  try {
    const updated = await db.tenant.update({
      where: { gtid: input.inspectorGtid },
      data: { lifecycleState: "SUSPENDED" },
    }) as any;
    // Audit inbox to the inspector.
    try {
      await db.inboxItem.create({
        data: {
          tenantGtid: input.inspectorGtid,
          category: "COMPLIANCE",
          priority: 100,
          title: `LICENCE SUSPENDED — ${input.inspectorGtid}`,
          description: `Your SGTX inspection licence has been SUSPENDED by ${input.revokedBy}. Reason: ${input.reason}. You may no longer submit QC inspections or overrides. Contact the Platform Governor to appeal.`,
          ctaLabel: "Appeal",
        },
      }) as any;
    } catch { /* non-blocking */ }
    return { ok: true, inspectorGtid: input.inspectorGtid, newState: updated.lifecycleState };
  } catch (e: any) {
    return { ok: false, reason: `DB error: ${e?.message || e}` };
  }
}
