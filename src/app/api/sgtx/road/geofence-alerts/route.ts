// @ts-nocheck
// SGTX v18 §16.11.4.3 — LSP Geofence Alerts
//
// GET /api/sgtx/road/geofence-alerts?carrier=GTID&limit=50
//   → 200 {
//        ok,
//        alerts: [{
//          id, ustn, shipmentId, containerNo,
//          locationLabel,   // human-readable place name
//          event: "ENTERED" | "EXITED" | "DWELL_TOO_LONG",
//          latitude, longitude,
//          timestamp,        // ISO
//          severity: "INFO" | "WARN" | "ALERT",
//          dwellMinutes?,
//        }],
//        total,
//        simulated
//      }
//
// The cockpit reads these alerts to populate the LSP Geofence Alerts panel
// (§16.11.4.3). Alerts are synthesised deterministically from the carrier's
// active shipments — a real IoT/telemetry pipeline would emit the same shape,
// so when a real geofence engine is wired in the UI requires zero changes.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// Fallback coordinates for common Egyptian + Mediterranean ports. Used when
// a shipment has no live lat/lng (most shipments don't — only the in-cab
// driver app streams them).
const PORT_COORDS: Record<string, { lat: number; lng: number }> = {
  ALEX: { lat: 31.205, lng: 29.918 },
  CAIRO: { lat: 30.044, lng: 31.235 },
  DAMIETTA: { lat: 31.416, lng: 31.813 },
  SUEZ: { lat: 29.966, lng: 32.549 },
  PORTSAID: { lat: 31.265, lng: 32.286 },
  "6 OCTOBER": { lat: 29.948, lng: 30.846 },
  BORGELARAB: { lat: 30.85, lng: 29.57 },
  ROTTERDAM: { lat: 51.924, lng: 4.477 },
  HAMBURG: { lat: 53.551, lng: 9.993 },
  JEBELALI: { lat: 25.013, lng: 55.055 },
  JEDDAH: { lat: 21.488, lng: 39.194 },
};

function portCoord(name?: string | null): { lat: number; lng: number } | null {
  if (!name) return null;
  const k = String(name).toUpperCase().trim();
  if (PORT_COORDS[k]) return PORT_COORDS[k];
  const first = k.split(/[\s-]/)[0];
  return PORT_COORDS[first] || null;
}

export async function GET(req: NextRequest) {
  try {
    const carrier = req.nextUrl.searchParams.get("carrier") || req.nextUrl.searchParams.get("carrierGtid");
    const limitRaw = req.nextUrl.searchParams.get("limit");
    const limit = Math.min(Math.max(parseInt(limitRaw || "50", 10) || 50, 1), 200);

    if (!carrier) {
      return NextResponse.json(
        { ok: false, error: "carrier (LSP GTID) query parameter required" },
        { status: 400 },
      );
    }

    const shipments = await db.shipment.findMany({
      where: { carrierGtid: carrier },
      include: { trade: { include: { buyer: true, seller: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const now = Date.now();
    const alerts: any[] = [];

    for (const s of shipments) {
      const ustn = s.ustn || s.trade?.ustn;
      if (!ustn) continue;

      const originCoord = s.lat && s.lng
        ? { lat: s.lat, lng: s.lng }
        : portCoord(s.originPort);
      const destCoord = portCoord(s.destPort);

      if (s.departedAt && originCoord) {
        const departedMs = new Date(s.departedAt).getTime();
        if (!Number.isNaN(departedMs)) {
          const ageMin = Math.max(0, Math.round((now - departedMs) / 60000));
          if (ageMin <= 2880) {
            alerts.push({
              id: `gf-e-${s.id}`,
              ustn,
              shipmentId: s.id,
              containerNo: s.containerNo || null,
              locationLabel: s.originPort || "Origin facility",
              event: "ENTERED",
              latitude: originCoord.lat,
              longitude: originCoord.lng,
              timestamp: new Date(departedMs).toISOString(),
              severity: "INFO",
            });
          }
          const transitMs = s.arrivedAt ? 0 : now - departedMs;
          if (transitMs > 24 * 60 * 60 * 1000) {
            alerts.push({
              id: `gf-d-${s.id}`,
              ustn,
              shipmentId: s.id,
              containerNo: s.containerNo || null,
              locationLabel: s.originPort ? `${s.originPort} → ${s.destPort || "destination"}` : "In transit",
              event: "DWELL_TOO_LONG",
              latitude: originCoord.lat,
              longitude: originCoord.lng,
              timestamp: new Date(departedMs + 24 * 60 * 60 * 1000).toISOString(),
              severity: "WARN",
              dwellMinutes: Math.round(transitMs / 60000),
            });
          }
        }
      }

      if (s.arrivedAt && destCoord) {
        const arrivedMs = new Date(s.arrivedAt).getTime();
        if (!Number.isNaN(arrivedMs)) {
          const ageMin = Math.max(0, Math.round((now - arrivedMs) / 60000));
          if (ageMin <= 4320) {
            alerts.push({
              id: `gf-x-${s.id}`,
              ustn,
              shipmentId: s.id,
              containerNo: s.containerNo || null,
              locationLabel: s.destPort || "Destination facility",
              event: "EXITED",
              latitude: destCoord.lat,
              longitude: destCoord.lng,
              timestamp: new Date(arrivedMs).toISOString(),
              severity: "INFO",
            });
          }
        }
      } else if (s.eta && destCoord) {
        const etaMs = new Date(s.eta).getTime();
        if (!Number.isNaN(etaMs)) {
          const etaDelta = now - etaMs;
          if (etaDelta >= -24 * 60 * 60 * 1000 && etaDelta <= 4 * 60 * 60 * 1000) {
            alerts.push({
              id: `gf-x-${s.id}`,
              ustn,
              shipmentId: s.id,
              containerNo: s.containerNo || null,
              locationLabel: s.destPort || "Destination facility",
              event: "EXITED",
              latitude: destCoord.lat,
              longitude: destCoord.lng,
              timestamp: new Date(etaMs).toISOString(),
              severity: "INFO",
            });
          }
        }
      }

      if (alerts.filter(a => a.shipmentId === s.id).length === 0 && originCoord) {
        const createdMs = new Date(s.createdAt).getTime();
        if (!Number.isNaN(createdMs)) {
          alerts.push({
            id: `gf-e-${s.id}`,
            ustn,
            shipmentId: s.id,
            containerNo: s.containerNo || null,
            locationLabel: s.originPort || "Origin facility",
            event: "ENTERED",
            latitude: originCoord.lat,
            longitude: originCoord.lng,
            timestamp: new Date(createdMs).toISOString(),
            severity: "INFO",
          });
        }
      }
    }

    alerts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const result = alerts.slice(0, limit);

    logger.info("[api/road/geofence-alerts] GET synthesised", {
      carrier,
      shipmentCount: shipments.length,
      alertCount: result.length,
    });

    return NextResponse.json({
      ok: true,
      alerts: result,
      total: result.length,
      simulated: true,
    });
  } catch (err: any) {
    logger.error("[api/road/geofence-alerts] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
