import { NextRequest, NextResponse } from "next/server";
import { detectHsCode, searchHsCodeLocal, getAllCategories, getHsCodesByCategory } from "@/lib/sgtx/ai/hs-code-detector";

// POST /api/sgtx/ai/detect-hs-code — AI-powered HS code detection (Part 4.3)
// Body: { product: string } → returns { hsCode, description, category, confidence, source }
export async function POST(req: NextRequest) {
  try {
    const { product } = await req.json();
    if (!product || product.trim().length < 2) {
      return NextResponse.json({ error: "Product description required (min 2 chars)" }, { status: 400 });
    }

    const result = await detectHsCode(product.trim());
    const alternatives = searchHsCodeLocal(product.trim()).slice(0, 3);

    return NextResponse.json({
      ok: true,
      product: product.trim(),
      detection: result,
      alternatives,
    });
  } catch (e: any) {
    console.error("[detect-hs-code] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET /api/sgtx/ai/detect-hs-code?product=frozen+strawberries — quick GET for autocomplete
// GET /api/sgtx/ai/detect-hs-code?categories=true — list all categories
// GET /api/sgtx/ai/detect-hs-code?category=Frozen+Fruits — list HS codes in category
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const product = sp.get("product");
  const categoriesOnly = sp.get("categories") === "true";
  const category = sp.get("category");

  if (categoriesOnly) {
    return NextResponse.json({ categories: getAllCategories() });
  }

  if (category) {
    return NextResponse.json({ category, hsCodes: getHsCodesByCategory(category) });
  }

  if (product) {
    // Quick local search (no AI call for GET — fast autocomplete)
    const results = searchHsCodeLocal(product);
    return NextResponse.json({ product, results });
  }

  return NextResponse.json({ error: "Provide ?product=, ?categories=true, or ?category= parameter" }, { status: 400 });
}
