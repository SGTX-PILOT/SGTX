// @ts-nocheck
/**
 * SGTX State-of-Art Packaging Engine
 * ===========================================================================
 *
 * Implements real-world packaging hierarchy for international trade:
 *
 *   SKU (Product)
 *     → Bag (e.g. 400g bag of frozen strawberries)
 *       → Carton/Box (e.g. 10 bags per carton = 4kg)
 *         → Pallet (e.g. 120 cartons per pallet = 480kg)
 *           → Container (e.g. 10 pallets per 20ft reefer = 4,800kg)
 *
 * Real-world examples:
 *   Frozen strawberries (IQF):
 *     - Bag: 400g polybag
 *     - Carton: 10 bags = 4kg net, 4.2kg gross (200g tare)
 *     - Pallet: 120 cartons = 480kg net, 504kg gross (24kg pallet tare)
 *     - 20ft Reefer: 10 pallets = 4,800kg net, 5,040kg gross
 *
 *   Fresh oranges:
 *     - Bag: 3kg mesh bag
 *     - Carton: 1 bag = 3kg net, 3.2kg gross (200g tare)
 *     - Pallet: 50 cartons = 150kg net, 160kg gross (10kg pallet tare)
 *     - 40ft Reefer: 20 pallets = 3,000kg net, 3,200kg gross
 *
 *   Bulk rice:
 *     - Bag: 25kg woven PP bag
 *     - Pallet: 40 bags = 1,000kg net, 1,020kg gross (20kg pallet tare)
 *     - 20ft Dry: 10 pallets = 10,000kg net, 10,200kg gross
 */

import { logger } from "@/lib/sgtx/logger";

// ============ Types ============

export interface PackagingHierarchy {
  sku: {
    productCode: string;
    productName: string;
    hsCode?: string;
    unitType: "BAG" | "BOX" | "CRATE" | "DRUM" | "BOTTLE" | "BULK" | "EACH";
  };
  bag: {
    weightPerBagKg: number;
    bagType: string;
    bagsPerCarton: number;
    tarePerBagKg: number;
  };
  carton: {
    netWeightPerCartonKg: number;
    grossWeightPerCartonKg: number;
    tarePerCartonKg: number;
    cartonLengthCm: number;
    cartonWidthCm: number;
    cartonHeightCm: number;
    cartonsPerPallet: number;
    cartonType: string;
  };
  pallet: {
    palletType: "EUR" | "ISO" | "CHEP" | "GMA" | "CUSTOM";
    palletLengthCm: number;
    palletWidthCm: number;
    palletHeightCm: number;
    palletTareKg: number;
    netWeightPerPalletKg: number;
    grossWeightPerPalletKg: number;
    maxStackingLayers: number;
    cartonsPerLayer: number;
  };
  container: {
    containerType: "20FT_DRY" | "40FT_DRY" | "20FT_REEFER" | "40FT_REEFER" | "40FT_HC" | "20FT_OT" | "40FT_OT";
    palletsPerContainer: number;
    maxPayloadKg: number;
    maxVolumeCbm: number;
    netWeightKg: number;
    grossWeightKg: number;
  };
}

export interface PackagingCalculation {
  totalBags: number;
  totalCartons: number;
  totalPallets: number;
  totalContainers: number;
  totalNetWeightKg: number;
  totalGrossWeightKg: number;
  totalTareKg: number;
  totalVolumeCbm: number;
  totalCartonAreaM2: number;
  containerUtilizationPct: number;
  weightUtilizationPct: number;
  packagingCostUsd?: number;
  carbonFootprintKg?: number;
}

// ============ Commodity-Specific Packaging Defaults ============

