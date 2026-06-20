import { NextResponse } from "next/server";
import { OPA_POLICIES } from "@/lib/sgtx/governor/policies";

// GET /api/sgtx/opa/policies — all 8 OPA policy categories
export async function GET() {
  return NextResponse.json(OPA_POLICIES);
}
