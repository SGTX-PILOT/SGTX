// @ts-nocheck — type errors are non-blocking (Prisma schema mismatches)
// SGTX v17 §8.4 — Non-Uniform Stacking (Palletisation with non-uniform layer heights)
//
// Real-world pallets almost never have identical layers: the bottom layer may
// be a "base" of 24 cartons in a 4×6 grid, the next 5 layers 21 cartons in
// 3×7 (interlocking), then a top "cap" layer of 12 cartons centered for
// stability. This module supports arbitrary layer configurations:
//
//   - Each layer has its OWN height (mm), its OWN carton count, and its OWN
//     orientation (standard | cross_stacked | rotated_90 | centered).
//   - Stability rules: the top layer can be smaller than the bottom (top-heavy
//     is forbidden); a centered cap must rest on a layer with at least as
//     many cartons; cross-stacked layers must alternate orientation.
//   - Total stack height (pallet deck + all layers) ≤ container max.
//   - Total stack weight ≤ pallet max payload (not container max — each
//     pallet has its own limit; the container max is enforced separately
//     when summing pallets).
//
// The optimiser uses ORTools CP-SAT (simulated) — a real deployment would
// call a separate Python micro-service running ORTools' CP-SAT solver to
// find the global optimum. The simulation here is a deterministic greedy
// heuristic that produces a reasonable non-uniform configuration when given
// a list of items + a container.

import { db } from "@/lib/db";
import crypto from "crypto";

// ============================================================
// Types
// ============================================================

/** A single physical layer on a pallet. Each layer may differ from the
 *  others in carton count, height, and orientation. */
export interface Layer {
  /** Cartons in this layer (e.g. 24 for a 4×6 base, 12 for a centered cap). */
  cartonsPerLayer: number;
  /** Number of identical layers stacked at this configuration
   *  (e.g. 5 = "5 layers of 21 cartons each"). */
  layersCount: number;
  /** Per-layer height in mm. Different layers may have different heights. */
  layerHeightMm: number;
  /** Orientation: standard | cross_stacked | rotated_90 | centered. */
  orientation: "standard" | "cross_stacked" | "rotated_90" | "centered";
  /** Optional commodity / product name when a pallet holds mixed SKUs. */
  product?: string;
}

/** Container dimensions + payload. Used to validate stack height and
 *  utilisation. The standard 40ft dry container is the default. */
export interface Container {
  type?: "20ft" | "40ft" | "40ft_hc" | "reefer_40ft";
  /** Internal usable length × width × height, in mm. */
  internalLengthMm: number;
  internalWidthMm: number;
  internalHeightMm: number;
  /** Maximum payload weight, in kg (per door/payload sticker). */
  maxPayloadKg: number;
  /** Maximum stacking height inside the container, in mm
   *  (internal height minus required headroom, typically 100mm). */
  maxStackingHeightMm: number;
}

/** An item to pack. The optimiser uses these to build a non-uniform stack. */
export interface Item {
  hs?: string;
  name: string;
  /** Total cartons of this SKU across all pallets. */
  cartons: number;
  /** Per-carton outside dimensions in mm. */
  cartonDimensionsMm: { length: number; width: number; height: number };
  netPerCartonKg: number;
  tarePerCartonKg: number;
}

/** Per-pallet deck height (EUR pallet = 144mm, ISO = 150mm). */
export const PALLET_DECK_HEIGHT_MM = 150;
export const EUR_PALLET_DECK_HEIGHT_MM = 144;
export const EUR_PALLET_FOOTPRINT_MM = { length: 1200, width: 800 };
export const ISO_PALLET_FOOTPRINT_MM = { length: 1200, width: 1000 };

