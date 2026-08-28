// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ref = req.nextUrl.searchParams.get("reference") || "";
    const brazil = await import("@/lib/sgtx/customs-gateway/adapters/brazil-adapter");
    const desc = brazil.getbrazilAdapterDescriptor();
    if (ref) {
      // Status lookup
      const status = country === "australia" ? await brazil.getAUCargoStatus(ref) :
                     country === "india" ? await brazil.getINBillOfEntry(ref) :
                     country === "brazil" ? await brazil.getBRDUIMPStatus(ref) :
                     await brazil.getSGDeclarationStatus(ref);
      return NextResponse.json({ ok: true, status, adapter: desc });
    }
    return NextResponse.json({ ok: true, adapter: desc });
  } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { brazil } = await import("@/lib/sgtx/customs-gateway/adapters/brazil-adapter");
    const result = country === "australia" ? await brazil.submitAUDeclaration(body) :
                   country === "india" ? await brazil.submitINDeclaration(body) :
                   country === "brazil" ? await brazil.submitBRDUIMP(body) :
                   await brazil.submitSGDeclaration(body);
    return NextResponse.json({ ok: true, result });
  } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}
