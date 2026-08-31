"use client";

// SGTX State-of-Art Packaging Screen
// ============================================================================
// Real-world packaging hierarchy: SKU → Bag → Carton → Pallet → Container
// Shows the full packing breakdown for a trade, including:
//   - 400g bags with bags-per-carton calculation
//   - Carton dimensions and weight (net/gross/tare)
//   - Pallet configuration (EUR/ISO/CHEP, layers, cartons per layer)
//   - Container utilization (volume + weight)
//   - Auto-calculation from total net weight
// ============================================================================

import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionHeader } from "@/components/sgtx/widgets";
import { toast } from "sonner";
import {
  Package, Box, Layers, Container as ContainerIcon, Scale,
  Calculator, Lock, CheckCircle2, AlertCircle, Loader2,
  TrendingUp, Ruler, Weight, PackageCheck,
} from "lucide-react";
import {
  COMMODITY_PACKAGING_DEFAULTS,
  calculatePackaging,
  getPackagingDefaults,
  formatPackagingSummary,
  type PackagingHierarchy,
  type PackagingCalculation,
} from "@/lib/sgtx/packaging";

interface PackagingScreenProps {
  tradeId?: string;
  ustn?: string;
  commodity?: string;
  totalNetWeightKg?: number;
  onSave?: (packaging: PackagingHierarchy, calc: PackagingCalculation) => void;
  locked?: boolean;
}