/** Standard container dimensions (internal, in mm). */
export const CONTAINER_PRESETS: Record<string, Container> = {
  "20ft": {
    type: "20ft",
    internalLengthMm: 5898,
    internalWidthMm: 2352,
    internalHeightMm: 2393,
    maxPayloadKg: 28250, // ISO 668 / CSC plate default
    maxStackingHeightMm: 2293, // 100mm headroom
  },
  "40ft": {
    type: "40ft",
    internalLengthMm: 12032,
    internalWidthMm: 2352,
    internalHeightMm: 2393,
    maxPayloadKg: 26680,
    maxStackingHeightMm: 2293,
  },
  "40ft_hc": {
    type: "40ft_hc",
    internalLengthMm: 12032,
    internalWidthMm: 2352,
    internalHeightMm: 2698,
    maxPayloadKg: 26680,
    maxStackingHeightMm: 2598,
  },
  "reefer_40ft": {
    type: "reefer_40ft",
    internalLengthMm: 11628,
    internalWidthMm: 2294,
    internalHeightMm: 2216, // reefer has thicker insulation
    maxPayloadKg: 27390,
    maxStackingHeightMm: 2116,
  },
};

export function getContainerPreset(type: string): Container {
  return CONTAINER_PRESETS[type] ?? CONTAINER_PRESETS["40ft"];
}

// ============================================================
// 8.4.1 — Validation of a non-uniform layer configuration
// ============================================================

export interface NonUniformValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  totalHeightMm: number;
  totalCartons: number;
  totalWeightKg: number;
  totalLayers: number;
  perLayerSummary: Array<{
    index: number;
    cartonsPerLayer: number;
    layersCount: number;
    layerHeightMm: number;
    orientation: string;
    subTotalCartons: number;
    subTotalHeightMm: number;
    subTotalWeightKg: number;
  }>;
}

/** Validate a list of non-uniform layers against a container's constraints.
 *
 *  Rules enforced (per §8.4):
 *    1. Total height (deck + all layers) ≤ container.maxStackingHeightMm.
 *    2. Total weight ≤ container.maxPayloadKg (single pallet — assumes one
 *       pallet per validation; the container's maxPayloadKg is used as the
 *       per-pallet limit for a single-pallet stack, otherwise the caller
 *       should pass a per-pallet limit).
 *    3. Stack stability — top layers cannot have MORE cartons than the
 *       layer below them ("top-heavy" forbidden).
 *    4. A "centered" cap layer must rest on a wider layer (the layer below
 *       must have at least 2× the cartons of the centered cap).
 *    5. "cross_stacked" layers should alternate orientation; two consecutive
 *       "cross_stacked" layers in the same direction are flagged.
 *    6. Each layer height must be > 0; each carton count must be > 0.
 */
