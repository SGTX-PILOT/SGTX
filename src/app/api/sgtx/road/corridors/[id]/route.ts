// @ts-nocheck
// GET /api/sgtx/road/corridors/{id} — fetch a road corridor with all related entities.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "corridor id required" }, { status: 400 });
    }
    const corridor = await db.roadCorridor.findUnique({
      where: { id },
      include: {
        legs: { orderBy: { sequence: "asc" } },
        borderCrossings: { orderBy: { createdAt: "asc" } },
        seals: { orderBy: { createdAt: "desc" } },
        incidents: { orderBy: { createdAt: "desc" } },
        customsOperations: { orderBy: { createdAt: "desc" } },
        transitGuarantees: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!corridor) {
      return NextResponse.json({ error: "corridor not found" }, { status: 404 });
    }
    // Hydrate JSON fields
    const hydrated = {
      ...corridor,
      transitCountries: (() => {
        try {
          return JSON.parse(corridor.transitCountries || "[]");
        } catch {
          return [];
        }
      })(),
      approvedRouteGeometry: (() => {
        try {
          return corridor.approvedRouteGeometry
            ? JSON.parse(corridor.approvedRouteGeometry)
            : null;
        } catch {
          return null;
        }
      })(),
      legs: corridor.legs.map((l: any) => ({
        ...l,
        routeGeometry: (() => {
          try {
            return l.routeGeometry ? JSON.parse(l.routeGeometry) : null;
          } catch {
            return null;
          }
        })(),
      })),
      borderCrossings: corridor.borderCrossings.map((b: any) => ({
        ...b,
        requiredDocuments: (() => {
          try {
            return JSON.parse(b.requiredDocuments || "[]");
          } catch {
            return [];
          }
        })(),
      })),
    };
    return NextResponse.json({ corridor: hydrated });
  } catch (err: any) {
    logger.error("[api/road/corridors/[id]] GET failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
