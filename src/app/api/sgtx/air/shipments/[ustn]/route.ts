// @ts-nocheck
// GET /api/sgtx/air/shipments/{ustn} — fetch an air shipment with all related entities.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ustn: string }> },
) {
  try {
    const { ustn } = await params;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const shipment = await db.airCargoShipment.findFirst({
      where: { ustn },
      include: {
        flightLegs: { orderBy: { sequence: "asc" } },
        waybills: { orderBy: { createdAt: "asc" } },
        cargoPieces: { orderBy: { createdAt: "asc" } },
        uldAssignments: { orderBy: { createdAt: "asc" } },
        securityRecords: { orderBy: { createdAt: "desc" } },
        dgRecords: { orderBy: { createdAt: "desc" } },
        customsOps: { orderBy: { createdAt: "desc" } },
        irregularities: { orderBy: { createdAt: "desc" } },
        iotEvents: { orderBy: { recordedAt: "desc" }, take: 50 },
      },
    });
    if (!shipment) {
      return NextResponse.json({ error: "shipment not found" }, { status: 404 });
    }
    // Hydrate JSON fields
    const hydrated = {
      ...shipment,
      transitAirports: (() => {
        try { return JSON.parse(shipment.transitAirports || "[]"); } catch { return []; }
      })(),
      deliveryWindow: (() => {
        try { return shipment.deliveryWindow ? JSON.parse(shipment.deliveryWindow) : null; } catch { return null; }
      })(),
      uldAssignments: shipment.uldAssignments.map((u: any) => ({
        ...u,
        dimensions: (() => { try { return u.dimensions ? JSON.parse(u.dimensions) : null; } catch { return null; } })(),
        aircraftCompatible: (() => { try { return u.aircraftCompatible ? JSON.parse(u.aircraftCompatible) : []; } catch { return []; } })(),
        buildPlan: (() => { try { return u.buildPlan ? JSON.parse(u.buildPlan) : null; } catch { return null; } })(),
      })),
      customsOps: shipment.customsOps.map((c: any) => ({
        ...c,
        hawbNumbers: (() => { try { return c.hawbNumbers ? JSON.parse(c.hawbNumbers) : []; } catch { return []; } })(),
      })),
    };
    return NextResponse.json({ shipment: hydrated });
  } catch (err: any) {
    logger.error("[api/air/shipments/[ustn]] GET failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