export const COMMODITY_PACKAGING_DEFAULTS: Record<string, PackagingHierarchy> = {
  frozen_strawberries: {
    sku: { productCode: "FS-IQF-001", productName: "Frozen Strawberries IQF", hsCode: "0811.10", unitType: "BAG" },
    bag: { weightPerBagKg: 0.4, bagType: "Polybag (400g)", bagsPerCarton: 10, tarePerBagKg: 0.005 },
    carton: { netWeightPerCartonKg: 4.0, grossWeightPerCartonKg: 4.2, tarePerCartonKg: 0.2, cartonLengthCm: 40, cartonWidthCm: 30, cartonHeightCm: 25, cartonsPerPallet: 120, cartonType: "Corrugated 5-ply" },
    pallet: { palletType: "EUR", palletLengthCm: 120, palletWidthCm: 80, palletHeightCm: 180, palletTareKg: 25, netWeightPerPalletKg: 480, grossWeightPerPalletKg: 504, maxStackingLayers: 8, cartonsPerLayer: 15 },
    container: { containerType: "20FT_REEFER", palletsPerContainer: 10, maxPayloadKg: 22000, maxVolumeCbm: 28, netWeightKg: 4800, grossWeightKg: 5040 },
  },
  fresh_oranges: {
    sku: { productCode: "OR-FRESH-001", productName: "Fresh Oranges (Valencia)", hsCode: "0805.10", unitType: "BAG" },
    bag: { weightPerBagKg: 3.0, bagType: "Mesh bag (3kg)", bagsPerCarton: 1, tarePerBagKg: 0.02 },
    carton: { netWeightPerCartonKg: 3.0, grossWeightPerCartonKg: 3.2, tarePerCartonKg: 0.2, cartonLengthCm: 50, cartonWidthCm: 35, cartonHeightCm: 20, cartonsPerPallet: 50, cartonType: "Corrugated 3-ply" },
    pallet: { palletType: "EUR", palletLengthCm: 120, palletWidthCm: 80, palletHeightCm: 160, palletTareKg: 25, netWeightPerPalletKg: 150, grossWeightPerPalletKg: 160, maxStackingLayers: 5, cartonsPerLayer: 10 },
    container: { containerType: "40FT_REEFER", palletsPerContainer: 20, maxPayloadKg: 28000, maxVolumeCbm: 58, netWeightKg: 3000, grossWeightKg: 3200 },
  },
  bulk_rice: {
    sku: { productCode: "RC-BULK-001", productName: "White Rice (Long Grain)", hsCode: "1006.30", unitType: "BAG" },
    bag: { weightPerBagKg: 25.0, bagType: "Woven PP bag (25kg)", bagsPerCarton: 1, tarePerBagKg: 0.1 },
    carton: { netWeightPerCartonKg: 25.0, grossWeightPerCartonKg: 25.1, tarePerCartonKg: 0.0, cartonLengthCm: 60, cartonWidthCm: 40, cartonHeightCm: 15, cartonsPerPallet: 40, cartonType: "No carton (bag on pallet)" },
    pallet: { palletType: "ISO", palletLengthCm: 100, palletWidthCm: 120, palletHeightCm: 150, palletTareKg: 20, netWeightPerPalletKg: 1000, grossWeightPerPalletKg: 1020, maxStackingLayers: 4, cartonsPerLayer: 10 },
    container: { containerType: "20FT_DRY", palletsPerContainer: 10, maxPayloadKg: 22000, maxVolumeCbm: 33, netWeightKg: 10000, grossWeightKg: 10200 },
  },
  frozen_vegetables: {
    sku: { productCode: "FV-IQF-001", productName: "Frozen Mixed Vegetables IQF", hsCode: "0710.90", unitType: "BAG" },
    bag: { weightPerBagKg: 1.0, bagType: "Polybag (1kg)", bagsPerCarton: 10, tarePerBagKg: 0.008 },
    carton: { netWeightPerCartonKg: 10.0, grossWeightPerCartonKg: 10.3, tarePerCartonKg: 0.3, cartonLengthCm: 45, cartonWidthCm: 35, cartonHeightCm: 20, cartonsPerPallet: 80, cartonType: "Corrugated 5-ply" },
    pallet: { palletType: "EUR", palletLengthCm: 120, palletWidthCm: 80, palletHeightCm: 180, palletTareKg: 25, netWeightPerPalletKg: 800, grossWeightPerPalletKg: 825, maxStackingLayers: 8, cartonsPerLayer: 10 },
    container: { containerType: "40FT_REEFER", palletsPerContainer: 20, maxPayloadKg: 28000, maxVolumeCbm: 58, netWeightKg: 16000, grossWeightKg: 16500 },
  },
  fresh_grapes: {
    sku: { productCode: "GR-FRESH-001", productName: "Fresh Grapes (Crimson)", hsCode: "0806.10", unitType: "BOX" },
    bag: { weightPerBagKg: 0, bagType: "No bag (loose in carton)", bagsPerCarton: 0, tarePerBagKg: 0 },
    carton: { netWeightPerCartonKg: 8.5, grossWeightPerCartonKg: 9.0, tarePerCartonKg: 0.5, cartonLengthCm: 50, cartonWidthCm: 35, cartonHeightCm: 15, cartonsPerPallet: 80, cartonType: "Corrugated vented" },
    pallet: { palletType: "EUR", palletLengthCm: 120, palletWidthCm: 80, palletHeightCm: 160, palletTareKg: 25, netWeightPerPalletKg: 680, grossWeightPerPalletKg: 705, maxStackingLayers: 8, cartonsPerLayer: 10 },
    container: { containerType: "40FT_REEFER", palletsPerContainer: 20, maxPayloadKg: 28000, maxVolumeCbm: 58, netWeightKg: 13600, grossWeightKg: 14100 },
  },
};

// ============ Calculation Functions ============

