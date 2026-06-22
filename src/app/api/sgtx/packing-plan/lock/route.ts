import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createHash } from "crypto";

// POST /api/sgtx/packing-plan/lock — Lock packing plan + generate SSCC-18 pallets (Part 5.11)
export async function POST(req: NextRequest) {
  try {
    const { ustn, tradeId, layerPatterns, totalCartons, totalPallets, totalNetKg, totalGrossKg, carbonFootprintKg } = await req.json();
    if (!ustn || !tradeId) return NextResponse.json({ error: "ustn and tradeId required" }, { status: 400 });
    const planData = JSON.stringify({ layerPatterns, totalCartons, totalPallets, totalNetKg, totalGrossKg, carbonFootprintKg });
    const loomHash = "sha256:" + createHash("sha256").update(planData + ustn + Date.now()).digest("hex");
    const plan = await db.packingPlan.create({ data: { tradeId, ustn, layerPatterns: JSON.stringify(layerPatterns || []), totalCartons: totalCartons || 0, totalPallets: totalPallets || 0, totalNetKg: totalNetKg || 0, totalGrossKg: totalGrossKg || 0, carbonFootprintKg: carbonFootprintKg || null, loomHash, locked: true, lockedAt: new Date() } });
    // Generate SSCC-18 pallets
    const pallets: any[] = [];
    for (let i = 0; i < (totalPallets || 0); i++) {
      const companyPrefix = "0002139000";
      const serialRef = String(i + 1).padStart(9, "0");
      const sscc17 = "0" + companyPrefix + serialRef;
      let sum = 0; for (let j = 0; j < 17; j++) { sum += j % 2 === 0 ? parseInt(sscc17[j]) * 3 : parseInt(sscc17[j]); }
      const checkDigit = (10 - (sum % 10)) % 10;
      const sscc = sscc17 + checkDigit;
      const qrData = JSON.stringify({ "@context": "https://www.w3.org/2018/credentials/v1", type: ["VerifiableCredential", "PalletCredential"], credentialSubject: { sscc, ustn, palletNo: i + 1 } });
      const palletHash = createHash("sha256").update(sscc + ustn).digest("hex");
      const pallet = await db.palletDetail.create({ data: { tradeId, ustn, sscc, sequence: i + 1, qrData, loomHash: "sha256:" + palletHash } });
      pallets.push({ sscc, palletId: pallet.id });
    }
    await db.activity.create({ data: { tradeId, actorGtid: "system", action: "PACKING_PLAN_LOCKED", type: "SUCCESS", description: `Packing plan locked. ${totalPallets} pallets, SSCC-18 generated. Loom: ${loomHash.slice(0, 32)}...` } });
    return NextResponse.json({ ok: true, packingPlanId: plan.id, loomHash, palletCount: pallets.length, pallets });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
