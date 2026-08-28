// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ref = req.nextUrl.searchParams.get("reference") || "";
    const india = await import("@/lib/sgtx/customs-gateway/adapters/india-adapter");
    const desc = india.getindiaAdapterDescriptor();
    if (ref) {
      // Status lookup
      const status = country === "australia" ? await india.getAUCargoStatus(ref) :
                     country === "india" ? await india.getINBillOfEntry(ref) :
                     country === "brazil" ? await india.getBRDUIMPStatus(ref) :
                     await india.getSGDeclarationStatus(ref);
      return NextResponse.json({ ok: true, status, adapter: desc });
    }
    return NextResponse.json({ ok: true, adapter: desc });
  } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { india } = await import("@/lib/sgtx/customs-gateway/adapters/india-adapter");
    const result = country === "australia" ? await india.submitAUDeclaration(body) :
                   country === "india" ? await india.submitINDeclaration(body) :
                   country === "brazil" ? await india.submitBRDUIMP(body) :
                   await india.submitSGDeclaration(body);
    return NextResponse.json({ ok: true, result });
  } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}