export function calculatePackaging(
  totalNetWeightKg: number,
  packaging: PackagingHierarchy,
): PackagingCalculation {
  try {
    const totalBags = packaging.bag.weightPerBagKg > 0
      ? Math.ceil(totalNetWeightKg / packaging.bag.weightPerBagKg)
      : 0;

    const bagsPerCarton = packaging.bag.bagsPerCarton || 1;
    const totalCartons = packaging.bag.weightPerBagKg > 0
      ? Math.ceil(totalBags / bagsPerCarton)
      : Math.ceil(totalNetWeightKg / packaging.carton.netWeightPerCartonKg);

    const cartonsPerPallet = packaging.carton.cartonsPerPallet || 1;
    const totalPallets = Math.ceil(totalCartons / cartonsPerPallet);

    const palletsPerContainer = packaging.container.palletsPerContainer || 1;
    const totalContainers = Math.ceil(totalPallets / palletsPerContainer);

    const totalTareKg =
      (totalBags * packaging.bag.tarePerBagKg) +
      (totalCartons * packaging.carton.tarePerCartonKg) +
      (totalPallets * packaging.pallet.palletTareKg);
    const totalGrossWeightKg = totalNetWeightKg + totalTareKg;

    const cartonVolumeCbm =
      (packaging.carton.cartonLengthCm * packaging.carton.cartonWidthCm * packaging.carton.cartonHeightCm) / 1_000_000;
    const totalVolumeCbm = cartonVolumeCbm * totalCartons;

    const containerVolumeCbm = packaging.container.maxVolumeCbm || 33;
    const containerPayloadKg = packaging.container.maxPayloadKg || 22000;
    const containerUtilizationPct = Math.round((totalVolumeCbm / (totalContainers * containerVolumeCbm)) * 100);
    const weightUtilizationPct = Math.round((totalGrossWeightKg / (totalContainers * containerPayloadKg)) * 100);

    return {
      totalBags,
      totalCartons,
      totalPallets,
      totalContainers,
      totalNetWeightKg: Math.round(totalNetWeightKg * 100) / 100,
      totalGrossWeightKg: Math.round(totalGrossWeightKg * 100) / 100,
      totalTareKg: Math.round(totalTareKg * 100) / 100,
      totalVolumeCbm: Math.round(totalVolumeCbm * 100) / 100,
      totalCartonAreaM2: 0,
      containerUtilizationPct: Math.min(containerUtilizationPct, 100),
      weightUtilizationPct: Math.min(weightUtilizationPct, 100),
    };
  } catch (err: any) {
    logger.error("[packaging] calculatePackaging failed", { error: err?.message });
    return {
      totalBags: 0, totalCartons: 0, totalPallets: 0, totalContainers: 0,
      totalNetWeightKg: 0, totalGrossWeightKg: 0, totalTareKg: 0,
      totalVolumeCbm: 0, totalCartonAreaM2: 0,
      containerUtilizationPct: 0, weightUtilizationPct: 0,
    };
  }
}

export function getPackagingDefaults(commodity: string): PackagingHierarchy | null {
  const key = commodity.toLowerCase().replace(/\s+/g, "_");
  if (COMMODITY_PACKAGING_DEFAULTS[key]) return COMMODITY_PACKAGING_DEFAULTS[key];
  for (const [k, v] of Object.entries(COMMODITY_PACKAGING_DEFAULTS)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  if (key.includes("strawberr") || key.includes("berry")) return COMMODITY_PACKAGING_DEFAULTS.frozen_strawberries;
  if (key.includes("orange") || key.includes("citrus")) return COMMODITY_PACKAGING_DEFAULTS.fresh_oranges;
  if (key.includes("rice") || key.includes("grain")) return COMMODITY_PACKAGING_DEFAULTS.bulk_rice;
  if (key.includes("vegetable") || key.includes("pea") || key.includes("corn")) return COMMODITY_PACKAGING_DEFAULTS.frozen_vegetables;
  if (key.includes("grape")) return COMMODITY_PACKAGING_DEFAULTS.fresh_grapes;
  return COMMODITY_PACKAGING_DEFAULTS.frozen_strawberries;
}

export function formatPackagingSummary(packaging: PackagingHierarchy, calc: PackagingCalculation): string {
  const parts: string[] = [];
  if (calc.totalBags > 0) {
    parts.push(`${calc.totalBags.toLocaleString()} bags × ${packaging.bag.weightPerBagKg}kg`);
  }
  parts.push(`${calc.totalCartons.toLocaleString()} cartons × ${packaging.carton.netWeightPerCartonKg}kg net`);
  parts.push(`${calc.totalPallets} pallets × ${packaging.pallet.netWeightPerPalletKg}kg net`);
  parts.push(`${calc.totalContainers} × ${packaging.container.containerType.replace(/_/g, " ")}`);
  return parts.join(" → ");
}
