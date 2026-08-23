// @ts-nocheck
// §37 Bank Settlement Gateway — create gateway instruction (POST) + list by USTN (GET)
// POST /api/sgtx/constitutional/bank-gateway  body: full CreateGatewayInstructionInput
// GET  /api/sgtx/constitutional/bank-gateway?ustn=X
import { NextResponse } from "next/server";
import {
  createGatewayInstruction,
  getGatewayByUstn,
} from "@/lib/sgtx/bank-settlement-gateway";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    if (!body || !body.integrationType) {
      return NextResponse.json(
        { error: "integrationType required" },
        { status: 400 },
      );
    }
    const gateway = await createGatewayInstruction(body);
    if (!gateway) {
      return NextResponse.json(
        { error: "createGatewayInstruction failed — see logs" },
        { status: 500 },
      );
    }
    return NextResponse.json({ gateway });
  } catch (err: any) {
    logger.error("[api/constitutional/bank-gateway] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn") || undefined;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const gateways = await getGatewayByUstn(ustn);
    return NextResponse.json({ gateways, count: gateways.length });
  } catch (err: any) {
    logger.error("[api/constitutional/bank-gateway] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
