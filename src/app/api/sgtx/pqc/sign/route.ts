import { NextRequest, NextResponse } from "next/server";
import { signWithDilithium3, ensurePqcKey } from "@/lib/sgtx/addons";

// POST /api/sgtx/pqc/sign
// Body: { data: string }
// Signs the supplied data with the simulated Dilithium3 key (Part 11.6.2).
// Returns: { algorithm, keyId, signature, validUntil }
//
// In production, this delegates to the liboqs-backed Rust signer microservice.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.data !== "string") {
    return NextResponse.json(
      { error: "data (string) is required" },
      { status: 400 },
    );
  }
  const key = await ensurePqcKey();
  const signature = signWithDilithium3(body.data);
  return NextResponse.json({
    ok: true,
    algorithm: key.algorithm,
    keyId: key.id,
    signature,
    validUntil: key.validUntil.toISOString(),
  });
}
