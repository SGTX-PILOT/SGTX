import { NextRequest, NextResponse } from "next/server";
import { generateInvoicePdfA3, generateUblXml, generateInvoiceQr, submitInvoice } from "@/lib/sgtx/gov";

// POST /api/sgtx/gov/eta/pdf-a3 — generate a PDF/A-3 eInvoice with embedded XML (Blueprint 7.4)
//
// Two invocation modes:
//
//   Mode A — submit + generate (no prior ETA submission):
//     Body: {
//       ustn: string,
//       invoiceData: { id?, supplier, customer, lines[], currency, ... },
//       submit?: boolean   // default true → also POSTs to ETA, gets UUID + QR
//     }
//     Returns: { ok, uuid, qrCode, status, pdfBase64, pdfHash, loomHash, generatedAt }
//
//   Mode B — generate-only (caller already has UUID + QR from a prior submit):
//     Body: {
//       ustn?: string,
//       uuid: string,
//       qrCode: string,
//       invoiceData: { ... }   // used to generate the UBL 2.1 XML embedded in the PDF
//     }
//     Returns: { ok, pdfBase64, pdfHash, loomHash, generatedAt }
//
// Per Blueprint 7.4 the eInvoice PDF/A-3 (ISO 19005-3) is the archival form
// of the ETA submission — it carries the UUID + QR visibly and embeds the
// signed UBL 2.1 XML so tax inspectors can recover the original XML from
// the PDF itself during an audit.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, uuid, qrCode, invoiceData, submit } = body || {};

    if (!invoiceData || typeof invoiceData !== "object") {
      return NextResponse.json(
        { error: "Missing required field: invoiceData (object)" },
        { status: 400 }
      );
    }

    let resolvedUuid = uuid;
    let resolvedQr = qrCode;

    // Mode A — submit to ETA first if caller didn't supply a UUID/QR.
    if ((!resolvedUuid || !resolvedQr) && submit !== false) {
      if (!ustn || typeof ustn !== "string") {
        return NextResponse.json(
          { error: "ustn is required when submit=true (or when uuid/qrCode are not supplied)" },
          { status: 400 }
        );
      }
      const submitted = await submitInvoice(ustn, invoiceData);
      resolvedUuid = submitted.uuid;
      resolvedQr = submitted.qrCode;
    }

    if (!resolvedUuid || !resolvedQr) {
      return NextResponse.json(
        { error: "uuid + qrCode are required when submit=false" },
        { status: 400 }
      );
    }

    // Generate the UBL 2.1 XML for embedding.
    const ublXml = generateUblXml(invoiceData);

    const pdfResult = generateInvoicePdfA3({
      uuid: resolvedUuid,
      qrCode: resolvedQr,
      ublXml,
      ustn,
    });

    return NextResponse.json({
      ok: true,
      uuid: resolvedUuid,
      qrCode: resolvedQr,
      pdfBase64: pdfResult.pdfBase64,
      pdfHash: pdfResult.pdfHash,
      xmpMetadata: pdfResult.xmpMetadata,
      loomHash: pdfResult.loomHash,
      generatedAt: pdfResult.generatedAt,
      ublXmlLength: ublXml.length,
    }, { status: 201 });
  } catch (e: any) {
    console.error("[gov/eta/pdf-a3 POST] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to generate ETA PDF/A-3 invoice" },
      { status: 500 }
    );
  }
}

// GET /api/sgtx/gov/eta/pdf-a3?uuid=...&ustn=... — generate a PDF/A-3 from a known UUID
//
// Convenience GET form: caller passes the UUID + ustn + invoice fields as query
// params (invoice fields flattened — supplierName, supplierTaxId, customerName,
// customerTaxId, currency, lineDescription, lineAmount, ...). Useful for
// testing / browser preview.

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const uuid = searchParams.get("uuid");
    const ustn = searchParams.get("ustn") ?? undefined;

    if (!uuid) {
      return NextResponse.json(
        { error: "Missing required query parameter: uuid" },
        { status: 400 }
      );
    }

    // Build a minimal invoiceData from query params + synthesise a placeholder QR.
    const invoiceData = {
      id: searchParams.get("invoiceId") ?? `INV-${uuid.slice(0, 8)}`,
      currency: searchParams.get("currency") ?? "EGP",
      taxRate: Number(searchParams.get("taxRate") ?? 14),
      supplier: {
        name: searchParams.get("supplierName") ?? "SGTX Test Supplier",
        taxId: searchParams.get("supplierTaxId") ?? "123-456-789",
      },
      customer: {
        name: searchParams.get("customerName") ?? "SGTX Test Customer",
        taxId: searchParams.get("customerTaxId") ?? "987-654-321",
      },
      lines: [
        {
          description: searchParams.get("lineDescription") ?? "Test line item",
          amount: Number(searchParams.get("lineAmount") ?? 1000),
          quantity: 1,
          unit: "KGM",
        },
      ],
    };

    const ublXml = generateUblXml(invoiceData);
    const qrCode = generateInvoiceQr(invoiceData);

    const pdfResult = generateInvoicePdfA3({ uuid, qrCode, ublXml, ustn });

    return NextResponse.json({
      ok: true,
      uuid,
      ustn: ustn ?? null,
      pdfBase64: pdfResult.pdfBase64,
      pdfHash: pdfResult.pdfHash,
      loomHash: pdfResult.loomHash,
      generatedAt: pdfResult.generatedAt,
    });
  } catch (e: any) {
    console.error("[gov/eta/pdf-a3 GET] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to generate ETA PDF/A-3 invoice" },
      { status: 500 }
    );
  }
}
