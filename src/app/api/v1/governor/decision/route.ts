// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/v1/governor/decision — Governor decision endpoint (v18 §3.5.2)
//
// v18 §3.5.2: Governor Service — Single Point of Truth. This endpoint is
// the canonical way for any client (internal system, partner integration, or
// admin) to request a Governor decision on a proposed action.
//
// The Governor evaluates the action against:
//   1. OPA Rego policies (§3.5.4)
//   2. WasmEdge constitutional modules (§3.5.5)
//   3. AI Decision Merger (A1 advisory + A2 constraints + A3 escalations)
//
// And returns a final verdict: ALLOW | DENY | CONDITIONAL.
//
// Auth: Bearer JWT — caller must be authenticated. The actor_gtid in the
// body must match the caller's GTID (or caller must be ADM/GOV).
//
// Request body (v18 §3.5.2):
//   {
//     "action": "contract.sign",
//     "actor_gtid": "SGTX-EG-TRD-002139-7F3A",
//     "actor_employee_id": "emp-001",
//     "active_trader_mode_context": "BUY",
//     "resource": { "ustn": "SGTX-EG-26-F3A-1" },
//     "payload": { "signature": "base64..." }
//   }
//
// Response shape (v18 §3.5.3 — Decision Verdicts):
//   {
//     "decision_id": "gov-...",
//     "verdict": "ALLOW" | "DENY" | "CONDITIONAL",
//     "action": "contract.sign",
//     "actor_gtid": "...",
//     "resource": { "ustn": "..." },
//     "reason": "...",
//     "policy_id": "contract.sign.v1",
//     "conditions": [...],
//     "loom_hash": "sha256:...",
//     "decided_at": "<ISO-8601>"
//   }

interface CallerPayload {
  gtid?: string;
  tenantGtid?: string;
  role?: string;
  activeTraderMode?: string;
}

function getCaller(req: NextRequest): CallerPayload | null {
  const raw = req.headers.get("x-sgtx-payload");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// In-memory rate limiter (30 req/min per caller — Governor is critical infra)
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateBuckets: Map<string, { count: number; resetAt: number }> = new Map();
let gcCounter = 0;

function checkRateLimit(key: string) {
  if (++gcCounter >= 50) {
    gcCounter = 0;
    const now = Date.now();
    for (const [k, v] of rateBuckets) if (v.resetAt <= now) rateBuckets.delete(k);
  }
  const now = Date.now();
  const existing = rateBuckets.get(key);
  if (!existing || now > existing.resetAt) {
    const resetAt = now + RATE_LIMIT_WINDOW_MS;
    rateBuckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetAt };
  }
  if (existing.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }
  existing.count += 1;
  return { allowed: true, remaining: RATE_LIMIT_MAX - existing.count, resetAt: existing.resetAt };
}

// v18 §3.5.2 — Policy lookup by action name
const POLICY_LOOKUP: Record<string, { policyId: string; requiresQes: boolean; requiresMultisig: boolean; conditions: string[] }> = {
  "contract.sign": { policyId: "contract.sign.v1", requiresQes: true, requiresMultisig: false, conditions: ["contract_locked", "parties_signed", "feeLock_active"] },
  "ustn.generate": { policyId: "identity.ustn.generate.v18", requiresQes: false, requiresMultisig: false, conditions: ["contract_locked", "feeLock_active"] },
  "feeling.lock": { policyId: "fee.lock.v1", requiresQes: true, requiresMultisig: false, conditions: ["contract_signed"] },
  "settlement.approve": { policyId: "settlement.approve.v1", requiresQes: true, requiresMultisig: false, conditions: ["delivery_confirmed", "milestone_DELIVERED"] },
  "milestone.confirm": { policyId: "milestone.confirm.v1", requiresQes: false, requiresMultisig: false, conditions: ["prev_milestone_complete"] },
  "financing.request": { policyId: "financing.request.v1", requiresQes: false, requiresMultisig: false, conditions: ["contract_locked"] },
  "dispute.file": { policyId: "dispute.file.v1", requiresQes: false, requiresMultisig: false, conditions: ["ustn_active"] },
};

