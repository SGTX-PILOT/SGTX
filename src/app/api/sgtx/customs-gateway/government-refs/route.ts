// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const ustn = req.nextUrl.searchParams.get("ustn");
  const { getGovernmentReferences, getMultiJurisdictionDeclarations } = await import("@/lib/sgtx/customs-gateway/government-references");
  if (ustn) {
    const [refs, declarations] = await Promise.all([getGovernmentReferences(ustn), getMultiJurisdictionDeclarations(ustn)]);
    return NextResponse.json({ ok: true, references: refs, declarations });
  }
  return NextResponse.json({ ok: false, error: "ustn required" }, { status: 400 });
}
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { createGovernmentReference } = await import("@/lib/sgtx/customs-gateway/government-references");
    const result = await createGovernmentReference(body);
    return NextResponse.json({ ok: true, reference: result });
  } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}