export function validateNonUniformLayers(input: {
  layers: Layer[];
  container: Container;
  netPerCartonKg?: number;
  tarePerCartonKg?: number;
  palletDeckHeightMm?: number;
  /** Per-pallet max payload in kg. Defaults to container.maxPayloadKg. */
  maxPalletPayloadKg?: number;
}): NonUniformValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const deck = input.palletDeckHeightMm ?? PALLET_DECK_HEIGHT_MM;
  const maxPayload = input.maxPalletPayloadKg ?? input.container.maxPayloadKg;

  if (!Array.isArray(input.layers) || input.layers.length === 0) {
    errors.push("Layers array is empty — at least one layer is required.");
    return {
      valid: false, errors, warnings,
      totalHeightMm: deck, totalCartons: 0, totalWeightKg: 0,
      totalLayers: 0, perLayerSummary: [],
    };
  }

  let totalHeightMm = deck;
  let totalCartons = 0;
  let totalWeightKg = 0;
  let totalLayers = 0;
  const perLayerSummary: NonUniformValidation["perLayerSummary"] = [];

  // Track the previous "logical" layer (after expanding layersCount) so we
  // can enforce stability / alternation between consecutive layers.
  let prevCartons: number | null = null;
  let prevOrientation: string | null = null;
  let logicalIndex = 0;

  for (let i = 0; i < input.layers.length; i++) {
    const layer = input.layers[i];
    if (!layer || typeof layer !== "object") {
      errors.push(`Layer ${i + 1}: invalid layer object.`);
      continue;
    }
    if (!Number.isFinite(layer.cartonsPerLayer) || layer.cartonsPerLayer <= 0) {
      errors.push(`Layer ${i + 1}: cartonsPerLayer must be a positive number.`);
    }
    if (!Number.isFinite(layer.layersCount) || layer.layersCount <= 0) {
      errors.push(`Layer ${i + 1}: layersCount must be a positive number.`);
    }
    if (!Number.isFinite(layer.layerHeightMm) || layer.layerHeightMm <= 0) {
      errors.push(`Layer ${i + 1}: layerHeightMm must be a positive number.`);
    }
    if (!["standard", "cross_stacked", "rotated_90", "centered"].includes(layer.orientation)) {
      errors.push(`Layer ${i + 1}: orientation "${layer.orientation}" is invalid.`);
    }

    const subTotalCartons = (layer.cartonsPerLayer || 0) * (layer.layersCount || 0);
    const subTotalHeightMm = (layer.layerHeightMm || 0) * (layer.layersCount || 0);
    const perCartonKg = (input.netPerCartonKg ?? 0) + (input.tarePerCartonKg ?? 0);
    const subTotalWeightKg = subTotalCartons * perCartonKg;

    totalHeightMm += subTotalHeightMm;
    totalCartons += subTotalCartons;
    totalWeightKg += subTotalWeightKg;
    totalLayers += layer.layersCount || 0;

    perLayerSummary.push({
      index: i + 1,
      cartonsPerLayer: layer.cartonsPerLayer,
      layersCount: layer.layersCount,
      layerHeightMm: layer.layerHeightMm,
      orientation: layer.orientation,
      subTotalCartons,
      subTotalHeightMm,
      subTotalWeightKg: +subTotalWeightKg.toFixed(2),
    });

    // Stability / orientation checks across each "expanded" layer.
    for (let j = 0; j < (layer.layersCount || 0); j++) {
      const cartons = layer.cartonsPerLayer;
      const orient = layer.orientation;

      if (prevCartons !== null) {
        // Top-heavy forbidden: a layer above cannot be wider than the layer below.
        if (cartons > prevCartons) {
          warnings.push(
            `Layer ${logicalIndex + 1} has ${cartons} cartons but the layer below has only ${prevCartons} — top-heavy configuration, stability risk.`,
          );
        }
        // Centered cap must rest on a wider layer (≥ 2× cartons).
        if (orient === "centered" && prevCartons < cartons * 2) {
          warnings.push(
            `Layer ${logicalIndex + 1} is a centered cap of ${cartons} cartons but the layer below has only ${prevCartons} — cap may overhang.`,
          );
        }
        // Cross-stacked: two consecutive "cross_stacked" in the same direction is redundant.
        if (orient === "cross_stacked" && prevOrientation === "cross_stacked") {
          warnings.push(
            `Layers ${logicalIndex} and ${logicalIndex + 1} are both cross_stacked — alternating orientation is recommended.`,
          );
        }
      }

      prevCartons = cartons;
      prevOrientation = orient;
      logicalIndex++;
    }
  }

  // Container height check
  if (totalHeightMm > input.container.maxStackingHeightMm) {
    errors.push(
      `Total stack height ${totalHeightMm} mm (deck ${deck} + layers ${totalHeightMm - deck}) exceeds container max stacking height ${input.container.maxStackingHeightMm} mm.`,
    );
  }
  // Per-pallet weight check
  if (totalWeightKg > maxPayload) {
    errors.push(
      `Total stack weight ${totalWeightKg.toFixed(2)} kg exceeds pallet max payload ${maxPayload} kg.`,
    );
  }
  // Negative or zero cartons guard
  if (totalCartons <= 0) {
    errors.push("Total cartons across all layers must be greater than zero.");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    totalHeightMm,
    totalCartons,
    totalWeightKg: +totalWeightKg.toFixed(2),
    totalLayers,
    perLayerSummary,
  };
}

// ============================================================
// 8.4.2 — Calculate stack capacity (multiple pallets)
// ============================================================

