import { NextResponse } from "next/server";
import { moduleRegistry } from "@/lib/sgtx/brain-os/core/module-registry";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json({ ok: true, modules: moduleRegistry.listModules(), capabilities: moduleRegistry.listCapabilities() });
}
