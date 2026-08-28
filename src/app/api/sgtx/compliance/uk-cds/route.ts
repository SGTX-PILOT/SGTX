// @ts-nocheck
// POST /api/sgtx/compliance/uk-cds
// Body: { "form": "CDS" | "GVMS", "data": { ... } }
//
// Generates a UK HMRC CDS declaration (SAD Boxes 1..54) or a GVMS Goods
// Movement Reference payload. Submit via HMRC CDS/GVMS API (OAuth reqd).
import { NextRequest, NextResponse } from "next/server";
import { generateCDSDeclaration, generateGVMS } from "@/lib/sgtx/compliance/uk-cds";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const form = String(body?.form ?? "").toUpperCase().trim();
    const data = body?.data ?? body;
    if (!form) {
      return NextResponse.json(
        { ok: false, error: "Required body: { form: 'CDS'|'GVMS', data: {...} }" },
        { status: 400 },
      );
    }
    let result: any;
    if (form === "CDS" || form === "DECLARATION") {
      result = await generateCDSDeclaration(data);
    } else if (form === "GVMS" || form === "GMR") {
      result = await generateGVMS(data);
    } else {
      return NextResponse.json(
        { ok: false, error: `Unknown form type: ${form}. Valid: CDS, GVMS` },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true, form, ...result });
  } catch (e: any) {
    logger.error("uk-cds POST failed", { error: e?.message ?? String(e) });
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
