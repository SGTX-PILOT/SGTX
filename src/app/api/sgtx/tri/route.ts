import { NextRequest, NextResponse } from "next/server";
import { calculateTri } from "@/lib/sgtx/dispute";

export async function POST(req: NextRequest) {
  try {
    const { tenantGtid } = await req.json();
    if (!tenantGtid) return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });
    const result = await calculateTri(tenantGtid);
    return NextResponse.json(result);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
