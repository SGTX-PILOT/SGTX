// @ts-nocheck
// GET /api/sgtx/compliance/halal?verify=NUMBER&body=JAKIM   — verify a halal certificate
// GET /api/sgtx/compliance/halal?listBodies=1               — list recognised bodies (optionally filtered by country)
import { NextRequest, NextResponse } from "next/server";
import { verifyHalalCertificate, listRecognisedBodies } from "@/lib/sgtx/compliance/halal";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const verify = (searchParams.get("verify") ?? "").trim();
    const body = (searchParams.get("body") ?? "").trim();
    const listBodies = (searchParams.get("listBodies") ?? "").trim();
    const country = (searchParams.get("country") ?? "").trim();

    if (listBodies === "1" || listBodies.toLowerCase() === "true") {
      const bodies = await listRecognisedBodies(country);
      return NextResponse.json({ ok: true, count: bodies.length, bodies });
    }
    if (verify) {
      if (!body) {
        return NextResponse.json(
          { ok: false, error: "Required: ?verify=CERT&body=JAKIM|BPJPH|GAC|MUIS|HCF|ISWA" },
          { status: 400 },
        );
      }
      const result = await verifyHalalCertificate(verify, body);
      return NextResponse.json({ ok: true, ...result });
    }
    return NextResponse.json(
      {
        ok: false,
        error: "Use ?verify=CERT&body=CODE to verify, or ?listBodies=1[&country=ISO2] to list bodies.",
      },
      { status: 400 },
    );
  } catch (e: any) {
    logger.error("halal GET failed", { error: e?.message ?? String(e) });
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