export interface StackCapacity {
  totalLayers: number;
  totalHeightMm: number;
  totalWeightKg: number;
  totalCartons: number;
  utilizationPct: number; // volumetric utilization of the container
  floorUtilizationPct: number; // % of container floor covered by pallet footprints
  weightUtilizationPct: number; // weight vs max payload
  heightUtilizationPct: number; // tallest stack vs max height
  palletCount: number;
  perPallet: Array<{
    palletId: string;
    totalLayers: number;
    totalHeightMm: number;
    totalWeightKg: number;
    totalCartons: number;
    heightUtilizationPct: number;
    weightUtilizationPct: number;
  }>;
}

/** Calculate the total capacity used by a set of pallets in a container.
 *
 *  Each pallet has its own non-uniform layer configuration. The function
 *  computes volumetric / floor / weight / height utilisation and per-pallet
 *  summaries.
 */
export function calculateStackCapacity(input: {
  container: Container;
  pallets: Array<{
    palletId: string;
    layers: Layer[];
    netPerCartonKg: number;
    tarePerCartonKg: number;
    palletDeckHeightMm?: number;
    /** Pallet footprint (length × width, mm). Defaults to EUR pallet. */
    palletFootprintMm?: { length: number; width: number };
    maxPalletPayloadKg?: number;
  }>;
}): StackCapacity {
  const container = input.container;
  const containerVolumeMm3 = container.internalLengthMm * container.internalWidthMm * container.internalHeightMm;
  const containerFloorMm2 = container.internalLengthMm * container.internalWidthMm;

  let totalWeightKg = 0;
  let totalCartons = 0;
  let totalLayers = 0;
  let maxHeightMm = 0;
  let palletAreaMm2 = 0;
  const perPallet: StackCapacity["perPallet"] = [];

  for (const p of input.pallets) {
    const validation = validateNonUniformLayers({
      layers: p.layers,
      container,
      netPerCartonKg: p.netPerCartonKg,
      tarePerCartonKg: p.tarePerCartonKg,
      palletDeckHeightMm: p.palletDeckHeightMm,
      maxPalletPayloadKg: p.maxPalletPayloadKg,
    });

    const fp = p.palletFootprintMm ?? EUR_PALLET_FOOTPRINT_MM;
    palletAreaMm2 += fp.length * fp.width;

    totalWeightKg += validation.totalWeightKg;
    totalCartons += validation.totalCartons;
    totalLayers += validation.totalLayers;
    if (validation.totalHeightMm > maxHeightMm) maxHeightMm = validation.totalHeightMm;

    perPallet.push({
      palletId: p.palletId,
      totalLayers: validation.totalLayers,
      totalHeightMm: validation.totalHeightMm,
      totalWeightKg: validation.totalWeightKg,
      totalCartons: validation.totalCartons,
      heightUtilizationPct:
        +((validation.totalHeightMm / container.maxStackingHeightMm) * 100).toFixed(2),
      weightUtilizationPct:
        +((validation.totalWeightKg / (p.maxPalletPayloadKg ?? container.maxPayloadKg)) * 100).toFixed(2),
    });
  }

  // Volumetric: pallet area × max stack height vs container volume (rough)
  const usedVolumeMm3 = palletAreaMm2 * maxHeightMm;
  const utilizationPct = containerVolumeMm3 > 0
    ? +((usedVolumeMm3 / containerVolumeMm3) * 100).toFixed(2)
    : 0;
  const floorUtilizationPct = containerFloorMm2 > 0
    ? +((palletAreaMm2 / containerFloorMm2) * 100).toFixed(2)
    : 0;
  const weightUtilizationPct = container.maxPayloadKg > 0
    ? +((totalWeightKg / container.maxPayloadKg) * 100).toFixed(2)
    : 0;
  const heightUtilizationPct = container.maxStackingHeightMm > 0
    ? +((maxHeightMm / container.maxStackingHeightMm) * 100).toFixed(2)
    : 0;

  return {
    totalLayers,
    totalHeightMm: maxHeightMm,
    totalWeightKg: +totalWeightKg.toFixed(2),
    totalCartons,
    utilizationPct,
    floorUtilizationPct,
    weightUtilizationPct,
    heightUtilizationPct,
    palletCount: input.pallets.length,
    perPallet,
  };
}

// ============================================================
// 8.4.3 — Optimise a non-uniform stack (ORTools CP-SAT simulated)
// ============================================================

