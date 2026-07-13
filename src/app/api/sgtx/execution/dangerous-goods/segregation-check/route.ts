/**
 * POST /api/sgtx/execution/dangerous-goods/segregation-check
 *   Check IMDG segregation for a set of containers on the same shipment/vessel.
 *   Body: { containerIds: string[] }
 *   Returns: { compliant, conflicts: [{ container1, container2, rule, severity, classPair }], checked, dangerousCount }
 */
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { validateDgSegregation } from "@/lib/sgtx/execution/dangerous-goods";

export const dynamic = "force-dynamic";

/** Body expected by the segregation-check endpoint. */
interface SegregationCheckBody {
  containerIds?: string[];
}

/** IMDG segregation check — returns compliant=false on any BLOCK conflict. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SegregationCheckBody;
    if (!body || !Array.isArray(body.containerIds) || body.containerIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: "containerIds (string[]) is required" },
        { status: 400 },
      );
    }

    // De-duplicate + sanitise: drop empty strings, preserve order.
    const containerIds = Array.from(
      new Set(body.containerIds.filter((id): id is string => typeof id === "string" && id.length > 0)),
    );

    if (containerIds.length < 2) {
      return NextResponse.json({
        ok: true,
        compliant: true,
        conflicts: [],
        checked: containerIds.length,
        dangerousCount: 0,
        note: "Fewer than 2 containers — segregation check trivially passes.",
      });
    }

    const result = await validateDgSegregation(containerIds);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    logger.error("[execution/dangerous-goods/segregation-check/POST]", {
      error: (e as Error)?.message,
    });
    return NextResponse.json(
      { ok: false, error: (e as Error)?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
