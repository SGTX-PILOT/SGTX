// @ts-nocheck
// POST /api/sgtx/road/pod
// Body: { ustn, corridorId?, signedBy, signatureHash?, location?, timestamp?,
//         photoHashes?, notes?, receiverName?, receiverContact? }
// Records proof of delivery. Stores as a RoadIncident of type DELIVERY_CONFIRMED
// (we don't have a dedicated RoadPOD model; reuse RoadIncident for the audit trail)
// and updates corridor status to POD_CONFIRMED (transition from POD_PENDING).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    if (!body?.signedBy) {
      return NextResponse.json({ error: "signedBy required" }, { status: 400 });
    }

    // Create a RoadIncident to capture POD audit trail (type CARGO_DAMAGE = no;
    // there's no POD type in the schema, so use DOCUMENTATION_PROBLEM with a
    // clear description, OR — cleaner — store it in a notes-prefixed manner).
    // To keep semantic integrity, use type DOCUMENTATION_PROBLEM with prefix.
    const incident = await db.roadIncident.create({
      data: {
        ustn: body.ustn,
        corridorId: body.corridorId || null,
        incidentType: "DOCUMENTATION_PROBLEM",
        description: `[POD] Signed by ${body.signedBy}${
          body.receiverName ? ` (receiver: ${body.receiverName})` : ""
        }${body.notes ? ` — ${body.notes}` : ""}`,
        severity: "LOW",
        status: "RESOLVED",
        resolvedAt: new Date(),
        photoHashes: body.photoHashes ? JSON.stringify(body.photoHashes) : null,
      },
    });

    // Promote corridor status POD_PENDING -> POD_CONFIRMED if applicable
    if (body.corridorId) {
      try {
        const corridor = await db.roadCorridor.findUnique({
          where: { id: body.corridorId },
          select: { id: true, status: true },
        });
        if (corridor && corridor.status === "POD_PENDING") {
          await db.roadCorridor.update({
            where: { id: body.corridorId },
            data: { status: "POD_CONFIRMED" },
          });
        }
      } catch (e: any) {
        logger.warn("[api/road/pod] corridor promotion failed", {
          corridorId: body.corridorId,
          error: e?.message,
        });
      }
    }

    logger.info("[api/road/pod] POST created", {
      incidentId: incident.id,
      ustn: body.ustn,
      signedBy: body.signedBy,
    });

    return NextResponse.json({
      ok: true,
      podId: incident.id,
      signedBy: body.signedBy,
      signedAt: new Date().toISOString(),
      corridorId: body.corridorId || null,
    });
  } catch (err: any) {
    logger.error("[api/road/pod] POST failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
