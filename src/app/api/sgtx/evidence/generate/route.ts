import { NextRequest, NextResponse } from "next/server";
import { generateEvidencePackage, EVIDENCE_PACKAGE_TYPES, ARBITRATION_JURISDICTIONS } from "@/lib/sgtx/governor/constitutional-addons";

// POST /api/sgtx/evidence/generate  { ustn, packageType, jurisdiction?, generatedBy? }
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.ustn || !body.packageType) return NextResponse.json({ error: "ustn + packageType required" }, { status: 400 });
  const result = await generateEvidencePackage(body);
  return NextResponse.json(result);
}

// GET /api/sgtx/evidence/generate — return package types + jurisdictions
export async function GET() {
  return NextResponse.json({ packageTypes: EVIDENCE_PACKAGE_TYPES, jurisdictions: ARBITRATION_JURISDICTIONS });
}
