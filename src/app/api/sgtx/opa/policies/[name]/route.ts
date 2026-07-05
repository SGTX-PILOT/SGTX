import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { createHash } from "crypto";
import { OPA_POLICIES } from "@/lib/sgtx/governor/policies";
import { freshDb } from "@/lib/db-fresh";

// GET /api/sgtx/opa/policies/[name] — get a single OPA policy by name
//
// `name` may be the bare category (e.g. "permissions") or the full filename
// (e.g. "permissions.rego"). Returns the policy with content, version,
// lastModified, multisigApproved, active, source, filePath.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const { name: rawName } = await params;
    const name = normalizeName(rawName);

    const policyDef = OPA_POLICIES.find((p) => p.name === name);
    if (!policyDef) {
      return NextResponse.json(
        {
          error: `Unknown OPA policy: ${rawName}`,
          known: OPA_POLICIES.map((p) => p.name),
        },
        { status: 404 },
      );
    }

    const dbRow = await freshDb.opaPolicy.findUnique({ where: { name } });

    return NextResponse.json({
      name: policyDef.name,
      category: policyDef.category,
      description: policyDef.description,
      content: dbRow?.content ?? policyDef.content,
      version: dbRow?.version ?? "v1.0.0",
      lastModified: dbRow?.lastReloaded.toISOString() ?? "2026-01-01T00:00:00.000Z",
      multisigApproved: dbRow?.multisigApproved ?? false,
      active: dbRow?.active ?? true,
      source: dbRow ? "db" : "default",
      filePath: `/core/governor/policies/${policyDef.name}`,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to fetch OPA policy" },
      { status: 500 },
    );
  }
}

// PUT /api/sgtx/opa/policies/[name] — update a single OPA policy
//
// Blueprint Part 1.2 — policy updates require multisig approval from the
// Platform Governance Authority (≥3 signers). This endpoint simulates the
// update procedure:
//   1. Verify multisig approval has been granted (body or query)
//   2. Optionally accept new content (otherwise reload from authoritative source)
//   3. Upsert the OpaPolicy row with bumped version, lastReloaded=now,
//      multisigApproved=true
//   4. Audit-log to ConfigurationHistory (Loom-anchored)
//
// Body (all optional):
//   {
//     content?: string        (new Rego source — if omitted, keeps current content)
//     multisigApproved?: boolean (default true)
//     approvers?: string[]    (GTIDs of approvers — for audit)
//     reason?: string         (free-text update reason)
//     bumpVersion?: boolean   (default true)
//   }
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const { name: rawName } = await params;
    const name = normalizeName(rawName);

    const policyDef = OPA_POLICIES.find((p) => p.name === name);
    if (!policyDef) {
      return NextResponse.json(
        {
          error: `Unknown OPA policy: ${rawName}`,
          known: OPA_POLICIES.map((p) => p.name),
        },
        { status: 404 },
      );
    }

    const body = await req.json().catch(() => ({} as any));
    const multisigApproved = body?.multisigApproved !== false; // default true
    const approvers: string[] = Array.isArray(body?.approvers) ? body.approvers : [];
    const reason = typeof body?.reason === "string" ? body.reason : "policy update";
    const bumpVersion = body?.bumpVersion !== false;
    const newContent = typeof body?.content === "string" && body.content.trim().length > 0
      ? body.content
      : undefined;

    if (!multisigApproved) {
      return NextResponse.json(
        {
          error: "Multisig approval required to update OPA policy",
          policy: name,
          required: "≥3 Platform Governance Authority member approvals",
        },
        { status: 403 },
      );
    }

    // Sanity-check supplied content if provided — must be a Rego package
    if (newContent && !/^package\s+sgtx\./.test(newContent)) {
      return NextResponse.json(
        {
          error: "Invalid Rego content — must start with 'package sgtx.<category>'",
          policy: name,
        },
        { status: 400 },
      );
    }

    const existing = await freshDb.opaPolicy.findUnique({ where: { name } });
    const previousVersion = existing?.version ?? "v1.0.0";
    const previousContent = existing?.content ?? policyDef.content;
    const newVersion = bumpVersion ? bumpPatchVersion(previousVersion) : previousVersion;

    const row = await freshDb.opaPolicy.upsert({
      where: { name },
      create: {
        name,
        category: policyDef.category,
        content: newContent ?? policyDef.content,
        version: newVersion,
        active: true,
        multisigApproved: true,
        lastReloaded: new Date(),
      },
      update: {
        category: policyDef.category,
        content: newContent ?? existing?.content ?? policyDef.content,
        version: newVersion,
        active: true,
        multisigApproved: true,
        lastReloaded: new Date(),
      },
    });

    // Audit log
    await freshDb.configurationHistory.create({
      data: {
        configKey: `opa_policy.update.${name}`,
        oldValue: JSON.stringify({ version: previousVersion, contentHash: sha256(previousContent) }),
        newValue: JSON.stringify({
          version: newVersion,
          contentHash: sha256(row.content),
          approvers,
          reason,
          contentChanged: newContent !== undefined,
          updatedAt: row.lastReloaded.toISOString(),
        }),
        changedByGtid: approvers[0] || "SGTX-EG-GOV-000001-9A0B",
        changeReason: `OPA policy update — ${name} ${previousVersion} → ${newVersion} (${reason})`,
        version: await nextConfigVersion(`opa_policy.update.${name}`),
      },
    });

    return NextResponse.json({
      ok: true,
      policy: {
        name: row.name,
        category: row.category,
        version: row.version,
        lastModified: row.lastReloaded.toISOString(),
        multisigApproved: row.multisigApproved,
        active: row.active,
        contentChanged: newContent !== undefined,
        previousVersion,
        filePath: `/core/governor/policies/${row.name}`,
      },
      approvers,
      reason,
    });
  } catch (e: any) {
    logger.error("[opa/policies/PUT] error:", e);
    return NextResponse.json(
      { error: e?.message || "OPA policy update failed" },
      { status: 500 },
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function normalizeName(raw: string): string {
  if (!raw) return raw;
  if (raw.endsWith(".rego")) return raw;
  return `${raw}.rego`;
}

function bumpPatchVersion(v: string): string {
  const m = v.match(/^v(\d+)\.(\d+)\.(\d+)(-.*)?$/);
  if (!m) return `v1.0.1+${Date.now()}`;
  const major = m[1];
  const minor = m[2];
  const patch = String(Number(m[3]) + 1);
  const suffix = m[4] || "";
  return `v${major}.${minor}.${patch}${suffix}`;
}

function sha256(s: string): string {
  // Lightweight inline SHA-256 (used only for audit-log fingerprinting).
  return "sha256:" + createHash("sha256").update(s).digest("hex");
}

async function nextConfigVersion(configKey: string): Promise<number> {
  const last = await freshDb.configurationHistory.findFirst({
    where: { configKey },
    orderBy: { version: "desc" },
  });
  return (last?.version ?? 0) + 1;
}
