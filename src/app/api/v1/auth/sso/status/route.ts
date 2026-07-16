import { NextRequest, NextResponse } from "next/server";
import { getZitadelConfig } from "@/lib/v1/zitadel";

export const dynamic = "force-dynamic";

// GET /api/v1/auth/sso/status — check whether ZITADEL SSO is configured.
//
// Returns: { configured: boolean, issuer: string }
//
// The AuthGateway calls this on mount to decide whether to enable the SSO
// button or show a "SSO not configured" tooltip.
export async function GET(_req: NextRequest) {
  try {
    const cfg = getZitadelConfig();
    return NextResponse.json({
      configured: cfg.configured,
      issuer: cfg.issuer,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
