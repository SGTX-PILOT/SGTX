// 5.3.2 — Verify Pallet (by SSCC) — returns QR payload + W3C VC
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const sscc = req.nextUrl.searchParams.get("sscc");
  if (!sscc) return NextResponse.json({ error: "sscc required" }, { status: 400 });

    const pallet = await db.palletDetail.findUnique({ where: { sscc } }) as any;
    if (!pallet) return NextResponse.json({ error: "Pallet not found", sscc }, { status: 404 }) as any;

  // Parse QR payload (JSON)
  let qrPayload: any = null;
  try { qrPayload = JSON.parse(pallet.qrCodeData || "{}"); } catch { /* ignore */ }

  return NextResponse.json({
    verified: true,
    sscc: pallet.sscc,
    palletId: pallet.palletId,
    commodityHs: pallet.commodityHs,
    totalCartons: pallet.totalCartons,
    totalHeightMm: pallet.totalHeightMm,
    totalWeightKg: pallet.totalWeightKg,
    layerPatterns: JSON.parse(pallet.layerPatterns),
    qrPayload,
    verifyUrl: `https://sgtx.io/verify/pallet?sscc=${pallet.sscc}`,
    }) as any;
}
