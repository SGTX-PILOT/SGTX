// @ts-nocheck
// §2 Provider Relationship — list (GET) + create (POST)
// GET  /api/sgtx/transport/providers/relationships?providerGtid=X&traderGtid=Y&providerType=Z&relationshipType=W&relationshipStatus=V&visibilityScope=U
// POST /api/sgtx/transport/providers/relationships  body: CreateRelationshipInput
import { NextResponse } from "next/server";
import {
  listProviderRelationships,
  createProviderRelationship,
} from "@/lib/sgtx/provider-relationship";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const filters: any = {};
    const providerGtid = url.searchParams.get("providerGtid") || undefined;
    const traderGtid = url.searchParams.get("traderGtid") || undefined;
    const providerType = url.searchParams.get("providerType") || undefined;
    const relationshipType =
      url.searchParams.get("relationshipType") || undefined;
    const relationshipStatus =
      url.searchParams.get("relationshipStatus") || undefined;
    const visibilityScope =
      url.searchParams.get("visibilityScope") || undefined;
    if (providerGtid) filters.providerGtid = providerGtid;
    if (traderGtid) filters.traderGtid = traderGtid;
    if (providerType) filters.providerType = providerType;
    if (relationshipType) filters.relationshipType = relationshipType;
    if (relationshipStatus) filters.relationshipStatus = relationshipStatus;
    if (visibilityScope) filters.visibilityScope = visibilityScope;
    const relationships = await listProviderRelationships(filters);
    return NextResponse.json({ relationships });
  } catch (err: any) {
    logger.error("[api/transport/providers/relationships] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    if (!body.providerGtid) {
      return NextResponse.json(
        { error: "providerGtid required" },
        { status: 400 },
      );
    }
    const relationship = await createProviderRelationship(body);
    if (relationship && relationship.ok === false) {
      return NextResponse.json(
        { error: relationship.error || "createProviderRelationship failed" },
        { status: 400 },
      );
    }
    return NextResponse.json({ relationship });
  } catch (err: any) {
    logger.error("[api/transport/providers/relationships] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
