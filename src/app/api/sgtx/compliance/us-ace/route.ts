// @ts-nocheck
// POST /api/sgtx/compliance/us-ace
// Body: { "form": "ISF" | "CBP_3461" | "CBP_7501", "data": { ... } }
//
// Generates the requested CBP form payload (no public ACE API — submit via
// ACE ABI with CBP-issued credentials through a licensed broker).
import { NextRequest, NextResponse } from "next/server";
import { generateISF, generateCBP3461, generateCBP7501 } from "@/lib/sgtx/compliance/us-ace";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const form = String(body?.form ?? "").toUpperCase().trim();
    const data = body?.data ?? body;
    if (!form) {
      return NextResponse.json(
        { ok: false, error: "Required body: { form: 'ISF'|'CBP_3461'|'CBP_7501', data: {...} }" },
        { status: 400 },
      );
    }
    let result: any;
    if (form === "ISF" || form === "ISF_10_2") {
      result = await generateISF(data);
    } else if (form === "CBP_3461" || form === "3461") {
      result = await generateCBP3461(data);
    } else if (form === "CBP_7501" || form === "7501") {
      result = await generateCBP7501(data);
    } else {
      return NextResponse.json(
        { ok: false, error: `Unknown form type: ${form}. Valid: ISF, CBP_3461, CBP_7501` },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true, form, ...result });
  } catch (e: any) {
    logger.error("us-ace POST failed", { error: e?.message ?? String(e) });
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
