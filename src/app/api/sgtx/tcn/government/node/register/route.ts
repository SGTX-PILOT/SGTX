// POST /api/sgtx/tcn/government/node/register
// Register a government node.
import { NextRequest, NextResponse } from "next/server";
import { registerGovernmentNode } from "@/lib/sgtx/tcn";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      countryCode?: string;
      authorityName?: string;
      authorityNameAr?: string;
      authorityType?: string;
      authorityLevel?: string;
      nodeGtid?: string;
      nodePermissions?: Record<string, unknown>;
      verificationStatus?: string;
      contactEmail?: string;
      contactPhone?: string;
      portUnlocode?: string;
      corridorCodes?: string[];
    };
    if (!body.countryCode || !body.authorityName || !body.authorityType) {
      return NextResponse.json(
        { error: "Missing required fields: countryCode, authorityName, authorityType" },
        { status: 400 },
      );
    }
    const node = await registerGovernmentNode({
      countryCode: body.countryCode,
      authorityName: body.authorityName,
      authorityNameAr: body.authorityNameAr,
      authorityType: body.authorityType,
      authorityLevel: body.authorityLevel,
      nodeGtid: body.nodeGtid,
      nodePermissions: body.nodePermissions,
      verificationStatus: body.verificationStatus,
      contactEmail: body.contactEmail,
      contactPhone: body.contactPhone,
      portUnlocode: body.portUnlocode,
      corridorCodes: body.corridorCodes,
    });
    return NextResponse.json({ registered: true, node }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to register government node" },
      { status: 500 },
    );
  }
}
