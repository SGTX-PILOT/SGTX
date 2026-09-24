// @ts-nocheck
// SGTX v18 §16.8.7 — LAB Certificates (Auto-Triggered)
//
// GET /api/sgtx/certificates/by-lab?labGtid=<gtid>
//   Returns certificates of origin tied to USTNs that this laboratory has
//   issued lab tests for. When a lab result is compliant (PASS), a certificate
//   may be auto-triggered downstream — this endpoint surfaces those certs.
//
//   Response shape:
//   {
//     ok: true,
//     count: N,
//     certificates: CertificateOfOrigin[]
//   }

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const labGtid = req.nextUrl.searchParams.get("labGtid");
    if (!labGtid) {
      return NextResponse.json(
        { ok: false, error: "labGtid required" },
        { status: 400 },
      );
    }

    // 1. Find all USTNs this lab has tests for.
    const tests = await db.labTest.findMany({
      where: { labGtid },
      select: { trade: { select: { ustn: true, id: true } } },
      take: 500,
    });
    const ustns = Array.from(
      new Set(
        tests
          .map((t: any) => t?.trade?.ustn)
          .filter((u: any) => typeof u === "string" && u.length > 0),
      ),
    );

    if (ustns.length === 0) {
      return NextResponse.json({ ok: true, count: 0, certificates: [] });
    }

    // 2. Look up certificates by ustn.
    const certificates = await db.certificateOfOrigin.findMany({
      where: { ustn: { in: ustns } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return NextResponse.json({
      ok: true,
      count: certificates.length,
      certificates,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[certificates/by-lab/GET] error:", { msg, raw: String(e) });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
