// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ref = req.nextUrl.searchParams.get("reference") || "";
    const singapore = await import("@/lib/sgtx/customs-gateway/adapters/singapore-adapter");
    const desc = singapore.getsingaporeAdapterDescriptor();
    if (ref) {
      // Status lookup
      const status = country === "australia" ? await singapore.getAUCargoStatus(ref) :
                     country === "india" ? await singapore.getINBillOfEntry(ref) :
                     country === "brazil" ? await singapore.getBRDUIMPStatus(ref) :
                     await singapore.getSGDeclarationStatus(ref);
      return NextResponse.json({ ok: true, status, adapter: desc });
    }
    return NextResponse.json({ ok: true, adapter: desc });
  } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { singapore } = await import("@/lib/sgtx/customs-gateway/adapters/singapore-adapter");
    const result = country === "australia" ? await singapore.submitAUDeclaration(body) :
                   country === "india" ? await singapore.submitINDeclaration(body) :
                   country === "brazil" ? await singapore.submitBRDUIMP(body) :
                   await singapore.submitSGDeclaration(body);
    return NextResponse.json({ ok: true, result });
  } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}
