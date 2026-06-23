// SGTX Part 5.1 — Weight Calculation Engine
export interface CommodityWeightInput { product: string; hsCode: string; pallets: number; netWeightPerUnit: number; grossWeightPerUnit: number; cartonsPerPallet: number; requestedQuantity?: number; quantityTolerance?: number; }
export interface ContainerWeightInput { transportMode: string; containerSize: string; commodities: CommodityWeightInput[]; }
export interface TradeWeightInput { containers: ContainerWeightInput[]; palletTareKg?: number; }

const PACKAGING_TARE: Record<string, number> = { "Cartons (12.5 kg)": 0.7, "Cartons (10 kg)": 0.5, "Cartons (18 kg)": 0.8, "Boxes (5 kg)": 0.3, "Mesh bags (15 kg)": 0.2, "Plastic crates": 1.5, "Drums": 2.0, "Barrels": 3.0, "Bales": 1.0, "Bins": 2.5, "Carton bags": 0.6, "Jumbo bags": 5.0 };
const CONTAINER_LIMITS: Record<string, number> = { "40FT_STANDARD": 26500, "40FT_HC": 26500, "40FT_REEFER": 27500, "20FT_STANDARD": 21770, "20FT_REEFER": 21770, "OPEN_TOP": 26000, "FLAT_RACK": 25000, "TANK": 24000, "ULD": 5000, "PALLET": 2000, "BOX_WAGON": 28000, "FLAT_WAGON": 30000, "TANK_WAGON": 25000, "DRY_VAN": 22000, "FLATBED": 24000, "CURTAIN_SIDE": 23000, "REEFER_WAGON": 27000 };

export function getContainerLimit(size: string): number { const n = size.toUpperCase().replace(/\s/g, "_"); return CONTAINER_LIMITS[n] || CONTAINER_LIMITS[`${n}_STANDARD`] || 26000; }

export function calculateCommodityWeight(input: CommodityWeightInput, palletTareKg: number = 25) {
  const totalCartons = input.pallets * input.cartonsPerPallet;
  const netWeightKg = totalCartons * input.netWeightPerUnit;
  const packagingTareKg = (input.grossWeightPerUnit - input.netWeightPerUnit) * totalCartons;
  const palletTareTotal = input.pallets * palletTareKg;
  const grossWeightKg = netWeightKg + packagingTareKg + palletTareTotal;
  const tolerance = input.quantityTolerance ?? 5;
  let isWithinTolerance = true;
  let minQty: number | undefined, maxQty: number | undefined;
  if (input.requestedQuantity) { minQty = input.requestedQuantity * (1 - tolerance / 100); maxQty = input.requestedQuantity * (1 + tolerance / 100); isWithinTolerance = netWeightKg >= minQty && netWeightKg <= maxQty; }
  const errors: string[] = [];
  if (input.pallets <= 0) errors.push("Pallet count must be > 0");
  if (input.netWeightPerUnit <= 0) errors.push("Net weight per unit must be > 0");
  if (input.grossWeightPerUnit < input.netWeightPerUnit) errors.push("Gross < Net");
  return { product: input.product, hsCode: input.hsCode, totalCartons, totalPallets: input.pallets, netWeightKg: Math.round(netWeightKg * 100) / 100, grossWeightKg: Math.round(grossWeightKg * 100) / 100, packagingTareKg: Math.round(packagingTareKg * 100) / 100, palletTareKg: Math.round(palletTareTotal * 100) / 100, isWithinTolerance, minAcceptableQuantity: minQty, maxAcceptableQuantity: maxQty, validationErrors: errors };
}

export function calculateTradeWeight(input: TradeWeightInput) {
  const palletTare = input.palletTareKg ?? 25;
  let totalNet = 0, totalGross = 0, totalPallets = 0, totalCartons = 0;
  const containers = input.containers.map((c, ci) => {
    const commodities = c.commodities.map(com => calculateCommodityWeight(com, palletTare));
    const cNet = commodities.reduce((s, x) => s + x.netWeightKg, 0);
    const cGross = commodities.reduce((s, x) => s + x.grossWeightKg, 0);
    const cPallets = commodities.reduce((s, x) => s + x.totalPallets, 0);
    const cCartons = commodities.reduce((s, x) => s + x.totalCartons, 0);
    const maxPayload = getContainerLimit(c.containerSize);
    totalNet += cNet; totalGross += cGross; totalPallets += cPallets; totalCartons += cCartons;
    return { containerIndex: ci, commodities, totalNetKg: cNet, totalGrossKg: cGross, totalPallets: cPallets, totalCartons: cCartons, maxPayloadKg: maxPayload, isWithinCapacity: cGross <= maxPayload, capacityUtilizationPct: Math.round((cGross / maxPayload) * 10000) / 100 };
  });
  const errors = containers.filter(c => !c.isWithinCapacity).map(c => `Container ${c.containerIndex + 1}: gross ${c.totalGrossKg} kg exceeds max ${c.maxPayloadKg} kg`);
  return { containers, totalNetKg: Math.round(totalNet * 100) / 100, totalGrossKg: Math.round(totalGross * 100) / 100, totalPallets, totalCartons, isValid: errors.length === 0, validationErrors: errors };
}
