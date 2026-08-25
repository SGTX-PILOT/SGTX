// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const goodsValue = body.goodsValue || 0;
    const freightCost = body.freightCost || 0;
    const insuranceCost = body.insuranceCost || 0;
    const dutyRate = body.dutyRate || 5.5;
    const vatRate = body.vatRate || 20;
    const brokerFee = body.brokerFee || 250;
    const sgtxFeeRate = 0.015;
    const sgtxFee = Math.round(goodsValue * sgtxFeeRate * 100) / 100;
    const dutyAmount = Math.round(goodsValue * (dutyRate / 100) * 100) / 100;
    const vatAmount = Math.round((goodsValue + freightCost + insuranceCost + dutyAmount) * (vatRate / 100) * 100) / 100;
    const packaging = body.packaging || 500;
    const inland = body.inland || 300;
    const inspection = body.inspection || 200;
    const certificates = body.certificates || 150;
    const transit = body.transit || 0;
    const destHandling = body.destHandling || 400;
    const other = body.other || 0;
    const total = goodsValue + packaging + inland + certificates + inspection + insuranceCost + freightCost + transit + destHandling + dutyAmount + vatAmount + brokerFee + other + sgtxFee;
    const breakdown = [
      { component: "Goods Value", amount: goodsValue, percentage: Math.round(goodsValue / total * 1000) / 10 },
      { component: "Packaging", amount: packaging, percentage: Math.round(packaging / total * 1000) / 10 },
      { component: "Inland Transport", amount: inland, percentage: Math.round(inland / total * 1000) / 10 },
      { component: "Certificates", amount: certificates, percentage: Math.round(certificates / total * 1000) / 10 },
      { component: "Inspection", amount: inspection, percentage: Math.round(inspection / total * 1000) / 10 },
      { component: "Insurance", amount: insuranceCost, percentage: Math.round(insuranceCost / total * 1000) / 10 },
      { component: "International Freight", amount: freightCost, percentage: Math.round(freightCost / total * 1000) / 10 },
      { component: "Transit", amount: transit, percentage: Math.round(transit / total * 1000) / 10 },
      { component: "Destination Handling", amount: destHandling, percentage: Math.round(destHandling / total * 1000) / 10 },
      { component: "Duty", amount: dutyAmount, percentage: Math.round(dutyAmount / total * 1000) / 10 },
      { component: "VAT/GST", amount: vatAmount, percentage: Math.round(vatAmount / total * 1000) / 10 },
      { component: "Broker Fee", amount: brokerFee, percentage: Math.round(brokerFee / total * 1000) / 10 },
      { component: "Other Fees", amount: other, percentage: Math.round(other / total * 1000) / 10 },
      { component: "SGTX Fee (1.5%)", amount: sgtxFee, percentage: Math.round(sgtxFee / total * 1000) / 10 },
    ];
    return NextResponse.json({ ok: true, totalLandedCost: Math.round(total * 100) / 100, currency: body.currency || "USD", breakdown });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