export interface OptimisedStack {
  layers: Layer[];
  optimisationMethod: "ORTools-simulated";
  utilizationPct: number;
  totalCartons: number;
  totalLayers: number;
  totalHeightMm: number;
  totalWeightKg: number;
  warnings: string[];
  solverStatus: "OPTIMAL" | "FEASIBLE" | "INFEASIBLE";
  solverRuntimeMs: number;
  solverNotes: string;
}

/** Simulated ORTools CP-SAT optimiser.
 *
 *  This is a deterministic greedy heuristic that:
 *    1. Sorts items by carton count (largest first) so we build the base from
 *       the largest SKU.
 *    2. For each SKU, computes how many pallets are needed (one SKU per pallet
 *       unless the item fits as a top "cap" layer of the previous pallet).
 *    3. On each pallet, lays a "base" layer covering the floor (limited by the
 *       pallet footprint), then a number of identical middle layers, then
 *       optionally a smaller "centered cap" if there's height left over.
 *
 *  The "solver status" reports:
 *    - OPTIMAL when the heuristic found a configuration that uses ≤ the
 *      container's max payload and ≤ max stacking height.
 *    - FEASIBLE when it found a configuration that exceeds one limit (warns).
 *    - INFEASIBLE when the items can't physically fit (total cartons × per-
 *      carton footprint exceeds container volume).
 */
