// GET  /api/sgtx/trade-request/why-asking?field=<fieldKey> — get the "Why?" explanation for a field
// GET  /api/sgtx/trade-request/why-asking?category=<CATEGORY> — get all explanations for a category
// POST /api/sgtx/trade-request/why-asking — explain a dynamically-required document
//
// CCL-004: "Why is SGTX asking me this?" contextual explanation system.

import { NextRequest, NextResponse } from "next/server";
import { getFieldHelp, getFieldsByCategory, explainDocumentRequirement, type FieldCategory } from "@/lib/sgtx/trade-request/field-help";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const field = url.searchParams.get("field");
  const category = url.searchParams.get("category") as FieldCategory | null;

  if (field) {
    const help = getFieldHelp(field);
    if (!help) {
      return NextResponse.json(
        { ok: false, error: `No explanation registered for field: ${field}` },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, help });
  }

  if (category) {
    const fields = getFieldsByCategory(category);
    return NextResponse.json({ ok: true, category, fields });
  }

  return NextResponse.json({
    ok: true,
    route: "/api/sgtx/trade-request/why-asking",
    description: "Get 'Why is SGTX asking me this?' explanations for form fields",
    usage: {
      byField: "?field=<fieldKey>",
      byCategory: "?category=<PRODUCT|TRANSPORT|INCOTERM|DOCUMENTATION|ACCEPTANCE|INSURANCE|SETTLEMENT|QUANTITY|DESTINATION|SCHEDULE>",
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // Explain a dynamically-required document given the trade context
    const explanation = explainDocumentRequirement(body.docType || body.fieldKey, {
      hsCode: body.hsCode,
      destCountry: body.destCountry,
      incoterm: body.incoterm,
      coldChain: body.coldChain,
    });
    return NextResponse.json({ ok: true, fieldKey: body.docType || body.fieldKey, shortReason: explanation });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "explanation failed" },
      { status: 500 }
    );
  }
}
