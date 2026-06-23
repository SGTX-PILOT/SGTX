// 3B.6.5 — Customs Declaration Submission (Nafeza API)
import { NextRequest, NextResponse } from "next/server";
import { submitCustomsDeclaration } from "@/lib/sgtx/execution";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { declarationId, brokerGtid } = body;
    if (!declarationId || !brokerGtid) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    const result = await submitCustomsDeclaration({ declarationId, brokerGtid });
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("[execution/customs/submit]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
