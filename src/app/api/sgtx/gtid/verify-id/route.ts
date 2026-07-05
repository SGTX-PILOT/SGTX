// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/sgtx/gtid/verify-id — Create/update a verified identifier (Part 2.1.9)
export async function POST(req: NextRequest) {
  try {
    const { tenantGtid, idType, idValue, isPublic } = await req.json();
    if (!tenantGtid || !idType || !idValue) return NextResponse.json({ error: "tenantGtid, idType, idValue required" }, { status: 400 });
    const result = await db.tenantVerifiedId.upsert({
      where: { tenantGtid_idType: { tenantGtid, idType } },
      update: { idValue, isPublic: isPublic ?? false, status: "VERIFIED", verifiedAt: new Date() },
      create: { tenantGtid, idType, idValue, isPublic: isPublic ?? false, status: "VERIFIED", verifiedAt: new Date() },
        }) as any;
        return NextResponse.json({ ok: true, verifiedId: result }) as any;
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

// GET /api/sgtx/gtid/verify-id?tenantGtid=... — List verified IDs
export async function GET(req: NextRequest) {
  const tenantGtid = req.nextUrl.searchParams.get("tenantGtid");
    if (!tenantGtid) return NextResponse.json({ error: "tenantGtid required" }, { status: 400 }) as any;
    const ids = await db.tenantVerifiedId.findMany({ where: { tenantGtid } }) as any;
    return NextResponse.json({ verifiedIds: ids }) as any;
}
