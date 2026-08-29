// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  try {
    const { type, ustn, quoteId } = await req.json();
    const { generateCommercialInvoice, generatePackingList, generateCOOApplication, generateShippersDeclaration, generateProformaInvoice } = await import("@/lib/sgtx/documents/generators");
    let doc;
    if (type === "COMMERCIAL_INVOICE") doc = await generateCommercialInvoice(ustn);
    else if (type === "PACKING_LIST") doc = await generatePackingList(ustn);
    else if (type === "COO_APPLICATION") doc = await generateCOOApplication(ustn);
    else if (type === "SHIPPERS_DECLARATION") doc = await generateShippersDeclaration(ustn);
    else if (type === "PROFORMA_INVOICE") doc = await generateProformaInvoice(quoteId);
    else return NextResponse.json({ ok: false, error: "Unknown document type" }, { status: 400 });
    if (!doc) return NextResponse.json({ ok: false, error: "Could not generate document — trade not found" }, { status: 404 });
    return NextResponse.json({ ok: true, document: doc });
  } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}
