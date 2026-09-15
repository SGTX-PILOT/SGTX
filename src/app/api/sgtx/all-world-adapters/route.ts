// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v17 §20.118 — All-World Country Adapter Architecture API
// ═══════════════════════════════════════════════════════════════════════════════
//
// GET /api/sgtx/all-world-adapters
//   → list all 22 built-in country adapters (compact summaries)
//
// GET /api/sgtx/all-world-adapters?country_code=EG
//   → get the full adapter for a specific country (capabilities, endpoints,
//     language, currency, timezone, regulatory sources)
//
// GET /api/sgtx/all-world-adapters?country_code=EG&discover=true
//   → discover what a country supports — richer snapshot with local systems,
//     tax types, sanction lists, e-invoice format
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  listCountryAdapters,
  getCountryAdapter,
  discoverCountryCapabilities,
} from "@/lib/sgtx/all-world-adapters";
// Import the registry for its side-effect: it seeds the 22 built-in adapters
// on first import. Without this, the registry would be empty.
import "@/lib/sgtx/all-world-adapters/registry";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const countryCode = searchParams.get("country_code") || searchParams.get("countryCode");
    const discover = searchParams.get("discover") === "true";

    // ── No country_code → list all adapters ───────────────────────────────
    if (!countryCode) {
      const adapters = listCountryAdapters();
      const active = adapters.filter((a) => a.status === "ACTIVE").length;
      const partial = adapters.filter((a) => a.status === "PARTIAL").length;
      const development = adapters.filter((a) => a.status === "DEVELOPMENT").length;
      return NextResponse.json({
        ok: true,
        count: adapters.length,
        summary: { active, partial, development, total: adapters.length },
        adapters,
        note: "22 built-in country adapters per v17 §20.118 + §24 Phase 4. Pass ?country_code=EG to get a specific adapter; ?country_code=EG&discover=true to discover capabilities.",
      });
    }

    // ── ?discover=true → discover capabilities ─────────────────────────────
    if (discover) {
      const snapshot = discoverCountryCapabilities(countryCode);
      if (!snapshot) {
        return NextResponse.json(
          {
            ok: false,
            error: `No country adapter registered for '${countryCode}'`,
            hint: "Use GET /api/sgtx/all-world-adapters to list all registered adapters, or add a new adapter via registerCountryAdapter() in src/lib/sgtx/all-world-adapters/registry.ts",
          },
          { status: 404 },
        );
      }
      return NextResponse.json({
        ok: true,
        snapshot,
      });
    }

    // ── ?country_code=X → get the full adapter ─────────────────────────────
    const adapter = getCountryAdapter(countryCode);
    if (!adapter) {
      return NextResponse.json(
        {
          ok: false,
          error: `No country adapter registered for '${countryCode}'`,
          hint: "Use GET /api/sgtx/all-world-adapters to list all registered adapters, or add a new adapter via registerCountryAdapter() in src/lib/sgtx/all-world-adapters/registry.ts",
        },
        { status: 404 },
      );
    }
    return NextResponse.json({
      ok: true,
      adapter,
    });
  } catch (err: any) {
    logger.error("[api/sgtx/all-world-adapters] GET failed", {
      error: err?.message,
      stack: err?.stack,
    });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
