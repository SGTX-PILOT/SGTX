import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/port/{unlocode} — port digital twin details
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ unlocode: string }> }
) {
  const { unlocode } = await params;
  if (!unlocode) {
    return NextResponse.json({ error: "port UN/LOCODE required" }, { status: 400 });
  }
  const port = await db.portDigitalTwin.findUnique({
    where: { portUnlocode: unlocode.toUpperCase() },
  });
  if (!port) {
    return NextResponse.json({ error: "port digital twin not found" }, { status: 404 });
  }

  // Decode JSON fields for client convenience
  const decoded = {
    portUnlocode: port.portUnlocode,
    portName: port.portName,
    country: port.country,
    portCapacity: safeJson(port.portCapacity),
    portCongestionLevel: port.portCongestionLevel,
    portOperatingHours: port.portOperatingHours,
    inspectionFacilities: safeJson(port.inspectionFacilities),
    customsFacilities: safeJson(port.customsFacilities),
    corridorMappings: safeJsonArray(port.corridorMappings),
    loomHash: port.loomHash,
    createdAt: port.createdAt,
    updatedAt: port.updatedAt,
  };

  return NextResponse.json(decoded);
}

function safeJson(raw: string | null | undefined): any {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
function safeJsonArray(raw: string | null | undefined): string[] {
  const v = safeJson(raw);
  return Array.isArray(v) ? v : [];
}
