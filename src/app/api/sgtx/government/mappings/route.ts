// @ts-nocheck
// SGTX Phase 4 §3 — Single Window API
//   GET  /api/sgtx/government/mappings — list SingleWindowMapping rows
//        Query: ?mappingType=&jurisdictionCode=&authority=&systemName=&sourceField=
//   POST /api/sgtx/government/mappings — upsert a SingleWindowMapping row.
//        Body = UpsertMappingInput (mappingType, sourceField, targetField required).
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { listMappings, upsertMapping } from "@/lib/sgtx/single-window";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const mappingType = url.searchParams.get("mappingType") || undefined;
    const jurisdictionCode = url.searchParams.get("jurisdictionCode") || undefined;
    const authority = url.searchParams.get("authority") || undefined;
    const systemName = url.searchParams.get("systemName") || undefined;
    const sourceField = url.searchParams.get("sourceField") || undefined;

    const mappings = await listMappings({
      mappingType,
      jurisdictionCode,
      authority,
      systemName,
      sourceField,
    });
    return NextResponse.json({ mappings, count: mappings.length });
  } catch (err: any) {
    logger.error("[api/sgtx/government/mappings] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// POST — upsert a SingleWindowMapping row.
// Lookup key: (mappingType, jurisdictionCode, authority, systemName,
// sourceField, targetField).
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "request body required" },
        { status: 400 },
      );
    }
    if (!body.mappingType) {
      return NextResponse.json(
        { error: "mappingType required" },
        { status: 400 },
      );
    }
    if (!body.sourceField) {
      return NextResponse.json(
        { error: "sourceField required" },
        { status: 400 },
      );
    }
    if (!body.targetField) {
      return NextResponse.json(
        { error: "targetField required" },
        { status: 400 },
      );
    }
    const mapping = await upsertMapping(body);
    return NextResponse.json({ mapping });
  } catch (err: any) {
    logger.error("[api/sgtx/government/mappings] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
