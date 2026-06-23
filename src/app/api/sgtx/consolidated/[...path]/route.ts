import { NextRequest, NextResponse } from "next/server";

// Consolidated API handler — reduces Turbopack compilation units.
// Routes small proxy endpoints through a single file.

const HANDLERS: Record<string, (req: NextRequest) => Promise<any>> = {};

HANDLERS["ai/inference-log"] = async () => {
  const { getInferenceLog } = await import("@/lib/sgtx/ai/orchestrator");
  return getInferenceLog(50);
};

HANDLERS["ai/alt-ports"] = async (req) => {
  const { callAI } = await import("@/lib/sgtx/ai/orchestrator");
  const { origin, dest, commodity } = await req.json();
  const res = await callAI({ agent: "altPortsAdvisor", authority: "A1" as any, systemPrompt: "You are a logistics route advisor.", userPrompt: `Suggest alternative ports for ${commodity} from ${origin} to ${dest}. Return JSON array.`, fallbackKey: "alt_ports" });
  return JSON.parse(res.content.match(/\[[\s\S]*\]/)?.[0] || "[]");
};

HANDLERS["ai/eco-packaging"] = async (req) => {
  const { callAI } = await import("@/lib/sgtx/ai/orchestrator");
  const { currentPackaging, commodity } = await req.json();
  const res = await callAI({ agent: "ecoPackagingAdvisor", authority: "A1" as any, systemPrompt: "You are a packaging sustainability advisor.", userPrompt: `Suggest eco-friendly alternatives to ${currentPackaging} for ${commodity}. Return JSON array.`, fallbackKey: "eco_packaging" });
  return JSON.parse(res.content.match(/\[[\s\S]*\]/)?.[0] || "[]");
};

HANDLERS["integrations"] = async () => {
  const { db } = await import("@/lib/db");
  return await db.integrationHealth.findMany({ orderBy: { category: "asc" } });
};

HANDLERS["opa/policies"] = async () => {
  const { OPA_POLICIES } = await import("@/lib/sgtx/governor/policies");
  return OPA_POLICIES;
};

HANDLERS["jurisdictions"] = async () => {
  const { db } = await import("@/lib/db");
  return await db.jurisdiction.findMany();
};

HANDLERS["tenants"] = async () => {
  const { db } = await import("@/lib/db");
  return await db.tenant.findMany({ select: { gtid: true, legalName: true, type: true, country: true, trustScore: true, sanctionsCleared: true, lifecycleState: true } });
};

HANDLERS["federated/status"] = async () => {
  const { getFederatedModelStatus } = await import("@/lib/sgtx/addons");
  return getFederatedModelStatus();
};

HANDLERS["pqc/public-key"] = async () => {
  const { getPqcPublicKey } = await import("@/lib/sgtx/addons");
  return getPqcPublicKey();
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const path = (await params).path.join("/");
    const handler = HANDLERS[path];
    if (!handler) return NextResponse.json({ error: `Not found: ${path}` }, { status: 404 });
    return NextResponse.json(await handler(req));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const path = (await params).path.join("/");
    const handler = HANDLERS[path];
    if (!handler) return NextResponse.json({ error: `Not found: ${path}` }, { status: 404 });
    return NextResponse.json(await handler(req));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
