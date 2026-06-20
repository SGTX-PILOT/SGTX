import { NextRequest, NextResponse } from "next/server";
import { getPortRules } from "@/lib/sgtx/ria";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const portCode = req.nextUrl.searchParams.get("portCode");
  if (!portCode) {
    return NextResponse.json({ error: "portCode required" }, { status: 400 });
  }
  const rules = await getPortRules(portCode);
  // Also return the port master record (UN/LOCODE lookup)
  const cleaned = portCode.match(/[A-Z]{5}/)?.[0] || portCode.trim();
  const port = await db.port.findUnique({ where: { unlocode: cleaned } });
  return NextResponse.json({ portCode, port, rules });
}
