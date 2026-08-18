// POST /api/sgtx/shippers-declaration/create — create shipper's declaration
//
// Body:
//   {
//     ustn?: string,
//     exporterGtid: string,           // required
//     declarationReference?: string,
//     declarationDate?: string,       // ISO date
//     goodsDescription?: string,
//     hsCode?: string,
//     netWeight?: number,             // kg
//     value?: number,                  // declared customs value
//     currency?: string,
//     originCountry?: string,
//     destinationCountry?: string,
//     incoterm?: string
//   }
//
// Returns { ok, declarationId, signed: false }. The declaration is created
// in unsigned state — POST /shippers-declaration/sign to sign it.
//
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      ustn,
      exporterGtid,
      declarationReference,
      declarationDate,
      goodsDescription,
      hsCode,
      netWeight,
      value,
      currency,
      originCountry,
      destinationCountry,
      incoterm,
    } = body || {};

    if (!exporterGtid) {
      return NextResponse.json({ error: "Missing required field: exporterGtid" }, { status: 400 });
    }

    const data: any = {
      exporterGtid: String(exporterGtid).trim(),
      signed: false,
    };
    if (ustn) data.ustn = ustn;
    if (declarationReference) data.declarationReference = declarationReference;
    if (declarationDate) data.declarationDate = new Date(declarationDate);
    if (goodsDescription) data.goodsDescription = goodsDescription;
    if (hsCode) data.hsCode = hsCode;
    if (netWeight != null && !isNaN(Number(netWeight))) {
      data.netWeight = +Number(netWeight).toFixed(4);
    }
    if (value != null && !isNaN(Number(value))) {
      data.value = +Number(value).toFixed(2);
    }
    if (currency) data.currency = currency;
    if (originCountry) data.originCountry = originCountry;
    if (destinationCountry) data.destinationCountry = destinationCountry;
    if (incoterm) data.incoterm = incoterm;

    const decl = await (db as any).shippersDeclaration.create({ data });

    logger.info("[shippers-declaration/create] created", {
      declId: decl.id,
      exporterGtid: data.exporterGtid,
      ustn: ustn || null,
    });

    return NextResponse.json({
      ok: true,
      declarationId: decl.id,
      signed: false,
    });
  } catch (e: any) {
    logger.error("[shippers-declaration/create] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
