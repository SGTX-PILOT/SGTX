import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/corridor/{code}/ports — port digital twins mapped to a corridor
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  if (!code) {
    return NextResponse.json({ error: "corridor code required" }, { status: 400 });
  }
  const corridorCode = code.toUpperCase();

    const corridor = await db.tradeCorridor.findUnique({ where: { corridorCode } }) as any;
  if (!corridor) {
        return NextResponse.json({ error: "corridor not found" }, { status: 404 }) as any;
  }

  // Pull all port digital twins and filter by corridorMappings JSON array.
  const allPorts = await db.portDigitalTwin.findMany({
    orderBy: { portUnlocode: "asc" },
    }) as any;

  const ports = allPorts.filter((p) => {
    if (!p.corridorMappings) return false;
    try {
      const mappings: string[] = JSON.parse(p.corridorMappings);
      return Array.isArray(mappings) && mappings.includes(corridorCode);
    } catch {
      return false;
    }
    }) as any;

  return NextResponse.json({
    corridor: {
      code: corridor.corridorCode,
      name: corridor.corridorName,
      originPort: corridor.originPort,
      destPort: corridor.destPort,
    },
    count: ports.length,
    ports: ports.map((p) => ({
      portUnlocode: p.portUnlocode,
      portName: p.portName,
      country: p.country,
      portCongestionLevel: p.portCongestionLevel,
      portOperatingHours: p.portOperatingHours,
      portCapacity: safeJson(p.portCapacity),
      inspectionFacilities: safeJson(p.inspectionFacilities),
      customsFacilities: safeJson(p.customsFacilities),
      corridorMappings: safeJsonArray(p.corridorMappings),
      loomHash: p.loomHash,
    })),
  });
}

function safeJson(raw: string | null | undefined): any {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
function safeJsonArray(raw: string | null | undefined): string[] {
  const v = safeJson(raw);
  return Array.isArray(v) ? v : [];
}
