// @ts-nocheck
// SGTX v17 §8.4 — Non-uniform layer validation API
//
// POST /api/sgtx/packing/non-uniform/validate
// Body: { layers: Layer[], container: Container, netPerCartonKg?, tarePerCartonKg?,
//         palletDeckHeightMm?, maxPalletPayloadKg? }
// Returns: { valid, errors, warnings, total_height_mm, total_cartons,
//            total_weight_kg, total_layers, per_layer_summary, container }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  validateNonUniformLayers,
  getContainerPreset,
  type Container,
} from "@/lib/sgtx/packing/non-uniform-stacking";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { layers, container } = body ?? {};
    if (!Array.isArray(layers) || layers.length === 0) {
      return NextResponse.json(
        { error: "layers (non-empty array) is required" },
        { status: 400 },
      );
    }
    if (!container || typeof container !== "object") {
      return NextResponse.json(
        { error: "container is required (object)" },
        { status: 400 },
      );
    }

    // Resolve container: either a preset type ("40ft", "40ft_hc", ...) or a
    // full container object with internalLengthMm/internalWidthMm/...
    let resolvedContainer: Container;
    if (typeof container === "string") {
      resolvedContainer = getContainerPreset(container);
    } else if (typeof container.type === "string" && !container.internalLengthMm) {
      resolvedContainer = getContainerPreset(container.type);
    } else {
      resolvedContainer = {
        type: container.type ?? "40ft",
        internalLengthMm: Number(container.internalLengthMm) || 12032,
        internalWidthMm: Number(container.internalWidthMm) || 2352,
        internalHeightMm: Number(container.internalHeightMm) || 2393,
        maxPayloadKg: Number(container.maxPayloadKg) || 26680,
        maxStackingHeightMm: Number(container.maxStackingHeightMm) || 2293,
      };
    }

    const result = validateNonUniformLayers({
      layers,
      container: resolvedContainer,
      netPerCartonKg: Number(body.netPerCartonKg) || undefined,
      tarePerCartonKg: Number(body.tarePerCartonKg) || undefined,
      palletDeckHeightMm: Number(body.palletDeckHeightMm) || undefined,
      maxPalletPayloadKg: Number(body.maxPalletPayloadKg) || undefined,
    });

    return NextResponse.json({
      valid: result.valid,
      errors: result.errors,
      warnings: result.warnings,
      total_height_mm: result.totalHeightMm,
      total_cartons: result.totalCartons,
      total_weight_kg: result.totalWeightKg,
      total_layers: result.totalLayers,
      per_layer_summary: result.perLayerSummary,
      container: resolvedContainer,
    });
  } catch (e: any) {
    logger.error("[packing/non-uniform/validate]", e);
    return NextResponse.json({ error: e?.message || "unknown error" }, { status: 500 });
  }
}
