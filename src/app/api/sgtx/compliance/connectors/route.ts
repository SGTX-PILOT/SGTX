// @ts-nocheck
// SGTX Phase 3 §8 — Compliance Connector Registry API
//   GET  /api/sgtx/compliance/connectors         — list all ComplianceConnector rows
//        Query: ?subsystem=&status=&jurisdictionCode=
//   POST /api/sgtx/compliance/connectors         — upsert a ComplianceConnector
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  listComplianceConnectors,
  upsertComplianceConnector,
} from "@/lib/sgtx/compliance-connector";

export const dynamic = "force-dynamic";

// GET — list ComplianceConnector rows filtered by subsystem / status /
// jurisdictionCode.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const subsystem = url.searchParams.get("subsystem") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const jurisdictionCode =
      url.searchParams.get("jurisdictionCode") || undefined;

    const connectors = await listComplianceConnectors({
      subsystem,
      status,
      jurisdictionCode,
    });
    return NextResponse.json({
      connectors,
      count: connectors.length,
    });
  } catch (err: any) {
    logger.error("[api/sgtx/compliance/connectors] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// POST — upsert a ComplianceConnector row. Body = UpsertConnectorInput.
// Calls upsertComplianceConnector (find-then-upsert keyed on
// subsystem + jurisdictionCode).
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "request body required" },
        { status: 400 },
      );
    }
    if (!body.subsystem || !body.connectorName || !body.connectorType) {
      return NextResponse.json(
        { error: "subsystem, connectorName and connectorType are required" },
        { status: 400 },
      );
    }
    const connector = await upsertComplianceConnector(body);
    return NextResponse.json({ connector });
  } catch (err: any) {
    logger.error("[api/sgtx/compliance/connectors] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
