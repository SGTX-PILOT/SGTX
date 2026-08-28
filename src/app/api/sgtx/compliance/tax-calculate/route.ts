// @ts-nocheck
/**
 * G-18 — Cross-Border Tax Engine API route
 * GET /api/sgtx/compliance/tax-calculate?type=VAT&amount=1000&country=DE
 *   Returns a single TaxCalculation.
 * GET /api/sgtx/compliance/tax-calculate?ustn=USTN-XXX
 *   Returns a FullTaxCalculation (chains to G-02 landed cost).
 * POST /api/sgtx/compliance/tax-calculate
 *   Same capabilities, JSON body.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  calculateTax,
  calculateFullTax,
  listSupportedTaxConfigs,
  type TaxType,
} from "@/lib/sgtx/compliance/tax-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

const VALID_TYPES: TaxType[] = [
  "VAT",
  "GST",
  "SALES_TAX",
  "EXCISE",
  "WITHHOLDING",
  "IMPORT_TAX",
];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ustn = searchParams.get("ustn");
    if (ustn) {
      // Full tax calculation — chains to G-02
      const result = await calculateFullTax(ustn);
      return NextResponse.json({ ok: true, calculation: result });
    }
    const taxType = (searchParams.get("type") || "").toUpperCase() as TaxType;
    const amountStr = searchParams.get("amount") || "0";
    const amount = parseFloat(amountStr);
    const country = searchParams.get("country") || "";
    if (!taxType || !VALID_TYPES.includes(taxType)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "type is required and must be one of: " +
            VALID_TYPES.join(", ") +
            " (or pass ustn= for full calculation)",
        },
        { status: 400 },
      );
    }
    if (!Number.isFinite(amount)) {
      return NextResponse.json(
        { ok: false, error: "amount must be a number" },
        { status: 400 },
      );
    }
    if (!country) {
      return NextResponse.json(
        { ok: false, error: "country (ISO 2) is required" },
        { status: 400 },
      );
    }
    const options: any = {};
    const usStateCode = searchParams.get("usState");
    if (usStateCode) options.usStateCode = usStateCode;
    const goodsDescription = searchParams.get("goodsDescription");
    if (goodsDescription) options.goodsDescription = goodsDescription;
    const serviceType = searchParams.get("serviceType");
    if (serviceType) options.serviceType = serviceType;
    const b2b = searchParams.get("b2bReverseCharge");
    if (b2b === "true") options.b2bReverseCharge = true;
    const exemption = searchParams.get("exemptionCode") as any;
    if (exemption) options.exemptionCode = exemption;
    const regime = searchParams.get("specialRegime") as any;
    if (regime) options.specialRegime = regime;
    const currency = searchParams.get("currency");
    if (currency) options.currency = currency;

    const result = calculateTax(taxType, amount, country, options);
    return NextResponse.json({ ok: true, calculation: result });
  } catch (err: any) {
    logger.error("[api/compliance/tax-calculate] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

/** POST — supports both single tax calc and full calc by USTN. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "invalid body — JSON object expected" },
        { status: 400 },
      );
    }
    if (body.ustn) {
      const result = await calculateFullTax(body.ustn);
      return NextResponse.json({ ok: true, calculation: result });
    }
    const taxType = (body.type || body.taxType || "").toUpperCase() as TaxType;
    if (!VALID_TYPES.includes(taxType)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "type (or ustn) is required; type must be one of: " +
            VALID_TYPES.join(", "),
        },
        { status: 400 },
      );
    }
    if (body.amount === undefined || !Number.isFinite(Number(body.amount))) {
      return NextResponse.json(
        { ok: false, error: "amount must be a number" },
        { status: 400 },
      );
    }
    if (!body.country) {
      return NextResponse.json(
        { ok: false, error: "country (ISO 2) is required" },
        { status: 400 },
      );
    }
    const result = calculateTax(
      taxType,
      Number(body.amount),
      body.country,
      {
        usStateCode: body.usStateCode,
        goodsDescription: body.goodsDescription,
        serviceType: body.serviceType,
        b2bReverseCharge: body.b2bReverseCharge,
        exemptionCode: body.exemptionCode,
        specialRegime: body.specialRegime,
        currency: body.currency,
      },
    );
    return NextResponse.json({ ok: true, calculation: result });
  } catch (err: any) {
    logger.error("[api/compliance/tax-calculate] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

/** OPTIONS — list supported tax configurations (handy for clients). */
export async function OPTIONS() {
  return NextResponse.json({
    ok: true,
    configs: listSupportedTaxConfigs(),
  });
}