export function PackagingScreen({
  tradeId,
  ustn,
  commodity: initialCommodity = "Frozen Strawberries IQF",
  totalNetWeightKg: initialWeight = 4800,
  onSave,
  locked: initialLocked = false,
}: PackagingScreenProps) {
  const [commodity, setCommodity] = useState(initialCommodity);
  const [totalNetWeightKg, setTotalNetWeightKg] = useState(initialWeight);
  const [packaging, setPackaging] = useState<PackagingHierarchy | null>(null);
  const [locked, setLocked] = useState(initialLocked);

  // Auto-load packaging defaults when commodity changes
  useEffect(() => {
    const defaults = getPackagingDefaults(commodity);
    if (defaults) {
      // Use setTimeout to avoid cascading renders
      const timer = setTimeout(() => setPackaging(defaults), 0);
      return () => clearTimeout(timer);
    }
  }, [commodity]);

  // Calculate the full hierarchy
  const calc = useMemo<PackagingCalculation | null>(() => {
    if (!packaging) return null;
    return calculatePackaging(totalNetWeightKg, packaging);
  }, [packaging, totalNetWeightKg]);

  // Handle manual packaging edits
  const updateBag = (field: string, value: any) => {
    if (!packaging || locked) return;
    setPackaging({
      ...packaging,
      bag: { ...packaging.bag, [field]: value },
    });
  };

  const updateCarton = (field: string, value: any) => {
    if (!packaging || locked) return;
    setPackaging({
      ...packaging,
      carton: { ...packaging.carton, [field]: value },
    });
  };

  const updatePallet = (field: string, value: any) => {
    if (!packaging || locked) return;
    setPackaging({
      ...packaging,
      pallet: { ...packaging.pallet, [field]: value },
    });
  };

  const handleSave = () => {
    if (!packaging || !calc) return;
    setLocked(true);
    onSave?.(packaging, calc);
    toast.success("Packaging plan locked", {
      description: formatPackagingSummary(packaging, calc),
    });
  };

  if (!packaging || !calc) {
    return (
      <Card className="p-6 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="State-of-Art Packaging Plan"
        subtitle="Real-world hierarchy: Bag → Carton → Pallet → Container · auto-calculated from commodity + weight"
      />

      {/* Commodity + Weight selector */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs font-medium mb-1.5 block">Commodity</Label>
            <Select value={commodity} onValueChange={setCommodity} disabled={locked}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(COMMODITY_PACKAGING_DEFAULTS).map(([key, val]) => (
                  <SelectItem key={key} value={val.sku.productName}>
                    {val.sku.productName} ({val.bag.weightPerBagKg > 0 ? `${val.bag.weightPerBagKg}kg bag` : "bulk"})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs font-medium mb-1.5 block">Total Net Weight (kg)</Label>
            <Input
              type="number"
              value={totalNetWeightKg}
              onChange={(e) => setTotalNetWeightKg(Number(e.target.value))}
              disabled={locked}
              className="h-9"
              placeholder="4800"
            />
          </div>
          <div className="flex items-end">
            <Button
              onClick={handleSave}
              disabled={locked}
              className="w-full h-9 bg-gold-gradient text-sovereign"
            >
              {locked ? (
                <><Lock className="w-3.5 h-3.5 mr-1.5" /> Locked</>
              ) : (
                <><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Lock Packaging</>
              )}
            </Button>
          </div>
        </div>
      </Card>

      {/* Summary banner */}
      {calc.totalBags > 0 && (
        <Card className="p-4 bg-gold/5 border-gold/20">
          <div className="flex items-center gap-3">
            <Calculator className="w-5 h-5 text-gold flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-foreground">Packaging Summary</p>
              <p className="text-[0.7rem] text-muted-foreground mt-0.5">
                {formatPackagingSummary(packaging, calc)}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Hierarchy visualization */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Level 1: Bags */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-500/10 border border-blue-500/20">
              <Package className="w-4 h-4 text-blue-500" />
            </div>
            <div>
              <p className="text-xs font-semibold">Bags</p>
              <p className="text-[0.55rem] text-muted-foreground">Primary packaging</p>
            </div>
          </div>
          <div className="space-y-2">
            <div>
              <Label className="text-[0.6rem] text-muted-foreground">Weight per bag</Label>
              <Input
                type="number"
                step="0.001"
                value={packaging.bag.weightPerBagKg}
                onChange={(e) => updateBag("weightPerBagKg", Number(e.target.value))}
                disabled={locked}
                className="h-7 text-xs"
              />
            </div>
            <div>
              <Label className="text-[0.6rem] text-muted-foreground">Bag type</Label>
              <Input
                value={packaging.bag.bagType}
                onChange={(e) => updateBag("bagType", e.target.value)}
                disabled={locked}
                className="h-7 text-xs"
              />
            </div>
            <div>
              <Label className="text-[0.6rem] text-muted-foreground">Bags per carton</Label>
              <Input
                type="number"
                value={packaging.bag.bagsPerCarton}
                onChange={(e) => updateBag("bagsPerCarton", Number(e.target.value))}
                disabled={locked}
                className="h-7 text-xs"
              />
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-border/40">
            <p className="text-[0.55rem] text-muted-foreground uppercase tracking-wider">Total Bags</p>
            <p className="text-xl font-bold text-blue-500">{calc.totalBags.toLocaleString()}</p>
          </div>
        </Card>

        {/* Level 2: Cartons */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-500/10 border border-amber-500/20">
              <Box className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              <p className="text-xs font-semibold">Cartons</p>
              <p className="text-[0.55rem] text-muted-foreground">Secondary packaging</p>
            </div>
          </div>
          <div className="space-y-2">
            <div>
              <Label className="text-[0.6rem] text-muted-foreground">Net weight per carton (kg)</Label>
              <Input
                type="number"
                step="0.1"
                value={packaging.carton.netWeightPerCartonKg}
                onChange={(e) => updateCarton("netWeightPerCartonKg", Number(e.target.value))}
                disabled={locked}
                className="h-7 text-xs"
              />
            </div>
            <div>
              <Label className="text-[0.6rem] text-muted-foreground">Gross weight per carton (kg)</Label>
              <Input
                type="number"
                step="0.1"
                value={packaging.carton.grossWeightPerCartonKg}
                onChange={(e) => updateCarton("grossWeightPerCartonKg", Number(e.target.value))}
                disabled={locked}
                className="h-7 text-xs"
              />
            </div>
            <div>
              <Label className="text-[0.6rem] text-muted-foreground">Carton type</Label>
              <Input
                value={packaging.carton.cartonType}
                onChange={(e) => updateCarton("cartonType", e.target.value)}
                disabled={locked}
                className="h-7 text-xs"
              />
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-border/40">
            <p className="text-[0.55rem] text-muted-foreground uppercase tracking-wider">Total Cartons</p>
            <p className="text-xl font-bold text-amber-500">{calc.totalCartons.toLocaleString()}</p>
          </div>
        </Card>

        {/* Level 3: Pallets */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-purple-500/10 border border-purple-500/20">
              <Layers className="w-4 h-4 text-purple-500" />
            </div>
            <div>
              <p className="text-xs font-semibold">Pallets</p>
              <p className="text-[0.55rem] text-muted-foreground">Tertiary packaging</p>
            </div>
          </div>
          <div className="space-y-2">
            <div>
              <Label className="text-[0.6rem] text-muted-foreground">Pallet type</Label>
              <Select
                value={packaging.pallet.palletType}
                onValueChange={(v) => updatePallet("palletType", v)}
                disabled={locked}
              >
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EUR">EUR (120×80cm)</SelectItem>
                  <SelectItem value="ISO">ISO (100×120cm)</SelectItem>
                  <SelectItem value="CHEP">CHEP (122×102cm)</SelectItem>
                  <SelectItem value="GMA">GMA (122×102cm)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[0.6rem] text-muted-foreground">Cartons per pallet</Label>
              <Input
                type="number"
                value={packaging.carton.cartonsPerPallet}
                onChange={(e) => updateCarton("cartonsPerPallet", Number(e.target.value))}
                disabled={locked}
                className="h-7 text-xs"
              />
            </div>
            <div>
              <Label className="text-[0.6rem] text-muted-foreground">Pallet tare (kg)</Label>
              <Input
                type="number"
                value={packaging.pallet.palletTareKg}
                onChange={(e) => updatePallet("palletTareKg", Number(e.target.value))}
                disabled={locked}
                className="h-7 text-xs"
              />
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-border/40">
            <p className="text-[0.55rem] text-muted-foreground uppercase tracking-wider">Total Pallets</p>
            <p className="text-xl font-bold text-purple-500">{calc.totalPallets}</p>
          </div>
        </Card>

        {/* Level 4: Container */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-emerald-500/10 border border-emerald-500/20">
              <ContainerIcon className="w-4 h-4 text-emerald-500" />
            </div>
            <div>
              <p className="text-xs font-semibold">Container</p>
              <p className="text-[0.55rem] text-muted-foreground">Quaternary packaging</p>
            </div>
          </div>
          <div className="space-y-2">
            <div>
              <Label className="text-[0.6rem] text-muted-foreground">Container type</Label>
              <Badge variant="outline" className="text-[0.6rem] h-5 px-1.5">
                {packaging.container.containerType.replace(/_/g, " ")}
              </Badge>
            </div>
            <div>
              <Label className="text-[0.6rem] text-muted-foreground">Pallets per container</Label>
              <p className="text-sm font-medium">{packaging.container.palletsPerContainer}</p>
            </div>
            <div>
              <Label className="text-[0.6rem] text-muted-foreground">Max payload (kg)</Label>
              <p className="text-sm font-medium">{packaging.container.maxPayloadKg.toLocaleString()}</p>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-border/40">
            <p className="text-[0.55rem] text-muted-foreground uppercase tracking-wider">Total Containers</p>
            <p className="text-xl font-bold text-emerald-500">{calc.totalContainers}</p>
          </div>
        </Card>
      </div>

      {/* Weight & Volume Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Weight className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">Net Weight</p>
          </div>
          <p className="text-lg font-bold">{calc.totalNetWeightKg.toLocaleString()} kg</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Scale className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">Gross Weight</p>
          </div>
          <p className="text-lg font-bold">{calc.totalGrossWeightKg.toLocaleString()} kg</p>
          <p className="text-[0.55rem] text-muted-foreground">+{calc.totalTareKg.toLocaleString()}kg tare</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Ruler className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">Total Volume</p>
          </div>
          <p className="text-lg font-bold">{calc.totalVolumeCbm} CBM</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">Container Utilization</p>
          </div>
          <p className="text-lg font-bold" style={{
            color: calc.containerUtilizationPct > 85 ? "#10b981" : calc.containerUtilizationPct > 60 ? "#f59e0b" : "#ef4444"
          }}>
            {calc.containerUtilizationPct}%
          </p>
          <p className="text-[0.55rem] text-muted-foreground">Weight: {calc.weightUtilizationPct}%</p>
        </Card>
      </div>

      {/* Carton dimensions detail */}
      <Card className="p-4">
        <p className="text-xs font-semibold mb-3 flex items-center gap-2">
          <Ruler className="w-4 h-4 text-muted-foreground" />
          Carton Dimensions & Pallet Configuration
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <Label className="text-[0.6rem] text-muted-foreground">Length (cm)</Label>
            <Input
              type="number"
              value={packaging.carton.cartonLengthCm}
              onChange={(e) => updateCarton("cartonLengthCm", Number(e.target.value))}
              disabled={locked}
              className="h-7"
            />
          </div>
          <div>
            <Label className="text-[0.6rem] text-muted-foreground">Width (cm)</Label>
            <Input
              type="number"
              value={packaging.carton.cartonWidthCm}
              onChange={(e) => updateCarton("cartonWidthCm", Number(e.target.value))}
              disabled={locked}
              className="h-7"
            />
          </div>
          <div>
            <Label className="text-[0.6rem] text-muted-foreground">Height (cm)</Label>
            <Input
              type="number"
              value={packaging.carton.cartonHeightCm}
              onChange={(e) => updateCarton("cartonHeightCm", Number(e.target.value))}
              disabled={locked}
              className="h-7"
            />
          </div>
          <div>
            <Label className="text-[0.6rem] text-muted-foreground">Carton volume (m³)</Label>
            <p className="text-sm font-medium py-1.5">
              {((packaging.carton.cartonLengthCm * packaging.carton.cartonWidthCm * packaging.carton.cartonHeightCm) / 1_000_000).toFixed(3)}
            </p>
          </div>
          <div>
            <Label className="text-[0.6rem] text-muted-foreground">Max stacking layers</Label>
            <Input
              type="number"
              value={packaging.pallet.maxStackingLayers}
              onChange={(e) => updatePallet("maxStackingLayers", Number(e.target.value))}
              disabled={locked}
              className="h-7"
            />
          </div>
          <div>
            <Label className="text-[0.6rem] text-muted-foreground">Cartons per layer</Label>
            <Input
              type="number"
              value={packaging.pallet.cartonsPerLayer}
              onChange={(e) => updatePallet("cartonsPerLayer", Number(e.target.value))}
              disabled={locked}
              className="h-7"
            />
          </div>
          <div>
            <Label className="text-[0.6rem] text-muted-foreground">Pallet L×W (cm)</Label>
            <p className="text-sm font-medium py-1.5">
              {packaging.pallet.palletLengthCm} × {packaging.pallet.palletWidthCm}
            </p>
          </div>
          <div>
            <Label className="text-[0.6rem] text-muted-foreground">Pallet height (cm)</Label>
            <Input
              type="number"
              value={packaging.pallet.palletHeightCm}
              onChange={(e) => updatePallet("palletHeightCm", Number(e.target.value))}
              disabled={locked}
              className="h-7"
            />
          </div>
        </div>
      </Card>

      {/* Hierarchy flow visualization */}
      <Card className="p-4">
        <p className="text-xs font-semibold mb-3 flex items-center gap-2">
          <PackageCheck className="w-4 h-4 text-muted-foreground" />
          Packaging Hierarchy Flow
        </p>
        <div className="flex items-center gap-2 flex-wrap text-xs">
          {/* SKU */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border/50">
            <Package className="w-3.5 h-3.5 text-muted-foreground" />
            <div>
              <p className="font-medium">{packaging.sku.productName}</p>
              <p className="text-[0.55rem] text-muted-foreground">HS: {packaging.sku.hsCode || "—"}</p>
            </div>
          </div>
          <span className="text-muted-foreground">→</span>
          {/* Bags */}
          {calc.totalBags > 0 && (
            <>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/5 border border-blue-500/20">
                <Package className="w-3.5 h-3.5 text-blue-500" />
                <div>
                  <p className="font-medium text-blue-500">{calc.totalBags.toLocaleString()} bags</p>
                  <p className="text-[0.55rem] text-muted-foreground">{packaging.bag.weightPerBagKg}kg each</p>
                </div>
              </div>
              <span className="text-muted-foreground">→</span>
            </>
          )}
          {/* Cartons */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
            <Box className="w-3.5 h-3.5 text-amber-500" />
            <div>
              <p className="font-medium text-amber-500">{calc.totalCartons.toLocaleString()} cartons</p>
              <p className="text-[0.55rem] text-muted-foreground">{packaging.carton.netWeightPerCartonKg}kg net each</p>
            </div>
          </div>
          <span className="text-muted-foreground">→</span>
          {/* Pallets */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/5 border border-purple-500/20">
            <Layers className="w-3.5 h-3.5 text-purple-500" />
            <div>
              <p className="font-medium text-purple-500">{calc.totalPallets} pallets</p>
              <p className="text-[0.55rem] text-muted-foreground">{packaging.pallet.netWeightPerPalletKg}kg each ({packaging.pallet.palletType})</p>
            </div>
          </div>
          <span className="text-muted-foreground">→</span>
          {/* Container */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
            <ContainerIcon className="w-3.5 h-3.5 text-emerald-500" />
            <div>
              <p className="font-medium text-emerald-500">{calc.totalContainers} × {packaging.container.containerType.replace(/_/g, " ")}</p>
              <p className="text-[0.55rem] text-muted-foreground">{calc.totalNetWeightKg.toLocaleString()}kg net total</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
