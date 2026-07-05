import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { listModules, getModuleVersions } from "@/lib/sgtx/governor/wasm-modules";

// GET /api/sgtx/governor/modules — list all 7 constitutional WASM modules
// with their version, hash, signedBy, loadedAt, status, and full history.
//
// Blueprint Part 1.3.5 — Constitutional module registry. Each module is
// hot-reloadable via /api/sgtx/governor/modules/[name]/reload (POST).
export async function GET() {
  try {
    const modules = listModules();
    const versions = getModuleVersions();

    return NextResponse.json({
      total: modules.length,
      modules,
      versions,
      genesisHash: modules[0]?.hash ?? null,
      platformGovernanceAuthority: "SGTX-EG-GOV-000001-9A0B",
    });
  } catch (e: any) {
    logger.error("[governor/modules GET] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to list WASM modules" },
      { status: 500 },
    );
  }
}
