// 7.3 — CargoX: submit shipment, get ACID
import { NextRequest, NextResponse } from "next/server";
import { submitCargoXShipment } from "@/lib/sgtx/government";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await submitCargoXShipment(body);
    if (!result.ok) return NextResponse.json({ error: result.reason, fallback: (result as any).fallback }, { status: 400 });
    return NextResponse.json(result);
  } catch (e: any) { console.error("[government/cargox]", e); return NextResponse.json({ error: e.message }, { status: 500 }); }
}
