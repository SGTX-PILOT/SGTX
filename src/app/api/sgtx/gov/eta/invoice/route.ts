import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { submitInvoice, generateUblXml, generateInvoiceQr } from "@/lib/sgtx/gov";

// POST /api/sgtx/gov/eta/invoice — submit an e-invoice to the Egyptian Tax Authority
// Body: {
//   ustn: string,
//   invoiceData: {
//     id?: string, invoiceNumber?: string, currency?: string, taxRate?: number,
//     issueDate?: string, typeCode?: string,
//     supplier: { name, taxId }, customer: { name, taxId },
//     lines: [{ description, quantity, unit, amount, sku, name }]
//   },
//   generateUbl?: boolean   // if true, also returns the UBL 2.1 XML string
// }
// Returns: { ok, uuid, qrCode, status, submittedAt, ublXml?, qrPayloadDecoded? }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, invoiceData, generateUbl } = body || {};

    if (!ustn || typeof ustn !== "string") {
      return NextResponse.json(
        { error: "Missing required field: ustn" },
        { status: 400 }
      );
    }
    if (!invoiceData || typeof invoiceData !== "object") {
      return NextResponse.json(
        { error: "Missing required field: invoiceData (object)" },
        { status: 400 }
      );
    }

    const result = await submitInvoice(ustn, invoiceData);

    const response: any = {
      ok: true,
      uuid: result.uuid,
      qrCode: result.qrCode,
      status: result.status,
      submittedAt: new Date().toISOString(),
    };

    if (generateUbl) {
      response.ublXml = generateUblXml(invoiceData);
    }

    // Always include the decoded QR payload for debugging / display purposes.
    try {
      response.qrPayloadDecoded = JSON.parse(
        Buffer.from(result.qrCode, "base64").toString("utf8")
      );
    } catch {
      // ignore decode failures
    }

    return NextResponse.json(response);
  } catch (e: any) {
    logger.error("[gov/eta/invoice] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to submit invoice to ETA" },
      { status: 500 }
    );
  }
}
