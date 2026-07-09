import { NextResponse } from "next/server";
import { sgtxOpenApiSpec } from "@/lib/openapi-spec";

export const dynamic = "force-dynamic";

// GET /api/openapi.json — OpenAPI 3.1 specification for SGTX API
export async function GET() {
  return NextResponse.json(sgtxOpenApiSpec, {
    headers: { "Content-Type": "application/json" },
  });
}
