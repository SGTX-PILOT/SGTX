import { NextRequest, NextResponse } from "next/server";
import { verifyDilithium3 } from "@/lib/sgtx/addons";

// POST /api/sgtx/pqc/verify
// Body: { data: string, signature: string }
// Verifies a simulated Dilithium3 signature against the supplied data
// (Part 11.6.2 — /v1/verify/pqc endpoint for external parties).
// Returns: { valid: boolean }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.data !== "string" || typeof body.signature !== "string") {
    return NextResponse.json(
      { error: "data (string) and signature (string) are required" },
      { status: 400 },
    );
  }
  const valid = verifyDilithium3(body.data, body.signature);
  return NextResponse.json({ ok: true, valid });
}
