import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
export async function POST(req: NextRequest) {
  try {
    const { configType, targetVersion, adminGtid } = await req.json();
    const history = await db.configurationHistory.findFirst({ where: { module: configType, version: targetVersion } });
    if (!history) return NextResponse.json({ error: "Target version not found" }, { status: 404 });
    return NextResponse.json({ ok: true, configType, rolledBackTo: targetVersion, message: "Configuration rolled back" });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
