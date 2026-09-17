// @ts-nocheck
// SGTX Phase 3 §8 — Compliance Orchestrator (single-subsystem runner)
//   POST /api/sgtx/compliance/screen/[subsystem]
//   URL param: subsystem ∈ license|permits|certificates|sps|tbt|controlled-goods|sanctions
//              (also accepts the upper-case canonical names:
//              LICENSE|PERMIT|CERTIFICATE|SPS|TBT|CONTROLLED_GOODS|SANCTIONS)
//   Body: ComplianceInput — same shape as POST /api/sgtx/compliance/screen.
//   Returns: the raw subsystem result (LicenseResult / PermitDetermination / etc.).
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { runSingleSubsystem } from "@/lib/sgtx/compliance-orchestrator";

export const dynamic = "force-dynamic";

// Map URL-friendly slugs to the orchestrator's canonical subsystem names.
const SUBSYSTEM_ALIASES: Record<string, string> = {
  license: "LICENSE",
  licenses: "LICENSE",
  permit: "PERMIT",
  permits: "PERMIT",
  certificate: "CERTIFICATE",
  certificates: "CERTIFICATE",
  sps: "SPS",
  tbt: "TBT",
  "controlled-goods": "CONTROLLED_GOODS",
  controlled_goods: "CONTROLLED_GOODS",
  controlledgoods: "CONTROLLED_GOODS",
  sanctions: "SANCTIONS",
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ subsystem: string }> },
) {
  try {
    const { subsystem } = await params;
    if (!subsystem) {
      return NextResponse.json(
        { error: "subsystem path parameter required" },
        { status: 400 },
      );
    }
    const canonical =
      SUBSYSTEM_ALIASES[String(subsystem).toLowerCase()] ||
      String(subsystem).toUpperCase();

    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "request body required" },
        { status: 400 },
      );
    }
    if (!body.jurisdictionCode || !body.originCountry || !body.destCountry) {
      return NextResponse.json(
        {
          error:
            "jurisdictionCode, originCountry and destCountry are required",
        },
        { status: 400 },
      );
    }
    const result = await runSingleSubsystem(canonical, {
      hs6: body.hs6,
      productName: body.productName,
      casNumbers: Array.isArray(body.casNumbers)
        ? body.casNumbers
        : undefined,
      jurisdictionCode: body.jurisdictionCode,
      originCountry: body.originCountry,
      destCountry: body.destCountry,
      transportMode: body.transportMode,
      applicantGtid: body.applicantGtid,
      intendedUse: body.intendedUse,
      season: body.season,
      preferentialAgreementId: body.preferentialAgreementId,
      shippingTransshipment: body.shippingTransshipment,
      counterpartyName: body.counterpartyName,
      vesselName: body.vesselName,
      aircraftId: body.aircraftId,
      portOfLoading: body.portOfLoading,
      portOfDischarge: body.portOfDischarge,
      financialCounterparty: body.financialCounterparty,
    });
    if (result && typeof result === "object" && "error" in result) {
      return NextResponse.json(
        { error: result.error, subsystem: canonical },
        { status: 400 },
      );
    }
    return NextResponse.json({ subsystem: canonical, result });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/compliance/screen/[subsystem]] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
