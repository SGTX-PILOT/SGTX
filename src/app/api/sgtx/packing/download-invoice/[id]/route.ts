// 5.4 — Invoice Download (UBL 2.1 XML)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await db.invoice.findUnique({ where: { id } });
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  return new NextResponse(invoice.ublXml || "<?xml version=\"1.0\"?><Invoice/>", {
    headers: {
      "Content-Type": "application/xml",
      "Content-Disposition": `attachment; filename="${invoice.invoiceNumber}.xml"`,
    },
  });
}
