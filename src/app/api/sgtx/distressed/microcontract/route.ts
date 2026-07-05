// 3B.8.10 — Microcontract: accept offer + create + lock
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { acceptOfferAndCreateMicrocontract, lockMicrocontract } from "@/lib/sgtx/distressed";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, listingId, offerId, sellerGtid, microContractId } = body;
    if (action === "accept") {
      if (!listingId || !offerId || !sellerGtid) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
      const result = await acceptOfferAndCreateMicrocontract({ listingId, offerId, sellerGtid });
      if (!result.ok) return NextResponse.json({ error: result.reason, code: result.code }, { status: 400 });
      return NextResponse.json(result);
    } else if (action === "lock") {
      if (!microContractId || !sellerGtid) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
      const result = await lockMicrocontract({ microContractId, sellerGtid });
      if (!result.ok) return NextResponse.json({ error: result.reason, code: result.code }, { status: 400 });
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) { logger.error("[distressed/microcontract]", e); return NextResponse.json({ error: e.message }, { status: 500 }); }
}
