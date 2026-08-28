// @ts-nocheck
// SGTX Part 76 — Global Standards Gateway
// GET /api/sgtx/standards-gateway                              — list all standards
// GET /api/sgtx/standards-gateway?standard=UBL                 — get mapping for one standard
// GET /api/sgtx/standards-gateway?standard=UBL&convert=<json>  — convert data to standard
import { NextResponse } from "next/server";
import {
  listSupportedStandards,
  getStandardMapping,
  convertToStandard,
} from "@/lib/sgtx/standards-gateway";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const standard = url.searchParams.get("standard");
    const version = url.searchParams.get("version") || undefined;
    const convertRaw = url.searchParams.get("convert");

    if (!standard) {
      return NextResponse.json({
        ok: true,
        standards: listSupportedStandards(),
        count: listSupportedStandards().length,
      });
    }

    if (convertRaw) {
      let data: any = null;
      try { data = JSON.parse(convertRaw); } catch {
        return NextResponse.json({ error: "convert must be valid JSON" }, { status: 400 });
      }
      const result = await convertToStandard(data, standard, version);
      return NextResponse.json({ ok: true, result });
    }

    const mapping = await getStandardMapping(standard);
    return NextResponse.json({ ok: true, mapping });
  } catch (err: any) {
    logger.error("[api/sgtx/standards-gateway] GET failed", { error: err?.message });
    return NextResponse.json({ error: err?.message || "internal error" }, { status: 500 });
  }
}
