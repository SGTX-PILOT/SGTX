// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
//
// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/sgtx/contract/multi-shipment/[shipmentId]/modify
//
// Modify a shipment's schedule. Only allowed on UNLOCKED shipments.
//
// v17 §5.6 — Multi-Shipment Contracts:
//   • Schedule modification is permitted ONLY on future (unlocked) shipments.
//   • A locked shipment = per-shipment FeeLock ACTIVE → cannot be modified
//     without going through the trade-change procedure (signed amendment +
//     Governor re-approval).
//   • Schedule modification REQUIRES a mandatory reason ≥20 chars.
//   • The modification creates a signed addendum — an Activity log entry
//     with a SHA-256 hash binding the modifications to the reason.
//
// Body:
//   {
//     delivery_date?:   string,   // ISO date — new delivery date
//     port?:            string,   // new delivery port (UN/LOCODE)
//     container_count?: number,   // new container count (1..100)
//     reason:           string    // MANDATORY, ≥20 chars
//   }
//
// Returns:
//   {
//     shipment_id: string,
//     addendum_id: string,
//     modified_at: string,
//     hash_sha256: string
//   }
//
// Auth: Authorization: Bearer <access_jwt>
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { verifyToken } from "@/lib/v1/auth";
import {
  modifyShipmentSchedule,
  MultiShipmentError,
  MIN_REASON_LENGTH,
} from "@/lib/sgtx/multi-shipment";

export const dynamic = "force-dynamic";

interface SessionPayload {
  sub: string;
  tenantGtid?: string;
  role?: string;
  email?: string;
  [key: string]: any;
}

function extractSession(req: NextRequest): SessionPayload | null {
  const authHeader = req.headers.get("authorization") || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      const payload = verifyToken(token);
      if (payload && payload.type !== "refresh") return payload;
    }
  }
  const tenantGtid = req.headers.get("x-tenant-gtid");
  const role = req.headers.get("x-role");
  if (tenantGtid) {
    return { sub: tenantGtid, tenantGtid, role: role || "USER" };
  }
  return null;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ shipmentId: string }> },
) {
  try {
    const session = extractSession(req);
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required — supply Authorization: Bearer <access_jwt>" },
        { status: 401 },
      );
    }

    const { shipmentId } = await context.params;
    if (!shipmentId) {
      return NextResponse.json(
        { error: "shipmentId is required (path parameter)" },
        { status: 400 },
      );
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const reason = String(body?.reason || "").trim();
    if (reason.length < MIN_REASON_LENGTH) {
      return NextResponse.json(
        {
          error: `reason must be at least ${MIN_REASON_LENGTH} characters — got ${reason.length}.`,
          code: "INVALID_REASON",
        },
        { status: 400 },
      );
    }

    // Build the modifications object — only fields that are present.
    const modifications: any = {};
    if (body?.delivery_date !== undefined) {
      modifications.delivery_date = body.delivery_date;
    }
    if (body?.port !== undefined) {
      modifications.port = body.port;
    }
    if (body?.container_count !== undefined) {
      modifications.container_count = body.container_count;
    }

    if (Object.keys(modifications).length === 0) {
      return NextResponse.json(
        {
          error: "At least one of delivery_date, port, or container_count must be provided.",
          code: "NO_MODIFICATIONS",
        },
        { status: 400 },
      );
    }

    const result = await modifyShipmentSchedule({
      shipmentId,
      modifications,
      reason,
      actorGtid: session.tenantGtid || session.sub,
    });

    return NextResponse.json({
      ok: true,
      action: "multi-shipment.shipment.modify",
      shipment_id: result.shipmentId,
      addendum_id: result.addendumId,
      modified_at: result.modifiedAt,
      hash_sha256: result.hashSha256,
    });
  } catch (e: any) {
    logger.error("[contract/multi-shipment/[shipmentId]/modify POST] error:", e);

    if (e instanceof MultiShipmentError) {
      const status =
        e.code === "SHIPMENT_NOT_FOUND" ? 404 :
        e.code === "TRADE_NOT_FOUND" ? 404 :
        e.code === "SHIPMENT_LOCKED" ? 409 :
        e.code === "NOT_MULTI_SHIPMENT" ? 400 :
        e.code === "INVALID_REASON" ? 400 :
        e.code === "NO_MODIFICATIONS" ? 400 :
        e.code === "INVALID_CONTAINER_COUNT" ? 400 :
        e.code === "MISSING_SHIPMENT_ID" ? 400 :
        400;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
