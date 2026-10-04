// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/v1/employee/switch-context — Dual trader-mode toggle (v18 §2.5.3)
//
// v18 §2.5.3 mandates: "the context switch is an explicit, audited action
// (POST /v1/employee/switch-context)".
//
// This is the v1 canonical mirror of /api/sgtx/employee/switch-context.
// Both endpoints share the same rate limiter (10 switches per 60 seconds
// per employee) and the same audited state transition (Activity log +
// simulated JWT). The v1 surface is the one referenced by the blueprint;
// the /api/sgtx/* mirror exists for demo portals that don't carry a v1
// Bearer token.
//
// Auth: Bearer JWT (verified by middleware). The middleware populates
// x-sgtx-payload with { gtid, role, tenantGtid, activeTraderMode }.
//
// Request body:
//   { "newMode": "BUY" | "SELL" }
// The employee is resolved from the caller's gtid claim — callers may NOT
// switch context on behalf of another employee via this endpoint.
//
// Response shape (v18 §2.5.3):
//   {
//     "ok": true,
//     "employeeId": "<employee-id>",
//     "employeeGtid": "<caller-gtid>",
//     "previousMode": "BUY" | "SELL",
//     "newMode": "BUY" | "SELL",
//     "jwt": "<new-session-jwt>",   // simulated in dev
//     "permissions": [...],          // role-aware permission set
//     "timestamp": "<ISO-8601>"
//   }
//
// Rate limit: 10 switches per 60 seconds per employee (v18 §4.6.4).

// ============ Shared rate limiter (10 switches per 60s per employee) ============

const SWITCH_RATE_LIMIT_MAX = 10;
const SWITCH_RATE_LIMIT_WINDOW_MS = 60_000;
const switchBuckets: Map<string, number[]> = new Map();
let gcCounter = 0;

function checkSwitchRate(employeeGtid: string): { allowed: boolean; remaining: number; retryAfter: number } {
  if (++gcCounter >= 50) {
    gcCounter = 0;
    const now = Date.now();
    for (const [k, ts] of switchBuckets) {
      const fresh = ts.filter((t) => now - t < SWITCH_RATE_LIMIT_WINDOW_MS);
      if (fresh.length === 0) switchBuckets.delete(k);
      else switchBuckets.set(k, fresh);
    }
  }
  const now = Date.now();
  const existing = switchBuckets.get(employeeGtid) || [];
  const recent = existing.filter((t) => now - t < SWITCH_RATE_LIMIT_WINDOW_MS);
  if (recent.length >= SWITCH_RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((SWITCH_RATE_LIMIT_WINDOW_MS - (now - recent[0])) / 1000);
    return { allowed: false, remaining: 0, retryAfter: Math.max(1, retryAfter) };
  }
  recent.push(now);
  switchBuckets.set(employeeGtid, recent);
  return { allowed: true, remaining: SWITCH_RATE_LIMIT_MAX - recent.length, retryAfter: 0 };
}

interface CallerPayload {
  gtid?: string;
  role?: string;
  tenantGtid?: string;
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

export async function POST(req: NextRequest) {
  try {
    const caller = getCaller(req);
    if (!caller || !caller.gtid) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const newMode: string | undefined = body?.newMode;
    if (!newMode || !["BUY", "SELL"].includes(newMode)) {
      return NextResponse.json(
        { error: "newMode must be 'BUY' or 'SELL'" },
        { status: 400 },
      );
    }

    const rl = checkSwitchRate(caller.gtid);
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded: maximum 10 mode switches per 60 seconds.",
          retry_after_seconds: rl.retryAfter,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rl.retryAfter),
            "X-SGTX-Version": "v18.0",
          },
        },
      );
    }

    const { db } = await import("@/lib/db");

    // ── Step 1: Verify the caller's tenant exists and is DUAL-eligible ──
    const tenant = await db.tenant.findUnique({ where: { gtid: caller.gtid } });
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }
    if (tenant.type !== "TRD") {
      return NextResponse.json(
        { error: "Dual-mode toggle is only available for TRD (Trader) tenants" },
        { status: 403 },
      );
    }
    if (tenant.traderMode !== "DUAL") {
      return NextResponse.json(
        { error: `Tenant traderMode is ${tenant.traderMode}, not DUAL` },
        { status: 403 },
      );
    }

    // ── Step 2: Resolve or seed the caller's Employee row ──
    let employee = await db.employee.findFirst({
      where: { tenantGtid: caller.gtid },
      orderBy: { createdAt: "asc" },
    });
    const previousMode = employee?.activeTraderMode || "BUY";

    if (employee) {
      employee = await db.employee.update({
        where: { id: employee.id },
        data: {
          activeTraderMode: newMode,
          ...(employee.defaultTraderMode === "NONE" ? { defaultTraderMode: newMode } : {}),
        },
      });
    } else {
      employee = await db.employee.create({
        data: {
          tenantGtid: caller.gtid,
          fullName: tenant.legalName || caller.gtid,
          email: `${caller.gtid.toLowerCase()}@sgtx.local`,
          role: "OWNER",
          allowRoleSwitching: true,
          defaultTraderMode: newMode,
          activeTraderMode: newMode,
        },
      });
    }

    // ── Step 3: Audited action — Activity log row (v18 §2.5.3 "audited") ──
    try {
      await db.activity.create({
        data: {
          action: "DUAL_MODE_SWITCH",
          type: "INFO",
          description: `Trader ${caller.gtid} (employee ${employee.id}) switched from ${previousMode} to ${newMode} mode via /v1/employee/switch-context.`,
          actorGtid: caller.gtid,
        },
      });
    } catch (e: any) {
      logger.warn("[v1/employee/switch-context] Activity log failed (non-fatal):", {
        error: e?.message,
      });
    }

    // ── Step 4: Issue a new simulated JWT with role-aware permissions ──
    // v18 §4.6.4 — the activeTraderMode claim filters all downstream data
    // fetching. The permission set mirrors the role's allowed actions.
    const permissions =
      newMode === "BUY"
        ? [
            "trade.request.create",
            "quote.accept",
            "contract.sign.buyer",
            "financing.request",
            "payment.authorize",
          ]
        : [
            "seller_quote.submit",
            "exw.lock",
            "contract.sign.seller",
            "packing.lock",
            "logistics.addendum.sign",
          ];

    const simulatedJwt = {
      tenant_gtid: caller.gtid,
      employee_id: employee.id,
      active_trader_mode_context: newMode,
      permissions,
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      source: "v1",
    };

    return NextResponse.json(
      {
        ok: true,
        employeeId: employee.id,
        employeeGtid: caller.gtid,
        previousMode,
        newMode,
        jwt: simulatedJwt,
        message: `Switched to ${newMode} mode. All data-fetching hooks will re-execute with the new context.`,
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          "X-SGTX-Version": "v18.0",
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  } catch (e: any) {
    logger.error("[v1/employee/switch-context] error:", { error: e?.message || String(e) });
    return NextResponse.json(
      { error: "Context switch failed", timestamp: new Date().toISOString() },
      { status: 500 },
    );
  }
}
