// @ts-nocheck
// POST /api/sgtx/road/customs/operations/{id}/submit
// Body: { declarationNumber?, country? }
// Submits a draft customs operation — delegates to the jurisdiction adapter
// for the operation's country to attempt filing, then updates the row to
// SUBMITTED status with the resulting reference (if any).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getJurisdictionAdapter } from "@/lib/sgtx/road-corridor/jurisdiction-adapter";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "operation id required" }, { status: 400 });
    }
    const body = (await req.json().catch(() => ({}))) || {};
    const operation = await db.customsOperation.findUnique({ where: { id } });
    if (!operation) {
      return NextResponse.json({ error: "customs operation not found" }, { status: 404 });
    }
    if (operation.status === "SUBMITTED" || operation.status === "ACCEPTED") {
      return NextResponse.json(
        { error: `operation already in status ${operation.status}` },
        { status: 409 },
      );
    }

    const country = operation.country;
    const adapter = getJurisdictionAdapter(country);

    // If the operation has no declarationNumber yet, attempt to create one
    // via the jurisdiction adapter (may return MANUAL_REQUIRED + a placeholder
    // government reference).
    let declarationNumber = body.declarationNumber || operation.declarationNumber;
    let govReference = operation.governmentReference;

    if (!declarationNumber) {
      let filingResult;
      if (operation.operationType === "EG_EXPORT") {
        filingResult = await adapter.createExportDeclaration({
          ustn: operation.ustn,
          country,
        });
      } else if (
        operation.operationType === "EG_TRANSIT" ||
        operation.operationType === "TRANSIT_CONTINUATION" ||
        operation.operationType === "CROSS_BORDER_TRANSIT"
      ) {
        filingResult = await adapter.createTransitDeclaration({
          ustn: operation.ustn,
          country,
        });
      } else if (operation.operationType === "EG_IMPORT") {
        filingResult = await adapter.createImportDeclaration({
          ustn: operation.ustn,
          country,
        });
      } else {
        filingResult = { status: "NOT_SUPPORTED" };
      }
      if (filingResult?.reference) {
        declarationNumber = filingResult.reference;
        govReference = filingResult.reference;
      }
    }

    // Mark as submitted (even if filing returned MANUAL_REQUIRED, the operator
    // is responsible for the actual Nafeza submission; the row reflects that
    // the platform has done all it can).
    const updated = await db.customsOperation.update({
      where: { id },
      data: {
        status: "SUBMITTED",
        submissionTime: new Date(),
        declarationNumber: declarationNumber || null,
        governmentReference: govReference || null,
      },
    });

    logger.info("[api/road/customs/operations/[id]/submit] submitted", {
      operationId: id,
      country,
      status: updated.status,
    });

    return NextResponse.json({
      operation: updated,
      adapterStatus: adapter.countryCode === "__BASE__" ? "NOT_SUPPORTED" : "OK",
    });
  } catch (err: any) {
    logger.error("[api/road/customs/operations/[id]/submit] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
