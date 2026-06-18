// 8.4.1 — Certificate Revocation List (CRL)
import { NextResponse } from "next/server";
import { generateCrl } from "@/lib/sgtx/release";

export async function GET() {
  const crl = generateCrl();
  return new NextResponse(crl, { headers: { "Content-Type": "application/pkix-crl", "Content-Disposition": "attachment; filename=\"sgtx.crl\"" } });
}
