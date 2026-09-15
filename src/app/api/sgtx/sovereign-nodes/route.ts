// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v17 §24 Phase 4 — Sovereign Nodes API
// ═══════════════════════════════════════════════════════════════════════════════
//
// GET /api/sgtx/sovereign-nodes
//   → list all sovereign nodes (regional deployments). Cairo = primary,
//     Dubai = secondary, Frankfurt = tertiary. All others are regional
//     nodes for their respective regions (Singapore APAC, São Paulo LATAM,
//     Virginia NAFTA, Nairobi Africa, etc.).
//
// GET /api/sgtx/sovereign-nodes?country_code=EG
//   → get the nearest sovereign node for a country (region-match dispatch).
//     If the country's regional node is OPERATIONAL, returns it. Otherwise
//     falls back to the next-nearest OPERATIONAL node globally.
//
// GET /api/sgtx/sovereign-nodes?node_id=NODE-CAIRO-01
//   → get the capabilities of a specific sovereign node (USTN recognition,
//     jurisdiction, data residency).
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  getSovereignNodes,
  getNearestSovereignNode,
  getNodeCapabilities,
} from "@/lib/sgtx/sovereign-nodes";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const countryCode = searchParams.get("country_code") || searchParams.get("countryCode");
    const nodeId = searchParams.get("node_id") || searchParams.get("nodeId");

    // ── ?node_id=X → node capabilities ─────────────────────────────────────
    if (nodeId) {
      const capabilities = getNodeCapabilities(nodeId);
      if (!capabilities) {
        return NextResponse.json(
          {
            ok: false,
            error: `No sovereign node with ID '${nodeId}'`,
            hint: "Use GET /api/sgtx/sovereign-nodes to list all node IDs",
          },
          { status: 404 },
        );
      }
      return NextResponse.json({
        ok: true,
        capabilities,
      });
    }

    // ── ?country_code=X → nearest node ──────────────────────────────────────
    if (countryCode) {
      const node = getNearestSovereignNode(countryCode);
      if (!node) {
        return NextResponse.json(
          {
            ok: false,
            error: `No sovereign node available for country '${countryCode}'`,
          },
          { status: 404 },
        );
      }
      return NextResponse.json({
        ok: true,
        country_code: countryCode.toUpperCase(),
        nearest_node: node,
      });
    }

    // ── No params → list all nodes ─────────────────────────────────────────
    const nodes = getSovereignNodes();
    const operational = nodes.filter((n) => n.status === "OPERATIONAL").length;
    const degraded = nodes.filter((n) => n.status === "DEGRADED").length;
    const provisioning = nodes.filter((n) => n.status === "PROVISIONING").length;
    const maintenance = nodes.filter((n) => n.status === "MAINTENANCE").length;

    return NextResponse.json({
      ok: true,
      count: nodes.length,
      summary: {
        total: nodes.length,
        operational,
        degraded,
        provisioning,
        maintenance,
        primary_region: "cairo",
      },
      nodes,
      note: "11 default sovereign nodes (Cairo primary, Dubai secondary, Frankfurt tertiary + 8 regional). Pass ?country_code=EG for nearest-node dispatch, or ?node_id=NODE-CAIRO-01 for node capabilities.",
    });
  } catch (err: any) {
    logger.error("[api/sgtx/sovereign-nodes] GET failed", {
      error: err?.message,
      stack: err?.stack,
    });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