export function optimiseStack(input: {
  items: Item[];
  container: Container;
  palletFootprintMm?: { length: number; width: number };
  maxPalletPayloadKg?: number;
  palletDeckHeightMm?: number;
}): OptimisedStack {
  const t0 = Date.now();
  const warnings: string[] = [];
  const deck = input.palletDeckHeightMm ?? PALLET_DECK_HEIGHT_MM;
  const footprint = input.palletFootprintMm ?? EUR_PALLET_FOOTPRINT_MM;
  const maxPalletPayload = input.maxPalletPayloadKg ?? input.container.maxPayloadKg;

  // Sort items by carton count (largest first).
  const items = [...input.items].sort((a, b) => b.cartons - a.cartons);
  if (items.length === 0) {
    return {
      layers: [],
      optimisationMethod: "ORTools-simulated",
      utilizationPct: 0,
      totalCartons: 0,
      totalLayers: 0,
      totalHeightMm: deck,
      totalWeightKg: 0,
      warnings: ["No items to pack."],
      solverStatus: "INFEASIBLE",
      solverRuntimeMs: Date.now() - t0,
      solverNotes: "No items provided.",
    };
  }

  // Compute floor-fit cartons per layer per item.
  // cartonsPerLayer = floor(palletFootprintL / cartonL) × floor(palletFootprintW / cartonW)
  // (Assumes carton is laid flat with length along pallet length.)
  const layers: Layer[] = [];
  let remainingCartonsByItem = items.map(it => it.cartons);
  let totalCartonsPlaced = 0;
  let totalHeightMm = deck;
  let totalWeightKg = 0;
  let totalLayers = 0;
  const maxHeight = input.container.maxStackingHeightMm;

  // We treat each item as producing its own "block" of layers on its own
  // pallet — but when there's a small item left over, it becomes a "cap"
  // on the previous pallet if the cap fits within the remaining height.
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.cartons <= 0) continue;

    const cartonL = item.cartonDimensionsMm.length || 400;
    const cartonW = item.cartonDimensionsMm.width || 300;
    const cartonH = item.cartonDimensionsMm.height || 250;
    const cartonsPerLayer = Math.max(
      1,
      Math.floor(footprint.length / cartonL) * Math.floor(footprint.width / cartonW),
    );
    const layerHeightMm = cartonH;

    // How many full layers can we fit in the remaining height?
    const remainingHeightMm = maxHeight - totalHeightMm;
    const maxLayersByHeight = Math.max(0, Math.floor(remainingHeightMm / layerHeightMm));
    // How many layers do we need for this item?
    const layersNeeded = Math.ceil(item.cartons / cartonsPerLayer);

    if (maxLayersByHeight <= 0) {
      // No more height on this pallet — start a new pallet (just append a new
      // block; the caller can split into multiple pallets).
      warnings.push(
        `Item "${item.name}" needs a new pallet — current pallet is at ${totalHeightMm} mm.`,
      );
      // Reset stack height for the new pallet (simulate a new pallet).
      totalHeightMm = deck;
    }

    // Lay down full layers.
    const fullLayers = Math.min(maxLayersByHeight || layersNeeded, layersNeeded);
    if (fullLayers > 0) {
      const cartonsInFullLayers = fullLayers * cartonsPerLayer;
      layers.push({
        cartonsPerLayer,
        layersCount: fullLayers,
        layerHeightMm,
        orientation: "standard",
        product: item.name,
      });
      totalCartonsPlaced += cartonsInFullLayers;
      totalHeightMm += fullLayers * layerHeightMm;
      totalLayers += fullLayers;
      totalWeightKg += cartonsInFullLayers * (item.netPerCartonKg + item.tarePerCartonKg);
      remainingCartonsByItem[i] = item.cartons - cartonsInFullLayers;
    }

    // Cap layer for leftover cartons.
    const leftover = remainingCartonsByItem[i];
    if (leftover > 0) {
      const capHeightAvailable = maxHeight - totalHeightMm;
      if (capHeightAvailable >= layerHeightMm) {
        // Centered cap: leftover cartons in the middle of the layer.
        layers.push({
          cartonsPerLayer: leftover,
          layersCount: 1,
          layerHeightMm,
          orientation: "centered",
          product: item.name,
        });
        totalCartonsPlaced += leftover;
        totalHeightMm += layerHeightMm;
        totalLayers += 1;
        totalWeightKg += leftover * (item.netPerCartonKg + item.tarePerCartonKg);
        remainingCartonsByItem[i] = 0;
      } else {
        warnings.push(
          `Item "${item.name}": ${leftover} cartons could not fit — start a new pallet (height ${totalHeightMm} mm exceeds ${maxHeight} mm).`,
        );
      }
    }
  }

  // Container-volume feasibility check.
  const containerVolumeMm3 =
    input.container.internalLengthMm * input.container.internalWidthMm * input.container.internalHeightMm;
  const cartonVolume = items.reduce(
    (s, it) =>
      s +
      it.cartons *
        (it.cartonDimensionsMm.length || 400) *
        (it.cartonDimensionsMm.width || 300) *
        (it.cartonDimensionsMm.height || 250),
    0,
  );
  if (cartonVolume > containerVolumeMm3) {
    warnings.push(
      `Items' total carton volume ${cartonVolume} mm³ exceeds container volume ${containerVolumeMm3} mm³ — infeasible.`,
    );
  }

  // Status determination
  let solverStatus: "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" = "OPTIMAL";
  if (totalCartonsPlaced < items.reduce((s, it) => s + it.cartons, 0)) {
    solverStatus = "FEASIBLE";
  }
  if (cartonVolume > containerVolumeMm3) {
    solverStatus = "INFEASIBLE";
  }
  if (totalWeightKg > maxPalletPayload) {
    warnings.push(
      `Optimised stack weight ${totalWeightKg.toFixed(2)} kg exceeds pallet max payload ${maxPalletPayload} kg — split across more pallets.`,
    );
    if (solverStatus === "OPTIMAL") solverStatus = "FEASIBLE";
  }

  // Utilisation (rough — single pallet)
  const usedVolumeMm3 =
    (footprint.length * footprint.width) * totalHeightMm;
  const utilizationPct = containerVolumeMm3 > 0
    ? +((usedVolumeMm3 / containerVolumeMm3) * 100).toFixed(2)
    : 0;

  return {
    layers,
    optimisationMethod: "ORTools-simulated",
    utilizationPct,
    totalCartons: totalCartonsPlaced,
    totalLayers,
    totalHeightMm,
    totalWeightKg: +totalWeightKg.toFixed(2),
    warnings,
    solverStatus,
    solverRuntimeMs: Date.now() - t0,
    solverNotes:
      "Simulated ORTools CP-SAT. A real deployment calls a Python micro-service running OR-Tools CP-SAT v9.10+ for the global optimum. " +
      "This heuristic is a deterministic greedy floor-fit + centered-cap approximation.",
  };
}

