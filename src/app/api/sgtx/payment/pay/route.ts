// POST /api/sgtx/payment/pay — body: { ustn, stage, pspProvider }
// Processes PSP split, activates FeeLock (Part 6.1.2 sequence)
import { NextRequest, NextResponse } from "next/server";
import { processPspSplit, selectOptimalPsp, PSP_PROVIDERS, PspProvider } from "@/lib/sgtx/payment/psp-split";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, stage, pspProvider } = body;
    if (!ustn || !stage) return NextResponse.json({ error: "ustn and stage required" }, { status: 400 });
    if (!["STAGE1", "STAGE2"].includes(stage)) {
      return NextResponse.json({ error: "stage must be STAGE1 or STAGE2" }, { status: 400 });
    }

    let provider: PspProvider;
    if (pspProvider) {
      if (!PSP_PROVIDERS.includes(pspProvider)) {
        return NextResponse.json({ error: `pspProvider must be one of ${PSP_PROVIDERS.join(", ")}` }, { status: 400 });
      }
      provider = pspProvider;
    } else {
      // Auto-select via PSP router (Part 6.5.1)
      const router = await selectOptimalPsp("EG", 0, "USD");
      provider = router.provider;
    }

    const result = await processPspSplit(ustn, stage as "STAGE1" | "STAGE2", provider);

    return NextResponse.json({
      ok: result.ok,
      ustn,
      stage,
      pspProvider: provider,
      paymentAttemptId: result.paymentAttemptId,
      pspReference: result.pspReference,
      idempotencyKey: result.idempotencyKey,
      feeLockStatus: result.feeLockStatus,
      splitInstruction: result.splitInstruction,
      processed: result.processed,
    });
  } catch (e: any) {
    console.error("[payment/pay]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
