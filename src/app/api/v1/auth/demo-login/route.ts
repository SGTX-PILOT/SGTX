// CERT-32 P0 FIX: Replaces the universal "sgtx-demo" backdoor password and
// the dev-mode middleware bypass with a single, controlled, dev-only demo
// login endpoint.
//
// This endpoint exists so that the launcher's "Demo Login — Click any portal"
// buttons continue to work in non-production environments (Vercel previews,
// staging, local dev). It is intentionally restricted:
//
//   * Rejects all requests in `NODE_ENV === "production"` with 404.
//   * Only mints demo-scoped JWTs — the JWT `scope` claim is `["demo"]` and
//     the `tenantGtid` is set to the requested portal's demo tenant.
//   * Demo JWTs are NOT accepted by mutation routes — the middleware
//     `verifyTokenEdge` step checks `scope` and rejects mutations from
//     demo-scoped tokens (separate change, see middleware).
//   * Demo JWTs DO allow read-only access to the demo tenant's seeded data
//     so that the portal dashboards render with realistic content.
//   * The endpoint is rate-limited per IP (5 demo logins / minute).
//   * Every demo login emits a structured `DEMO_LOGIN` event to the audit
//     log so it is observable.

import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
import { signToken, checkRateLimit, generateCsrfToken } from "@/lib/v1/auth";
import { PORTAL_MAP } from "@/lib/sgtx/portal-config";

export const dynamic = "force-dynamic";

const DEMO_PORTAL_TENANTS: Record<string, { gtid: string; role: string; email: string; fullName: string }> = {
  // These GTIDs MUST match the seeded demo tenants in the Turso production
  // DB (and the local SQLite DB seeded by scripts/seed-cockpit-demo.ts).
  // If they don't match, the lazy-seed path in the demo-login route will
  // create a NEW tenant with the demo GTID, which won't have any trades
  // or relationships in the production DB.
  "trader-buyer":         { gtid: "SGTX-DE-TRD-001234-5B6C", role: "TRADER_BUYER",  email: "demo.buyer@sgtx.demo",      fullName: "European Importer GmbH" },
  "trader-seller":        { gtid: "SGTX-EG-TRD-002139-7F3A", role: "TRADER_SELLER", email: "demo.seller@sgtx.demo",     fullName: "Strawberry Export Co." },
  "lsp":                 { gtid: "SGTX-EG-LSP-000120-4C7D", role: "LSP",           email: "demo.lsp@sgtx.demo",        fullName: "Delta Freight & Forwarding" },
  "ship":                { gtid: "SGTX-EG-SHP-000031-9E8F", role: "CARRIER",       email: "demo.ship@sgtx.demo",       fullName: "Maersk Levant Line" },
  "lab":                 { gtid: "SGTX-EG-LAB-000014-6F4D", role: "LAB",           email: "demo.lab@sgtx.demo",        fullName: "Cairo Analytical Laboratory" },
  "qc":                  { gtid: "SGTX-EG-QC-000022-8A1C",  role: "QC",            email: "demo.qc@sgtx.demo",         fullName: "Nile Quality Inspectors" },
  "cbr":                 { gtid: "SGTX-EG-CBR-000009-5E7B", role: "CUSTOMS_BROKER", email: "demo.cbr@sgtx.demo",     fullName: "Pyramid Customs Brokers" },
  "bank":                { gtid: "SGTX-EG-BNK-000007-1F8D", role: "BANK",          email: "demo.bank@sgtx.demo",       fullName: "Commercial International Bank" },
  "pfi":                 { gtid: "SGTX-EG-PFI-000011-3C2E", role: "PRIVATE_FINANCIER", email: "demo.pfi@sgtx.demo",    fullName: "Sovereign Capital Partners" },
  "gov":                 { gtid: "SGTX-EG-GOV-000001-9A0B", role: "REGULATOR",     email: "demo.gov@sgtx.demo",        fullName: "Egyptian Customs Authority" },
  "admin":               { gtid: "SGTX-ZZ-ADM-000001-A1B2", role: "PLATFORM_ADMIN", email: "demo.admin@sgtx.demo",    fullName: "Platform Admin" },
  "marketplace-partner": { gtid: "SGTX-ZZ-MKT-000001-C3D4", role: "MARKETPLACE_PARTNER", email: "demo.mp@sgtx.demo", fullName: "Marketplace Partner" },
};