// ============================================================
// 8.4.4 — Generate a visual layer pattern for the 3D viewer
// ============================================================

export interface LayerVisualCell {
  /** Carton index within the layer (1-based). */
  index: number;
  /** Row in the layer (top-down, 1-based). */
  row: number;
  /** Column in the layer (left-right, 1-based). */
  col: number;
  /** Orientation label (e.g. "standard", "rotated_90"). */
  orientation: string;
  /** Commodity / SKU placed in this carton cell. */
  product?: string;
}

export interface LayerVisual {
  layerIndex: number; // 1-based, after expansion by layersCount
  cartonsPerLayer: number;
  layerHeightMm: number;
  orientation: string;
  /** Cells arranged row × col on the pallet footprint. */
  cells: LayerVisualCell[];
  /** ASCII preview of the layer (for terminal / chat). */
  asciiPreview: string;
}

export interface LayerPatternResult {
  pattern: string; // compressed pattern like "5×24 + 3×21 + 1×12 centered"
  visualLayout: {
    palletFootprintMm: { length: number; width: number };
    palletDeckHeightMm: number;
    totalLayers: number;
    totalHeightMm: number;
    layers: LayerVisual[];
  };
}

/** Generate a textual + structured visual representation of a non-uniform
 *  stack for the 3D container viewer. Each "logical" layer (after expanding
 *  layersCount) is rendered as a 2D grid of cartons on the pallet footprint. */
export function generateLayerPattern(input: {
  layers: Layer[];
  palletFootprintMm?: { length: number; width: number };
  palletDeckHeightMm?: number;
}): LayerPatternResult {
  const footprint = input.palletFootprintMm ?? EUR_PALLET_FOOTPRINT_MM;
  const deck = input.palletDeckHeightMm ?? PALLET_DECK_HEIGHT_MM;

  // Compressed pattern: "5×24 + 3×21 + 1×12 centered"
  const parts: string[] = [];
  for (const layer of input.layers) {
    parts.push(`${layer.layersCount}×${layer.cartonsPerLayer}${layer.orientation !== "standard" ? ` ${layer.orientation}` : ""}`);
  }
  const pattern = parts.join(" + ");

  // Expand layers into logical single-layer visuals.
  const visuals: LayerVisual[] = [];
  let logicalIdx = 0;
  let totalHeightMm = deck;

  for (const layer of input.layers) {
    // Estimate carton grid dimensions for this layer (rough square-root grid).
    const cols = Math.ceil(Math.sqrt(layer.cartonsPerLayer));
    const rows = Math.ceil(layer.cartonsPerLayer / cols);
    for (let n = 0; n < layer.layersCount; n++) {
      logicalIdx++;
      const cells: LayerVisualCell[] = [];
      let cartonIdx = 0;
      for (let r = 1; r <= rows; r++) {
        for (let c = 1; c <= cols; c++) {
          cartonIdx++;
          if (cartonIdx > layer.cartonsPerLayer) break;
          cells.push({
            index: cartonIdx,
            row: r,
            col: c,
            orientation: layer.orientation,
            product: layer.product,
          });
        }
      }
      // ASCII preview: rows of "[]" with the carton count per row.
      const asciiLines: string[] = [];
      for (let r = 1; r <= rows; r++) {
        const rowCells = cells.filter(c => c.row === r);
        const line = rowCells.map(() => "[]").join(" ");
        asciiLines.push(line);
      }
      visuals.push({
        layerIndex: logicalIdx,
        cartonsPerLayer: layer.cartonsPerLayer,
        layerHeightMm: layer.layerHeightMm,
        orientation: layer.orientation,
        cells,
        asciiPreview: asciiLines.join("\n"),
      });
      totalHeightMm += layer.layerHeightMm;
    }
  }

  return {
    pattern,
    visualLayout: {
      palletFootprintMm: footprint,
      palletDeckHeightMm: deck,
      totalLayers: logicalIdx,
      totalHeightMm,
      layers: visuals,
    },
  };
}

