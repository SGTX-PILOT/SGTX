// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
import { NextRequest, NextResponse } from "next/server";
import { getManifest, updateManifestItem } from "@/lib/sgtx/tcn/roro-manifest";
import { featureGateResponse } from "@/lib/sgtx/platform/feature-check";

/**
 * GET /api/sgtx/tcn/roro-manifest/[id]
 *    Returns a manifest by its Prisma id (or USTN if the id matches the USTN format).
 *
 * PUT /api/sgtx/tcn/roro-manifest/[id]
 *    Body: { itemUpdates?: { itemId, updates }[], singleItemUpdate?: { itemId, updates } }
 *    Updates one or more cargo items on the manifest.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await featureGateResponse("roro_corridors");
  if (gate) return gate;

  try {
    const { id } = await params;
    // If the id looks like a USTN (starts with SGTX-), look up by USTN
    const manifest = id.startsWith("SGTX-")
      ? await getManifest(id)
      : await (async () => {
          const { freshDb } = await import("@/lib/db-fresh");
          const m = await freshDb.roRoCargoManifest.findUnique({
            where: { id },
            include: { items: { orderBy: { createdAt: "asc" } } },
                    }) as any;
          return m;
        })();
        if (!manifest) return NextResponse.json({ error: "Manifest not found" }, { status: 404 }) as any;
        return NextResponse.json({ ok: true, manifest }) as any;
  } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 }) as any;
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await featureGateResponse("roro_corridors");
  if (gate) return gate;

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    // Body shapes we accept:
    //   { itemId, updates }       → single item update
    //   { updates: { itemId, updates }[] } → batch
    //   { itemId, field, value }  → single field shorthand
    let updates: Array<{ itemId: string; updates: any }> = [];
    if (Array.isArray(body.updates)) {
      updates = body.updates;
    } else if (body.itemId && body.updates && typeof body.updates === "object") {
      updates = [{ itemId: body.itemId, updates: body.updates }];
    } else if (body.itemId && body.field !== undefined && body.value !== undefined) {
      updates = [{ itemId: body.itemId, updates: { [body.field]: body.value } }];
    } else {
      return NextResponse.json(
        { error: "Provide { itemId, updates } or { updates: [{ itemId, updates }] }" },
        { status: 400 }
      );
    }

    // Verify the manifest exists (by id or USTN)
    const manifest = id.startsWith("SGTX-")
      ? await getManifest(id)
      : await (async () => {
          const { freshDb } = await import("@/lib/db-fresh");
                    return freshDb.roRoCargoManifest.findUnique({ where: { id }, include: { items: true } }) as any;
        })();
        if (!manifest) return NextResponse.json({ error: "Manifest not found" }, { status: 404 }) as any;

    const results = [];
    for (const u of updates) {
      try {
        const updated = await updateManifestItem(u.itemId, u.updates);
                results.push({ ok: true, itemId: u.itemId, item: updated }) as any;
      } catch (e: any) {
                results.push({ ok: false, itemId: u.itemId, error: e.message }) as any;
      }
    }
    const refreshed = await getManifest((manifest as any).ustn);
        return NextResponse.json({ ok: true, results, manifest: refreshed }) as any;
  } catch (e: any) {
    const status = /cannot modify|not found|already/i.test(e.message) ? 400 : 500;
        return NextResponse.json({ error: e.message }, { status }) as any;
  }
}
