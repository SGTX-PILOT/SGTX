import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { orchestrateStage1Payment, getOneClickTriggerStatus } from "@/lib/sgtx/gov";

// POST /api/sgtx/gov/oneclick-trigger — orchestrate all gov calls after Stage 1 payment (Part 7.1)
//
// Body:
//   ustn: string                  — required
//   tradeId?: string
//   feeLockId?: string            — FeeLock row id (set when PSP webhook confirmed Stage 1 split)
//   paymentAttemptId?: string     — PaymentAttempt row id (set when PSP webhook confirmed)
//   sellerGtid?: string           — for governor GGOV1 mTLS cert lookup
//   brokerGtid?: string           — for broker-certified Nafeza submission
//   tradeData?: object            — CargoX envelope + Nafeza SAD payload (see OrchestrateParams)
//   invoiceData?: object          — ETA invoice payload (only fired if fireEta: true)
//   fireEta?: boolean             — default false (ETA fires at contract lock, not Stage 1 payment)
//   beneficiaryIban?: string      — required if !skipCbeSettlement
//   settlementAmount?: number     — required if !skipCbeSettlement
//   settlementCurrency?: string   — default "USD"
//   skipCbeSettlement?: boolean   — default false
//
// Returns: { ok, ustn, orchestrationStatus, cargox?, nafeza?, eta?, cbe?, governorVerdict,
//            governorConditions, errors[] }
//
// GET /api/sgtx/gov/oneclick-trigger?ustn=... — return persisted orchestration state

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn } = body || {};
    if (!ustn || typeof ustn !== "string") {
      return NextResponse.json(
        { error: "Missing required field: ustn" },
        { status: 400 }
      );
    }

    const result = await orchestrateStage1Payment({
      ustn,
      tradeId: body.tradeId,
      feeLockId: body.feeLockId,
      paymentAttemptId: body.paymentAttemptId,
      sellerGtid: body.sellerGtid,
      brokerGtid: body.brokerGtid,
      tradeData: body.tradeData,
      invoiceData: body.invoiceData,
      fireEta: body.fireEta === true,
      beneficiaryIban: body.beneficiaryIban,
      settlementAmount: body.settlementAmount != null ? Number(body.settlementAmount) : undefined,
      settlementCurrency: body.settlementCurrency,
      skipCbeSettlement: body.skipCbeSettlement === true,
    });

    const httpStatus = result.orchestrationStatus === "FAILED" ? 500
      : result.orchestrationStatus === "PARTIAL" ? 207
      : 200;

    return NextResponse.json({
      ok: result.orchestrationStatus === "COMPLETED",
      ustn: result.ustn,
      orchestrationStatus: result.orchestrationStatus,
      cargox: result.cargox,
      nafeza: result.nafeza,
      eta: result.eta,
      cbe: result.cbe,
      governorVerdict: result.governorVerdict,
      governorConditions: result.governorConditions,
      errors: result.errors,
    }, { status: httpStatus });
  } catch (e: any) {
    logger.error("[gov/oneclick-trigger POST] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to orchestrate OneClick trigger" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ustn = searchParams.get("ustn");
    if (!ustn) {
      return NextResponse.json(
        { error: "Missing required query parameter: ustn" },
        { status: 400 }
      );
    }
    const status = await getOneClickTriggerStatus(ustn);
    if (!status) {
      return NextResponse.json(
        { error: `No OneClick trigger found for USTN ${ustn}` },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, ...status });
  } catch (e: any) {
    logger.error("[gov/oneclick-trigger GET] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to fetch OneClick trigger status" },
      { status: 500 }
    );
  }
}
