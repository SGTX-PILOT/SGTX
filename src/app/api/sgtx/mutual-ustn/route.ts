// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v17 §24 Phase 4 — Mutual USTN Recognition agreements API
// ═══════════════════════════════════════════════════════════════════════════════
//
// GET /api/sgtx/mutual-ustn
//   → list all recognition agreements between sovereign nodes (full-mesh
//     default: 11 nodes × 11 / 2 = 55 agreements)
//
// POST /api/sgtx/mutual-ustn
//   body: { nodeA, nodeB, status?, signedAt?, terminatesAt?, signedBy?, legalBasis? }
//   → register a new mutual USTN recognition agreement (or update an existing
//     one for the same pair). Returns { recognitionId, status }.
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  getRecognitionAgreements,
  registerUstnRecognition,
} from "@/lib/sgtx/mutual-ustn";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  try {
    const result = getRecognitionAgreements();
    const active = result.agreements.filter((a) => a.status === "ACTIVE").length;
    const suspended = result.agreements.filter((a) => a.status === "SUSPENDED").length;
    const terminated = result.agreements.filter((a) => a.status === "TERMINATED").length;
    const pending = result.agreements.filter((a) => a.status === "PENDING").length;

    return NextResponse.json({
      ok: true,
      count: result.count,
      summary: {
        total: result.count,
        active,
        suspended,
        terminated,
        pending,
        full_mesh_nodes: 11,
        full_mesh_target: 55,  // 11 × 10 / 2
      },
      agreements: result.agreements,
      note: "Mutual USTN recognition agreements between sovereign nodes. Default = full-mesh ACTIVE (55 agreements between 11 default nodes). Use POST to register/suspend/terminate agreements.",
    });
  } catch (err: any) {
    logger.error("[api/sgtx/mutual-ustn] GET failed", {
      error: err?.message,
      stack: err?.stack,
    });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const nodeA: string = body?.nodeA || body?.node_a || "";
    const nodeB: string = body?.nodeB || body?.node_b || "";
    const agreement = {
      status: body?.status,
      signedAt: body?.signedAt || body?.signed_at,
      terminatesAt: body?.terminatesAt || body?.terminates_at,
      signedBy: body?.signedBy || body?.signed_by,
      legalBasis: body?.legalBasis || body?.legal_basis,
    };

    if (!nodeA || !nodeB) {
      return NextResponse.json(
        {
          ok: false,
          error: "body.nodeA + body.nodeB must both be non-empty sovereign node IDs (e.g. 'NODE-CAIRO-01', 'NODE-FRANKFURT-01')",
          example: {
            nodeA: "NODE-CAIRO-01",
            nodeB: "NODE-FRANKFURT-01",
            status: "ACTIVE",
            legalBasis: "Egypt-EU Association Agreement Art. 5 (USTN mutual recognition)",
          },
        },
        { status: 400 },
      );
    }

    const result = registerUstnRecognition(nodeA, nodeB, agreement);

    if (!result.recognitionId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to register recognition agreement — nodeA or nodeB was empty",
          nodeA,
          nodeB,
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      ...result,
      nodeA,
      nodeB,
    });
  } catch (err: any) {
    logger.error("[api/sgtx/mutual-ustn] POST failed", {
      error: err?.message,
      stack: err?.stack,
    });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
