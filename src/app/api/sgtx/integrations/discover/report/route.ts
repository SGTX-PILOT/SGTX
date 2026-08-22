// @ts-nocheck
// §5 Discovery — POST generate discovery report for an existing trade (by USTN)
// POST /api/sgtx/integrations/discover/report  body: { ustn }  → generateDiscoveryReport
import { NextResponse } from "next/server";
import { generateDiscoveryReport } from "@/lib/sgtx/discovery";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    if (!body.ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const report = await generateDiscoveryReport(body.ustn);
    return NextResponse.json({ report });
  } catch (err: any) {
    logger.error("[api/sgtx/integrations/discover/report] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