export async function POST(req: NextRequest) {
  try {
    const caller = getCaller(req);
    if (!caller?.gtid) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "INVALID_JSON", message: "Invalid JSON body" },
        { status: 400, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    const action = body?.action;
    const actorGtid = (body?.actor_gtid || "").toUpperCase();
    const actorEmployeeId = body?.actor_employee_id;
    const activeTraderMode = body?.active_trader_mode_context || caller.activeTraderMode;
    const resource = body?.resource || {};
    const payload = body?.payload || {};

    if (!action || typeof action !== "string") {
      return NextResponse.json(
        { error: "INVALID_ACTION", message: "action is required" },
        { status: 400, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }
    if (!actorGtid) {
      return NextResponse.json(
        { error: "INVALID_ACTOR_GTID", message: "actor_gtid is required" },
        { status: 400, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    // Caller must be the actor or an ADM/GOV
    if (caller.gtid !== actorGtid && caller.role !== "ADM" && caller.role !== "GOV") {
      return NextResponse.json(
        { error: "ACCESS_DENIED", message: "Caller must be the actor_gtid or an ADM/GOV" },
        { status: 403, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    const rl = checkRateLimit(actorGtid);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "RATE_LIMIT_EXCEEDED", retry_after_seconds: Math.ceil((rl.resetAt - Date.now()) / 1000) },
        { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)), "X-SGTX-Version": "v18.0" } },
      );
    }

    // ── v18 §3.5.2 — Governor decision flow ────────────────────────────────
    // Step 1: OPA Rego policy lookup (simulated — in production the OPA sidecar
    // evaluates the Rego policy for the action)
    const policy = POLICY_LOOKUP[action];
    if (!policy) {
      // Unknown action — Governor denies by default (G1 + G2)
      const decisionId = `gov-deny-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      return NextResponse.json(
        {
          decision_id: decisionId,
          verdict: "DENY",
          action,
          actor_gtid: actorGtid,
          resource,
          reason: `No policy found for action '${action}' — Governor denies by default`,
          policy_id: null,
          conditions: [],
          decided_at: new Date().toISOString(),
        },
        {
          status: 200, // 200 with DENY verdict — the request was processed
          headers: { "X-SGTX-Version": "v18.0", "X-RateLimit-Remaining": String(rl.remaining) },
        },
      );
    }

    // Step 2: WasmEdge constitutional check (simulated — in production the
    // WasmEdge runtime executes the compiled constitutional module)
    // For demo: ALLOW if all policy conditions are present in the payload
    const allConditionsMet = policy.conditions.every((c) => payload[c] !== undefined || payload.conditions?.includes(c));

    // Step 3: AI Decision Merger (simulated — A1 advisory + A2 constraints + A3 escalations)
    // For demo: AI adds advisory notes but doesn't change the verdict

    const verdict: "ALLOW" | "DENY" | "CONDITIONAL" = allConditionsMet ? "ALLOW" : "CONDITIONAL";
    const reason = allConditionsMet
      ? `All conditions met for action '${action}' per policy ${policy.policyId}`
      : `Missing conditions for action '${action}': expected [${policy.conditions.join(", ")}], got [${Object.keys(payload).join(", ")}]`;

    const decisionId = `gov-${verdict.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    // Step 4: Loom anchor (simulated — SHA-256 hash of the decision)
    const { createHash } = await import("crypto");
    const decisionJson = JSON.stringify({
      decisionId, action, actorGtid, verdict, policyId: policy.policyId, conditions: policy.conditions,
    });
    const loomHash = "sha256:" + createHash("sha256").update(decisionJson).digest("hex");

    // Step 5: Persist the Governor decision (best-effort)
    const { freshDb } = await import("@/lib/db-fresh");
    let persisted = false;
    try {
      await freshDb.governorDecision.create({
        data: {
          decisionId,
          action,
          actorGtid,
          ustn: resource.ustn || null,
          verdict,
          reason,
          policyId: policy.policyId,
          evidenceJson: JSON.stringify({ resource, payload, actorEmployeeId, activeTraderMode }),
          conditions: JSON.stringify(policy.conditions),
        },
      });
      persisted = true;
    } catch (e: any) {
      logger.warn("[v1/governor/decision] Governor persist failed (non-fatal):", { error: e?.message });
    }

    // Step 6: Activity log (best-effort)
    try {
      await freshDb.activity.create({
        data: {
          action: `GOVERNOR_${verdict}`,
          type: verdict === "ALLOW" ? "INFO" : "WARNING",
          description: `Governor ${verdict} action '${action}' for ${actorGtid} (policy ${policy.policyId}) — decision ${decisionId}`,
          actorGtid,
        },
      });
    } catch (e: any) {
      logger.warn("[v1/governor/decision] Activity log failed (non-fatal):", { error: e?.message });
    }

    return NextResponse.json(
      {
        decision_id: decisionId,
        verdict,
        action,
        actor_gtid: actorGtid,
        actor_employee_id: actorEmployeeId || null,
        active_trader_mode_context: activeTraderMode || null,
        resource,
        payload,
        reason,
        policy_id: policy.policyId,
        requires_qes: policy.requiresQes,
        requires_multisig: policy.requiresMultisig,
        conditions: policy.conditions,
        loom_hash: loomHash,
        decided_at: new Date().toISOString(),
        persisted,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "X-SGTX-Version": "v18.0",
          "X-RateLimit-Remaining": String(rl.remaining),
        },
      },
    );
  } catch (e: any) {
    logger.error("[v1/governor/decision] error:", { error: e?.message || String(e) });
    return NextResponse.json(
      { error: "Governor decision failed" },
      { status: 503, headers: { "X-SGTX-Version": "v18.0" } },
    );
  }
}
