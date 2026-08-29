// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ref = req.nextUrl.searchParams.get("reference") || "";
    const australia = await import("@/lib/sgtx/customs-gateway/adapters/australia-adapter");
    const desc = australia.getaustraliaAdapterDescriptor();
    if (ref) {
      // Status lookup
      const status = country === "australia" ? await australia.getAUCargoStatus(ref) :
                     country === "india" ? await australia.getINBillOfEntry(ref) :
                     country === "brazil" ? await australia.getBRDUIMPStatus(ref) :
                     await australia.getSGDeclarationStatus(ref);
      return NextResponse.json({ ok: true, status, adapter: desc });
    }
    return NextResponse.json({ ok: true, adapter: desc });
  } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { australia } = await import("@/lib/sgtx/customs-gateway/adapters/australia-adapter");
    const result = country === "australia" ? await australia.submitAUDeclaration(body) :
                   country === "india" ? await australia.submitINDeclaration(body) :
                   country === "brazil" ? await australia.submitBRDUIMP(body) :
                   await australia.submitSGDeclaration(body);
    return NextResponse.json({ ok: true, result });
  } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}
