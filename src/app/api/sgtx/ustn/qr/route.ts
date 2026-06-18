import { NextRequest, NextResponse } from "next/server";
import { generateUstnQrData } from "@/lib/sgtx/ustn";

// GET /api/sgtx/ustn/qr?ustn=...  (Part 3.12 — QR code data)
export async function GET(req: NextRequest) {
  const ustn = req.nextUrl.searchParams.get("ustn");
  if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });
  return NextResponse.json(generateUstnQrData(ustn));
}
