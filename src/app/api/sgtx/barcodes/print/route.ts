import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

type PrintFormat = "ZPL" | "PDF";
type PrintTemplate = "Standard" | "Customs-Ready" | "Consignee" | "Treatment-Aware";

const ALLOWED_FORMATS: PrintFormat[] = ["ZPL", "PDF"];
const ALLOWED_TEMPLATES: PrintTemplate[] = [
  "Standard",
  "Customs-Ready",
  "Consignee",
  "Treatment-Aware",
];

/**
 * Escape special ZPL characters (^ and ~) in user content.
 */
function zplEscape(value: string | null | undefined): string {
  if (!value) return "";
  return String(value).replace(/\^/g, "\\^").replace(/~/g, "\\~");
}

/**
 * Build a single ZPL label for a pallet.
 * Includes: SSCC-128 barcode, human-readable SSCC, product, USTN, lot, weight,
 * origin country, treatment status, and a QR placeholder field.
 */
function buildZplLabel(opts: {
  sscc: string;
  ustn: string;
  product?: string | null;
  lotNumber?: string | null;
  netWeightKg?: number | null;
  grossWeightKg?: number | null;
  originCountry?: string | null;
  treatmentStatus?: string | null;
  template: PrintTemplate;
}): string {
  const templateTag = `^FH^FDTEMPLATE: ${opts.template}^FS`;
  const treatmentLine =
    opts.template === "Treatment-Aware" && opts.treatmentStatus
      ? `^FO30,330^A0N,28,28^FDTREATMENT: ${zplEscape(opts.treatmentStatus)}^FS`
      : "";

  return [
    "^XA",
    "^CI28", // UTF-8
    templateTag,
    // Top banner — SGTX
    "^FO30,30^A0N,36,36^FDSGTX SOVEREIGN TRADE^FS",
    "^FO30,70^A0N,22,22^FDSSCC-18 PALLET LABEL^FS",
    // SSCC-128 barcode (Code-128 subset C, full 18 digits)
    `^FO30,110^BY3^BCN,100,Y,N,N^FD${zplEscape(opts.sscc)}^FS`,
    // Human-readable SSCC
    `^FO30,235^A0N,28,28^FDSSCC: ${zplEscape(opts.sscc)}^FS`,
    // USTN
    `^FO30,265^A0N,24,24^FDUSTN: ${zplEscape(opts.ustn)}^FS`,
    // Product
    `^FO30,295^A0N,24,24^FDPRODUCT: ${zplEscape(opts.product)}^FS`,
    treatmentLine,
    // Lot + weight + origin
    `^FO30,365^A0N,22,22^FDLOT: ${zplEscape(opts.lotNumber)}^FS`,
    `^FO30,390^A0N,22,22^FDNET: ${opts.netWeightKg ?? "-"} KG | GROSS: ${opts.grossWeightKg ?? "-"} KG^FS`,
    `^FO30,415^A0N,22,22^FDORIGIN: ${zplEscape(opts.originCountry)}^FS`,
    // QR code placeholder (stores SSCC for offline verify)
    `^FO400,300^BQN,2,6^FDQA,${zplEscape(opts.sscc)}^FS`,
    "^XZ",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Build the full ZPL payload for a print job across one or more pallets.
 */
function buildZplJob(
  pallets: Array<{
    sscc: string;
    ustn: string;
    product?: string | null;
    lotNumber?: string | null;
    netWeightKg?: number | null;
    grossWeightKg?: number | null;
    originCountry?: string | null;
    treatmentStatus?: string | null;
  }>,
  template: PrintTemplate,
): string {
  return pallets.map((p) => buildZplLabel({ ...p, template })).join("\n");
}

// POST /api/sgtx/barcodes/print
// Body: { ustn, tradeId?, palletIds, format, template }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, tradeId, palletIds, format, template } = body as {
      ustn?: string;
      tradeId?: string;
      palletIds?: string[];
      format?: PrintFormat;
      template?: PrintTemplate;
    };

    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    if (!Array.isArray(palletIds) || palletIds.length === 0) {
      return NextResponse.json({ error: "palletIds[] required" }, { status: 400 });
    }

    const fmt: PrintFormat = (format ?? "ZPL") as PrintFormat;
    const tpl: PrintTemplate = (template ?? "Standard") as PrintTemplate;

    if (!ALLOWED_FORMATS.includes(fmt)) {
      return NextResponse.json({ error: "invalid format" }, { status: 400 });
    }
    if (!ALLOWED_TEMPLATES.includes(tpl)) {
      return NextResponse.json({ error: "invalid template" }, { status: 400 });
    }

    const pallets = await db.palletDetail.findMany({
      where: { id: { in: palletIds }, ustn },
    });

    if (pallets.length === 0) {
      return NextResponse.json(
        { error: "no matching pallets found for palletIds+ustn" },
        { status: 404 },
      );
    }

    const zplData = buildZplJob(
      pallets.map((p) => ({
        sscc: p.sscc,
        ustn: p.ustn,
        product: p.product,
        lotNumber: p.lotNumber,
        netWeightKg: p.netWeightKg,
        grossWeightKg: p.grossWeightKg,
        originCountry: p.originCountry,
        treatmentStatus: p.treatmentStatus,
      })),
      tpl,
    );

    const job = await db.barcodePrintJob.create({
      data: {
        ustn,
        tradeId: tradeId ?? null,
        palletIds: JSON.stringify(pallets.map((p) => p.id)),
        format: fmt,
        template: tpl,
        status: "PENDING",
      },
    });

    return NextResponse.json({
      ok: true,
      jobId: job.id,
      format: fmt,
      template: tpl,
      palletCount: pallets.length,
      zplData,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "PRINT_FAILED", detail: message }, { status: 500 });
  }
}
