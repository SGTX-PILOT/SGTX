// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { seedDemoCustomsEnvironment } = await import("@/lib/sgtx/customs-gateway/demo-environment");
    const result = await seedDemoCustomsEnvironment();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) { logger.error("[demo-seed] error:", e); return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}