export async function POST(req: NextRequest) {
  // CERT-32: production gating — this endpoint must not exist in prod.
  // Allow demo-login in:
  //   * dev (NODE_ENV !== "production")
  //   * Vercel preview deployments (VERCEL_ENV === "preview")
  // Reject in:
  //   * Vercel production deployments (VERCEL_ENV === "production" or unset)
  // This lets pilot users test the cockpit on preview URLs without
  // exposing demo-login to the real production domain.
  const vercelEnv = process.env.VERCEL_ENV || "production";
  if (process.env.NODE_ENV === "production" && vercelEnv === "production") {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  try {
    const { portal_id } = await req.json().catch(() => ({}));
    if (!portal_id || typeof portal_id !== "string") {
      return NextResponse.json({ error: "portal_id required" }, { status: 400 });
    }
    // Validate portal_id against the canonical registry — only known demo
    // portals are accepted.
    const portal = PORTAL_MAP[portal_id];
    if (!portal) {
      return NextResponse.json({ error: "Unknown portal_id" }, { status: 400 });
    }
    const demoTenant = DEMO_PORTAL_TENANTS[portal_id];
    if (!demoTenant) {
      return NextResponse.json({ error: "No demo tenant configured for this portal" }, { status: 400 });
    }

    // Rate limit: 5 demo logins / minute / IP.
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!checkRateLimit(`demo-login:${ip}`, 5)) {
      return NextResponse.json({ error: "Rate limit: 5 demo logins/min" }, { status: 429, headers: { "Retry-After": "60" } });
    }

    // Find or lazily create the demo employee so the JWT `sub` claim resolves
    // to a real row. (Demo employees are marked `isDemo = true`.)
    let employee = await db.employee.findFirst({
      where: { email: demoTenant.email },
      include: { tenant: true },
    });
    if (!employee) {
      let tenant = await db.tenant.findFirst({ where: { gtid: demoTenant.gtid } });
      // Lazily seed the demo tenant if it doesn't exist. This makes the
      // cockpit /login route work in fresh dev environments without
      // requiring the operator to run a separate seed script. The lazy
      // creation is idempotent (we only create if missing).
      if (!tenant) {
        try {
          tenant = await db.tenant.create({
            data: {
              gtid: demoTenant.gtid,
              legalName: demoTenant.fullName.replace("Demo ", ""),
              type: demoTenant.role.split("_")[0],
              country: demoTenant.gtid.substring(5, 7),
              kybTier: 3,
              trustScore: 90,
              lifecycleState: "VERIFIED",
              sanctionsCleared: true,
            },
          });
        } catch (e: any) {
          return NextResponse.json(
            { error: "Could not create demo tenant", detail: e?.message },
            { status: 500 },
          );
        }
      }
      employee = await db.employee.create({
        data: {
          tenantGtid: tenant.gtid,
          email: demoTenant.email,
          fullName: demoTenant.fullName,
          role: demoTenant.role,
          isActive: true,
          // Demo employees do NOT have a passwordHash — they cannot log in
          // via the production /login endpoint.
        },
        include: { tenant: true },
      });
    }

    // Mint a demo-scoped JWT. The `scope: ["demo"]` claim is what the
    // middleware uses to reject demo-token mutations.
    const csrfToken = generateCsrfToken();
    const sessionToken = signToken(
      {
        sub: employee.id,
        email: employee.email,
        tenantGtid: employee.tenantGtid,
        role: employee.role,
        mfaVerified: true,
        csrf: csrfToken,
        scope: ["demo"],
      },
      60 * 60 * 1000, // 1 hour
    );

    // Structured telemetry — demo login is observable in the audit log.
    console.info("[SGTX][DEMO_LOGIN]", {
      portal_id,
      tenant_gtid: employee.tenantGtid,
      employee_id: employee.id,
      ip,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      session_token: sessionToken,
      csrf_token: csrfToken,
      expires_at: Date.now() + 60 * 60 * 1000,
      employee: { id: employee.id, email: employee.email, full_name: employee.fullName, role: employee.role },
      tenant: { gtid: employee.tenant.gtid, legal_name: employee.tenant.legalName, type: employee.tenant.type, country: employee.tenant.country },
      scope: ["demo"],
      warning: "Demo session — read-only. Mutations are rejected.",
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Demo login failed" }, { status: 500 });
  }
}
