import { NextRequest, NextResponse } from "next/server";
import { deactivateAddon } from "@/lib/sgtx/addons";

// POST /api/sgtx/addons/{addonId}/deactivate
// Body (optional): { deactivatedByGtid?: string }
// Deactivates a Part 11 addon (Part 11.8 — toggle off). No multisig required
// for deactivation (only activation requires it per 11.8 step 3).
export async function POST(req: NextRequest, { params }: { params: Promise<{ addonId: string }> }) {
  const { addonId } = await params;
  if (!addonId) {
    return NextResponse.json({ error: "addonId is required (path parameter)" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const result = await deactivateAddon({
    addonId,
    deactivatedByGtid: typeof body?.deactivatedByGtid === "string" ? body.deactivatedByGtid : undefined,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
