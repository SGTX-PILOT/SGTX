// @ts-nocheck
// SGTX Part 93 + 124 — Technical Non-Custody Attestation
// GET  /api/sgtx/non-custody-attestation                — generate a fresh attestation
// POST /api/sgtx/non-custody-attestation  { attestationId }   — verify an existing attestation
import { NextResponse } from "next/server";
import { generateAttestation, verifyAttestation } from "@/lib/sgtx/non-custody-attestation";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const attestation = await generateAttestation();
    return NextResponse.json({ ok: true, attestation });
  } catch (err: any) {
    logger.error("[api/sgtx/non-custody-attestation] GET failed", { error: err?.message });
    return NextResponse.json({ error: err?.message || "internal error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    if (!body.attestationId || typeof body.attestationId !== "string") {
      return NextResponse.json({ error: "attestationId required" }, { status: 400 });
    }
    const result = await verifyAttestation(body.attestationId);
    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    logger.error("[api/sgtx/non-custody-attestation] POST failed", { error: err?.message });
    return NextResponse.json({ error: err?.message || "internal error" }, { status: 500 });
  }
}
