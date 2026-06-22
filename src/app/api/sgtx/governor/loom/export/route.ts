import { NextRequest, NextResponse } from "next/server";
import { exportChain } from "@/lib/sgtx/governor/loom-verifier";

// GET /api/sgtx/governor/loom/export — export the Loom chain (JSON)
//
// Blueprint Part 1.6 — exports the full Loom chain in a JSON format consumable
// by the external loom-verify CLI tool. The export includes:
//   - format identifier ("sgtx-loom-chain-v1")
//   - exportedAt timestamp
//   - genesisHash (SHA256 of the immutable module version manifest)
//   - latestHash
//   - chainLength
//   - filter (if scoped to a single USTN)
//   - moduleVersions (the manifest hashed into genesis)
//   - decisions[] (every Governor decision with stored hash + signature)
//
// Query params:
//   ?ustn=SGTX-…    (scope the export to a single trade)
//   ?download=1     (set Content-Disposition: attachment to trigger a download)
export async function GET(req: NextRequest) {
  try {
    const ustn = req.nextUrl.searchParams.get("ustn") || undefined;
    const download = req.nextUrl.searchParams.get("download") === "1";

    const exported = await exportChain(ustn);

    const body = JSON.stringify(exported, null, 2);
    const headers: Record<string, string> = {
      "Content-Type": "application/json; charset=utf-8",
      "X-SGTX-Loom-Format": exported.format,
      "X-SGTX-Loom-Genesis": exported.genesisHash,
      "X-SGTX-Loom-Length": String(exported.chainLength),
    };

    if (download) {
      const fname = ustn
        ? `sgtx-loom-${ustn}.json`
        : `sgtx-loom-chain-${exported.exportedAt.replace(/[:.]/g, "-")}.json`;
      headers["Content-Disposition"] = `attachment; filename="${fname}"`;
    }

    return new NextResponse(body, { status: 200, headers });
  } catch (e: any) {
    console.error("[governor/loom/export GET] error:", e);
    return NextResponse.json(
      { error: e?.message || "Loom chain export failed" },
      { status: 500 },
    );
  }
}
