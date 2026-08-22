// @ts-nocheck
// §2 Provider Relationship — platform-wide approval (SGTX admin/governance).
// POST /api/sgtx/transport/providers/approve
// body: { providerGtid, providerType, authorizedBy, jurisdictions?, routes?, serviceCatalogue? }
//
// Creates a ProviderRelationship with visibilityScope=PLATFORM (visible to
// all SGTX users). Idempotent: if an existing PLATFORM APPROVED relationship
// is found, it is updated.
import { NextResponse } from "next/server";
import { approveProvider } from "@/lib/sgtx/provider-relationship";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.providerGtid) {
      return NextResponse.json(
        { error: "providerGtid required" },
        { status: 400 },
      );
    }
    if (!body.providerType) {
      return NextResponse.json(
        { error: "providerType required" },
        { status: 400 },
      );
    }
    if (!body.authorizedBy) {
      return NextResponse.json(
        { error: "authorizedBy required" },
        { status: 400 },
      );
    }
    const scope: any = {};
    if (Array.isArray(body.jurisdictions))
      scope.jurisdictions = body.jurisdictions;
    if (Array.isArray(body.routes)) scope.routes = body.routes;
    if (Array.isArray(body.serviceCatalogue))
      scope.serviceCatalogue = body.serviceCatalogue;
    const relationship = await approveProvider(
      body.providerGtid,
      body.providerType,
      body.authorizedBy,
      Object.keys(scope).length > 0 ? scope : undefined,
    );
    if (relationship && relationship.ok === false) {
      return NextResponse.json(
        { error: relationship.error || "approveProvider failed" },
        { status: 400 },
      );
    }
    return NextResponse.json({ relationship });
  } catch (err: any) {
    logger.error("[api/transport/providers/approve] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
