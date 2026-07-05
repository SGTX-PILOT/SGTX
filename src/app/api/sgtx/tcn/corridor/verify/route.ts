// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
// POST /api/sgtx/tcn/corridor/verify
// Verify a corridor (multisig). Body: { corridorCode, verifierGtid, verifierName? }
import { NextRequest, NextResponse } from "next/server";
import { verifyCorridor } from "@/lib/sgtx/tcn";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      corridorCode?: string;
      verifierGtid?: string;
      verifierName?: string;
    };
    if (!body.corridorCode || !body.verifierGtid) {
      return NextResponse.json(
        { error: "Missing required fields: corridorCode, verifierGtid" },
        { status: 400 },
      );
    }
    const result = await verifyCorridor(
      body.corridorCode,
      body.verifierGtid,
      body.verifierName,
    );
    return NextResponse.json({
      verified: true,
      ...result,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to verify corridor";
    const status = msg.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
