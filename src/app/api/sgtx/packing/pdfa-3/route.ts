// 5.13 — PDF/A-3 Archival Format Generation
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { generatePdfA3Document } from "@/lib/sgtx/packing";

export async function POST(req: NextRequest) {
  try {
    const { ustn, documentType, content } = await req.json();
    if (!ustn || !documentType || !content) return NextResponse.json({ error: "ustn, documentType, content required" }, { status: 400 });
    const result = generatePdfA3Document({ ustn, documentType, content });
    return NextResponse.json(result);
  } catch (e: any) { logger.error("[packing/pdfa-3]", e); return NextResponse.json({ error: e.message }, { status: 500 }); }
}
