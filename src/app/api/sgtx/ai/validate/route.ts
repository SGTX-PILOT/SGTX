// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { validateTradeRequest, validatePayment, validateContract, validateDispute } from "@/lib/sgtx/ai/workflow-validation";

// POST /api/sgtx/ai/validate
// Body: { type: "trade" | "payment" | "contract" | "dispute", ...params }
// Returns: { passed, confidence, reason, warnings, recommendations }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, ...params } = body;

    let result;
    switch (type) {
      case "trade":
        result = await validateTradeRequest(params);
        break;
      case "payment":
        result = await validatePayment(params);
        break;
      case "contract":
        result = await validateContract(params);
        break;
      case "dispute":
        result = await validateDispute(params);
        break;
      default:
        return NextResponse.json({ error: "type must be one of: trade, payment, contract, dispute" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, type, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
