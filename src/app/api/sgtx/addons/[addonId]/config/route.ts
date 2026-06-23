import { NextRequest, NextResponse } from "next/server";
import { getAddonConfig, updateAddonConfig } from "@/lib/sgtx/addons";

// GET /api/sgtx/addons/{addonId}/config
// Returns the JSON config blob for a Part 11 addon (Part 11.8 — config panel read).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ addonId: string }> }) {
  const { addonId } = await params;
  if (!addonId) {
    return NextResponse.json({ error: "addonId is required (path parameter)" }, { status: 400 });
  }
  const result = await getAddonConfig(addonId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}

// PUT /api/sgtx/addons/{addonId}/config
// Body: {
//   config: Record<string, unknown>,
//   changedByGtid?: string,
//   changeReason?: string
// }
// Replaces the JSON config blob for a Part 11 addon (Part 11.8 — config panel write).
// Records a ConfigurationHistory entry (Part 12C.11) for audit trail.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ addonId: string }> }) {
  const { addonId } = await params;
  if (!addonId) {
    return NextResponse.json({ error: "addonId is required (path parameter)" }, { status: 400 });
  }
  const body = await req.json().catch(() => null);
  if (!body || !body.config || typeof body.config !== "object") {
    return NextResponse.json(
      { error: "config (object) is required in the request body" },
      { status: 400 },
    );
  }
  const result = await updateAddonConfig({
    addonId,
    config: body.config as Record<string, unknown>,
    changedByGtid: typeof body.changedByGtid === "string" ? body.changedByGtid : undefined,
    changeReason: typeof body.changeReason === "string" ? body.changeReason : undefined,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
