// @ts-nocheck
// POST /api/sgtx/compliance/gcc-fasah
// Body: { "form": "FASAH" | "SASO", "country": "AE" | "SA", "data": {...} }
//
// Generates a FASAH Bayan customs declaration OR a SASO Certificate of
// Conformity payload. No public API — submit via ZATCA / UAE FCA portals.
import { NextRequest, NextResponse } from "next/server";
import { generateFasahDeclaration, generateSASOCertificate } from "@/lib/sgtx/compliance/gcc-fasah";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const form = String(body?.form ?? "").toUpperCase().trim();
    const country = (String(body?.country ?? "SA").toUpperCase().trim() as "AE" | "SA");
    const data = body?.data ?? body;
    if (!form) {
      return NextResponse.json(
        { ok: false, error: "Required body: { form: 'FASAH'|'SASO', country: 'AE'|'SA', data: {...} }" },
        { status: 400 },
      );
    }
    let result: any;
    if (form === "FASAH" || form === "BAYAN") {
      if (country !== "AE" && country !== "SA") {
        return NextResponse.json({ ok: false, error: "country must be AE or SA" }, { status: 400 });
      }
      result = await generateFasahDeclaration(data, country);
    } else if (form === "SASO" || form === "COC") {
      result = await generateSASOCertificate(data);
    } else {
      return NextResponse.json(
        { ok: false, error: `Unknown form type: ${form}. Valid: FASAH, SASO` },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true, form, country, ...result });
  } catch (e: any) {
    logger.error("gcc-fasah POST failed", { error: e?.message ?? String(e) });
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
