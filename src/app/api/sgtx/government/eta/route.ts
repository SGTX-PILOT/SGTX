// 7.4 — ETA: submit e-Invoice, get UUID + QR
import { NextRequest, NextResponse } from "next/server";
import { submitEtaInvoice } from "@/lib/sgtx/government";

export async function POST(req: NextRequest) {
  try {
    const { ustn, invoiceXml, invoiceNumber } = await req.json();
    if (!ustn || !invoiceXml || !invoiceNumber) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    const result = await submitEtaInvoice({ ustn, invoiceXml, invoiceNumber });
    if (!result.ok) return NextResponse.json({ error: result.reason, fallback: (result as any).fallback }, { status: 400 });
    return NextResponse.json(result);
  } catch (e: any) { console.error("[government/eta]", e); return NextResponse.json({ error: e.message }, { status: 500 }); }
}
