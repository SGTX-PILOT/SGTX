// Part 4.5 — Check Special Procedures (RIA auto-detection)
import { NextRequest, NextResponse } from "next/server";
import { detectSpecialProcedures } from "@/lib/sgtx/ria";

export async function GET(req: NextRequest) {
  const hsCode = req.nextUrl.searchParams.get("hsCode");
  const origin = req.nextUrl.searchParams.get("origin");
  const dest = req.nextUrl.searchParams.get("dest");
  const port = req.nextUrl.searchParams.get("port");
  if (!hsCode || !origin || !dest) return NextResponse.json({ error: "hsCode, origin, dest required" }, { status: 400 });
  const result = await detectSpecialProcedures({ hsCode, originCountry: origin, destCountry: dest, portOfDischarge: port || undefined });
  return NextResponse.json(result);
}
