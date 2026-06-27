import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/sgtx/employee/switch-context — Dual-mode toggle (Part 2.3.4.1)
// Body: { employeeGtid, newMode: "BUY" | "SELL" }
// Updates the Employee's activeTraderMode (defaultTraderMode stays untouched) and
// returns a new "JWT" (simulated) + employeeId.
// Rate limit: 10 switches per 60 seconds per employee (Part 2.3.4.1)
export async function POST(req: NextRequest) {
  try {
    const { employeeGtid, newMode } = await req.json();
    if (!employeeGtid || !newMode) {
      return NextResponse.json({ error: "employeeGtid and newMode required" }, { status: 400 });
    }
    if (!["BUY", "SELL"].includes(newMode)) {
      return NextResponse.json({ error: "newMode must be BUY or SELL" }, { status: 400 });
    }

    // Rate limiting: 10 switches per 60 seconds (Part 2.3.4.1)
    // In production this would use Redis; here we use a simple in-memory map
    const rateKey = `switch:${employeeGtid}`;
    const now = Date.now();
    const SWITCH_RATE_LIMIT = (global as any)[rateKey] || [];
    const recentSwitches = SWITCH_RATE_LIMIT.filter((t: number) => now - t < 60000);
    if (recentSwitches.length >= 10) {
      return NextResponse.json(
        { error: "Rate limit exceeded: maximum 10 mode switches per 60 seconds. Please wait and try again." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }
    (global as any)[rateKey] = [...recentSwitches, now];

    // Verify the tenant exists and has dual-mode enabled
    const tenant = await db.tenant.findUnique({ where: { gtid: employeeGtid } });
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }
    if (tenant.type !== "TRD") {
      return NextResponse.json({ error: "Dual-mode toggle is only available for TRD (Trader) tenants" }, { status: 403 });
    }
    if (tenant.traderMode !== "DUAL") {
      return NextResponse.json({ error: `Tenant traderMode is ${tenant.traderMode}, not DUAL` }, { status: 403 });
    }

    // ── NEW (Batch B / B3): persist activeTraderMode on the Employee row ──
    // The Tenant.traderMode stays as "DUAL" (eligibility flag). The active
    // sub-mode (BUY | SELL) is now tracked on Employee.activeTraderMode, mirroring
    // the simulated JWT claim. If no Employee exists for this tenant yet, create
    // a default OWNER record seeded from the Tenant profile.
    let employee = await db.employee.findFirst({
      where: { tenantGtid: employeeGtid },
      orderBy: { createdAt: "asc" },
    });

    const previousMode = employee?.activeTraderMode || "BUY";

    if (employee) {
      employee = await db.employee.update({
        where: { id: employee.id },
        data: {
          activeTraderMode: newMode,
          // Seed defaultTraderMode on first switch if still NONE.
          ...(employee.defaultTraderMode === "NONE" ? { defaultTraderMode: newMode } : {}),
        },
      });
    } else {
      employee = await db.employee.create({
        data: {
          tenantGtid: employeeGtid,
          fullName: tenant.legalName || employeeGtid,
          email: `${employeeGtid.toLowerCase()}@sgtx.local`,
          role: "OWNER",
          allowRoleSwitching: true,
          defaultTraderMode: newMode,
          activeTraderMode: newMode,
        },
      });
    }

    // Create activity log
    await db.activity.create({
      data: {
        action: "DUAL_MODE_SWITCH",
        type: "INFO",
        description: `Trader ${employeeGtid} (employee ${employee.id}) switched from ${previousMode} to ${newMode} mode.`,
        actorGtid: employeeGtid,
      },
    });

    // Simulated JWT with permissions array (Part 2.3.4.3)
    const permissions = newMode === "BUY"
      ? ["trade.request.create", "quote.accept", "contract.sign.buyer", "financing.request", "payment.authorize"]
      : ["seller_quote.submit", "exw.lock", "contract.sign.seller", "packing.lock", "logistics.addendum.sign"];

    const simulatedJwt = {
      tenant_gtid: employeeGtid,
      employee_id: employee.id,
      active_trader_mode_context: newMode,
      permissions,
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(), // 8 hour expiry
    };

    return NextResponse.json({
      ok: true,
      employeeId: employee.id,
      previousMode,
      newMode,
      jwt: simulatedJwt,
      message: `Switched to ${newMode} mode. All data-fetching hooks will re-execute with new context.`,
    });
  } catch (e: any) {
    console.error("[switch-context] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
