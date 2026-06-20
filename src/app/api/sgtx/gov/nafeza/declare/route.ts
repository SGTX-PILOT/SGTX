import { NextRequest, NextResponse } from "next/server";
import { submitDeclaration, generateSadXml } from "@/lib/sgtx/gov";

// POST /api/sgtx/gov/nafeza/declare — submit a customs declaration to Nafeza
// Body: {
//   ustn: string,
//   tradeData?: any,           // optional pre-shaped trade payload
//   declarationData?: any,     // override shape (used as-is when provided)
//   generateSad?: boolean      // if true, attach a generated SAD XML payload
// }
// Returns: { ok, declarationId, status, acid, sadXml? }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, tradeData, declarationData, generateSad } = body || {};

    if (!ustn || typeof ustn !== "string") {
      return NextResponse.json(
        { error: "Missing required field: ustn" },
        { status: 400 }
      );
    }

    // Build the declaration payload — caller may supply either:
    //   - declarationData: a fully-shaped Nafeza declaration object, OR
    //   - tradeData: a raw SGTX trade payload (we'll generate the SAD XML from it).
    // If both are missing, we default to the tradeData so the stub is permissive.
    let payload = declarationData;
    let sadXml: string | undefined;

    if (generateSad || (!declarationData && tradeData)) {
      sadXml = generateSadXml(tradeData ?? declarationData ?? {});
    }

    if (!payload) {
      payload = {
        ustn,
        sadXml: sadXml ?? null,
        tradeData: tradeData ?? null,
      };
    }

    const result = await submitDeclaration(ustn, payload);

    return NextResponse.json({
      ok: true,
      declarationId: result.declarationId,
      status: result.status,
      acid: result.acid,
      sadXml: sadXml ?? undefined,
    });
  } catch (e: any) {
    console.error("[gov/nafeza/declare] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to submit declaration" },
      { status: 500 }
    );
  }
}
