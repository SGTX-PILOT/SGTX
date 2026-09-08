// @ts-nocheck
// SGTX v17 §8.4 — Non-uniform stack optimisation API (ORTools CP-SAT simulated)
//
// POST /api/sgtx/packing/non-uniform/optimise
// Body: { items: Item[], container: Container, palletFootprintMm?,
//         maxPalletPayloadKg?, palletDeckHeightMm? }
// Returns: { layers, optimisation_method, utilisation_pct, total_cartons,
//            total_layers, total_height_mm, total_weight_kg, warnings,
//            solver_status, solver_runtime_ms, solver_notes,
//            layer_pattern, visual_layout }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  optimiseStack,
  generateLayerPattern,
  getContainerPreset,
  type Container,
  type Item,
} from "@/lib/sgtx/packing/non-uniform-stacking";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { items, container } = body ?? {};
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "items (non-empty array) is required" },
        { status: 400 },
      );
    }
    if (!container || typeof container !== "object") {
      return NextResponse.json(
        { error: "container is required (object or preset string)" },
        { status: 400 },
      );
    }

    // Resolve container
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

    // Normalize items
    const normalizedItems: Item[] = items.map((it: any, i: number) => ({
      hs: it.hs,
      name: it.name || `Item ${i + 1}`,
      cartons: Number(it.cartons) || 0,
      cartonDimensionsMm: {
        length: Number(it.cartonDimensionsMm?.length) || 400,
        width: Number(it.cartonDimensionsMm?.width) || 300,
        height: Number(it.cartonDimensionsMm?.height) || 250,
      },
      netPerCartonKg: Number(it.netPerCartonKg) || 0,
      tarePerCartonKg: Number(it.tarePerCartonKg) || 0,
    }));

    const result = optimiseStack({
      items: normalizedItems,
      container: resolvedContainer,
      palletFootprintMm: body.palletFootprintMm,
      maxPalletPayloadKg: Number(body.maxPalletPayloadKg) || undefined,
      palletDeckHeightMm: Number(body.palletDeckHeightMm) || undefined,
    });

    const pattern = generateLayerPattern({
      layers: result.layers,
      palletFootprintMm: body.palletFootprintMm,
      palletDeckHeightMm: Number(body.palletDeckHeightMm) || undefined,
    });

    return NextResponse.json({
      layers: result.layers,
      optimisation_method: result.optimisationMethod,
      utilisation_pct: result.utilizationPct,
      total_cartons: result.totalCartons,
      total_layers: result.totalLayers,
      total_height_mm: result.totalHeightMm,
      total_weight_kg: result.totalWeightKg,
      warnings: result.warnings,
      solver_status: result.solverStatus,
      solver_runtime_ms: result.solverRuntimeMs,
      solver_notes: result.solverNotes,
      layer_pattern: pattern.pattern,
      visual_layout: pattern.visualLayout,
      container: resolvedContainer,
    });
  } catch (e: any) {
    logger.error("[packing/non-uniform/optimise]", e);
    return NextResponse.json({ error: e?.message || "unknown error" }, { status: 500 });
  }
}
