import { NextResponse } from "next/server";
import { getPqcPublicKey } from "@/lib/sgtx/addons";

// GET /api/sgtx/pqc/public-key
// Returns the simulated Dilithium3 public key + validity window (Part 11.5).
export async function GET() {
  return NextResponse.json(getPqcPublicKey());
}
