// 5.11 — Label Print Workflow (ZPL + PDF)
import { NextRequest, NextResponse } from "next/server";
import { generateZplLabel, generateLabelPdf, requestLabelReprint } from "@/lib/sgtx/packing";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, sscc, palletId, productName, netWeightKg, grossWeightKg, ustn, lotNumber, coldTreatmentCert, language, template, reason, requestedBy } = body;

    if (action === "reprint") {
      const result = await requestLabelReprint({ palletId, reason, requestedBy });
      if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
      return NextResponse.json(result);
    }

    const format = body.format || "zpl";
    if (format === "pdf") {
      const pdf = generateLabelPdf({ sscc, palletId, productName, netWeightKg: +netWeightKg, grossWeightKg: +grossWeightKg, ustn, template });
      return new NextResponse(pdf, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="label-${palletId}.pdf"` } });
    }
    // ZPL default
    const zpl = generateZplLabel({ sscc, palletId, productName, netWeightKg: +netWeightKg, grossWeightKg: +grossWeightKg, ustn, lotNumber, coldTreatmentCert, language, template });
    return new NextResponse(zpl, { headers: { "Content-Type": "application/x-zpl", "Content-Disposition": `attachment; filename="label-${palletId}.zpl"` } });
  } catch (e: any) { console.error("[packing/label]", e); return NextResponse.json({ error: e.message }, { status: 500 }); }
}
