// EU Pesticides MRL Lookup API
// GET /api/sgtx/eu-pesticides/lookup?pesticide=Acephate&productCode=0110010
// Returns the MRL (mg/kg) for a specific pesticide + product combination.

import { NextRequest, NextResponse } from "next/server";
import { lookupMrl } from "@/lib/sgtx/compliance/eu-pesticides-client";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const pesticide = searchParams.get("pesticide");
  const productCode = searchParams.get("productCode");
  const productName = searchParams.get("productName");

  if (!pesticide) {
    return NextResponse.json({ error: "Query param 'pesticide' is required (e.g. ?pesticide=Acephate)" }, { status: 400 });
  }

  // If productCode not provided but productName is, look up the code
  let code = productCode;
  if (!code && productName) {
    const product = await db.euPesticideProduct.findFirst({
      where: { productName: { contains: productName } },
    });
    if (product) code = product.productCode;
  }

  if (!code) {
    return NextResponse.json({ error: "Either 'productCode' or 'productName' is required (e.g. ?productCode=0110010 or ?productName=Grapefruits)" }, { status: 400 });
  }

  const result = await lookupMrl(pesticide, code);
  return NextResponse.json({ ok: true, pesticide, productCode: code, ...result });
}
