// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { classifyCommodity } = await import("@/lib/sgtx/customs-gateway/commodity-model");
    const desc = req.nextUrl.searchParams.get("description") || "";
    const juris = req.nextUrl.searchParams.get("jurisdiction") || undefined;
    const results = await classifyCommodity(desc, juris);
    return NextResponse.json({ ok: true, classifications: results });
  } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { createCommodityClassification } = await import("@/lib/sgtx/customs-gateway/commodity-model");
    const result = await createCommodityClassification(body);
    return NextResponse.json({ ok: true, commodity: result });
  } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}