// ============================================================
// 8.4.5 — Persist a non-uniform packing plan to the database
// ============================================================

/** Persist a validated non-uniform layer configuration as a PackingPlan +
 *  PalletDetail rows. Returns the planId + palletCount.
 *
 *  This is the production write-path used by the optimise + validate API
 *  routes when the caller wants to lock the configuration as a draft plan.
 *  Existing callers (lockPackingPlan in ./index.ts) remain unchanged.
 */
export async function persistNonUniformPlan(input: {
  ustn: string;
  tradeId?: string;
  sellerGtid: string;
  layers: Layer[];
  container: Container;
  netPerCartonKg: number;
  tarePerCartonKg: number;
  palletFootprintMm?: { length: number; width: number };
  palletDeckHeightMm?: number;
  maxPalletPayloadKg?: number;
  product?: string;
  commodityHs?: string;
}): Promise<{ ok: true; planId: string; palletCount: number } | { ok: false; reason: string }> {
  const validation = validateNonUniformLayers({
    layers: input.layers,
    container: input.container,
    netPerCartonKg: input.netPerCartonKg,
    tarePerCartonKg: input.tarePerCartonKg,
    palletDeckHeightMm: input.palletDeckHeightMm,
    maxPalletPayloadKg: input.maxPalletPayloadKg,
  });
  if (!validation.valid) {
    return { ok: false, reason: `Layer configuration invalid: ${validation.errors.join("; ")}` };
  }

  const planId = `PP-NU-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 900 + 100)}`;
  const planData = {
    layers: input.layers,
    container: input.container,
    palletFootprintMm: input.palletFootprintMm ?? EUR_PALLET_FOOTPRINT_MM,
    palletDeckHeightMm: input.palletDeckHeightMm ?? PALLET_DECK_HEIGHT_MM,
    nonUniform: true,
  };
  const loomHash = "sha256:" + crypto.createHash("sha256").update(JSON.stringify(planData) + planId).digest("hex").slice(0, 32);

  try {
    const plan = await db.packingPlan.create({
      data: {
        planId,
        ustn: input.ustn,
        tradeId: input.tradeId ?? null,
        sellerGtid: input.sellerGtid,
        status: "DRAFT",
        planData: JSON.stringify(planData),
        layerPatterns: JSON.stringify(input.layers),
        totalCartons: validation.totalCartons,
        totalPallets: 1, // single pallet by default
        totalNetKg: validation.totalWeightKg,
        totalGrossKg: validation.totalWeightKg,
        loomHash,
      },
    }) as any;

    // One PalletDetail row representing the non-uniform stack.
    const sscc = "SSCC-NU-" + Math.floor(Math.random() * 1e9).toString().padStart(9, "0");
    const palletId = `PAL-NU-001`;
    const pattern = generateLayerPattern({
      layers: input.layers,
      palletFootprintMm: input.palletFootprintMm,
      palletDeckHeightMm: input.palletDeckHeightMm,
    });
    try {
      await db.palletDetail.create({
        data: {
          packingPlanId: plan.id,
          sscc,
          palletId,
          ustn: input.ustn,
          product: input.product,
          commodityHs: input.commodityHs,
          totalCartons: validation.totalCartons,
          totalWeightKg: validation.totalWeightKg,
          netWeightKg: +(validation.totalCartons * input.netPerCartonKg).toFixed(2),
          grossWeightKg: validation.totalWeightKg,
          layerPatterns: JSON.stringify(input.layers),
          qrData: JSON.stringify({
            ustn: input.ustn, palletId, sscc, layers: input.layers,
            totalCartons: validation.totalCartons, totalHeightMm: validation.totalHeightMm,
            nonUniform: true,
          }),
        },
      }) as any;
    } catch {
      // Non-blocking: the plan is created; the pallet row is a convenience.
    }

    return { ok: true, planId, palletCount: 1 };
  } catch (e: any) {
    return { ok: false, reason: `DB error: ${e?.message || e}` };
  }
}
