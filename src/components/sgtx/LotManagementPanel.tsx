"use client";

// =============================================================================
// SGTX — Lot Management Panel
// =============================================================================
// Trader (Seller) + LSP portal panel that manages the container → lots →
// pallets hierarchy for a trade.
//
// Features:
//   • Lists all lots for a trade (GET /api/sgtx/lots?tradeId= or ?ustn=).
//     For each lot: number, commodity, origin country, production/expiry
//     dates, quantity, weight, status badge, pallet count.
//   • Container → lots → pallets hierarchy view (collapsible). Fetches
//     /api/sgtx/containers/[id]/lots for each container on the trade.
//   • "Create Lot" dialog (POST /api/sgtx/lots) with full lot metadata.
//   • "Assign Pallets to Lot" dialog: select lot + pallets (checkboxes),
//     POSTs to /api/sgtx/lots/[id]/pallets or /api/sgtx/lots/bulk-assign.
//   • Lot status management: quarantine / release / reject buttons
//     (PATCH /api/sgtx/lots/[id] with { status }).
//   • Lot summary view: total pallets, cartons, weight per lot.
//
// Status colors: ACTIVE=green, QUARANTINED=amber, REJECTED=red, RELEASED=blue.
// =============================================================================

import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Boxes,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Layers,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Tag,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtDate, fmtKg } from "@/lib/sgtx/format";

const REQUEST_TIMEOUT_MS = 15_000;

// -----------------------------------------------------------------------------
// Types — narrow mirrors of the Prisma Lot + PalletDetail rows.
// -----------------------------------------------------------------------------

type LotStatus = "ACTIVE" | "QUARANTINED" | "REJECTED" | "RELEASED";

interface LotRow {
  id: string;
  lotNumber: string;
  ustn: string;
  tradeId: string;
  shipmentId: string | null;
  containerId: string | null;
  commodity: string;
  commodityHs: string | null;
  originCountry: string;
  productionDate: string | null;
  expiryDate: string | null;
  bestBeforeDate: string | null;
  batchNumber: string | null;
  harvestDate: string | null;
  packDate: string | null;
  supplierGtid: string | null;
  supplierLotRef: string | null;
  quantityUnits: number;
  netWeightKg: number;
  grossWeightKg: number;
  coldStorageTemp: number | null;
  treatmentStatus: string | null;
  organicCertified: boolean;
  gmoStatus: string | null;
  allergenInfo: string | null;
  countryOfOrigin: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  pallets?: PalletRow[];
}

interface PalletRow {
  id: string;
  sscc: string;
  palletId: string | null;
  totalCartons: number | null;
  netWeightKg: number | null;
  grossWeightKg: number | null;
  loaded: boolean;
  lotNumber?: string | null;
  lotId?: string | null;
}

interface ContainerLotEntry {
  lot: {
    id: string;
    lotNumber: string;
    commodity: string;
    originCountry: string;
    status: string;
  };
  containerId: string | null;
  shipmentId: string | null;
  pallets: PalletRow[];
}

interface TradeContainerSummary {
  id: string;
  sequence: number;
  containerSize: string | null;
  commodities: string;
}

interface LotSummary {
  lotId: string;
  lotNumber: string;
  palletCount: number;
  totalCartons: number;
  netWeightKg: number;
  grossWeightKg: number;
  containerId: string | null;
  shipmentId: string | null;
  pallets: PalletRow[];
}

// -----------------------------------------------------------------------------
// fetchWithTimeout
// -----------------------------------------------------------------------------

async function fetchWithTimeout<T>(url: string, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const json = (await res.json()) as T & { error?: string };
    if (!res.ok) {
      throw new Error(json?.error || `HTTP ${res.status}`);
    }
    return json as T;
  } finally {
    clearTimeout(timer);
  }
}

// -----------------------------------------------------------------------------
// Status badge
// -----------------------------------------------------------------------------

const LOT_STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  QUARANTINED: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  REJECTED: "bg-rose-500/10 text-rose-600 border-rose-500/30",
  RELEASED: "bg-sky-500/10 text-sky-600 border-sky-500/30",
};

function lotStatusBadge(status: string): ReactElement {
  const cls = LOT_STATUS_STYLES[status] || "bg-muted text-muted-foreground border-border";
  return <Badge className={cls}>{status}</Badge>;
}

// -----------------------------------------------------------------------------
// Create Lot Dialog
// -----------------------------------------------------------------------------

function CreateLotDialog({
  ustn,
  open,
  onOpenChange,
  onCreated,
}: {
  ustn: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}): ReactElement {
  const [commodity, setCommodity] = useState("");
  const [commodityHs, setCommodityHs] = useState("");
  const [originCountry, setOriginCountry] = useState("EG");
  const [productionDate, setProductionDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [quantityUnits, setQuantityUnits] = useState("");
  const [netWeightKg, setNetWeightKg] = useState("");
  const [grossWeightKg, setGrossWeightKg] = useState("");
  const [coldStorageTemp, setColdStorageTemp] = useState("");
  const [treatmentStatus, setTreatmentStatus] = useState("none");
  const [organicCertified, setOrganicCertified] = useState(false);
  const [gmoStatus, setGmoStatus] = useState("UNKNOWN");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!commodity || !originCountry) {
      toast.error("Commodity + origin country are required");
      return;
    }
    setSubmitting(true);
    try {
      await fetchWithTimeout("/api/sgtx/lots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ustn,
          commodity,
          commodityHs: commodityHs || undefined,
          originCountry,
          productionDate: productionDate || undefined,
          expiryDate: expiryDate || undefined,
          batchNumber: batchNumber || undefined,
          quantityUnits: quantityUnits ? parseInt(quantityUnits, 10) : undefined,
          netWeightKg: netWeightKg ? parseFloat(netWeightKg) : undefined,
          grossWeightKg: grossWeightKg ? parseFloat(grossWeightKg) : undefined,
          coldStorageTemp: coldStorageTemp ? parseFloat(coldStorageTemp) : undefined,
          treatmentStatus,
          organicCertified,
          gmoStatus,
        }),
      });
      toast.success("Lot created");
      setCommodity(""); setCommodityHs(""); setProductionDate(""); setExpiryDate("");
      setBatchNumber(""); setQuantityUnits(""); setNetWeightKg(""); setGrossWeightKg("");
      setColdStorageTemp(""); setOrganicCertified(false);
      onOpenChange(false);
      onCreated();
    } catch (e) {
      toast.error("Lot creation failed", { description: (e as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-gold" /> Create Lot
          </DialogTitle>
          <DialogDescription>
            Lot number auto-generated as LOT-YYYY-SEQ-ORIGIN3-COMMODITY3.
            USTN <span className="font-mono">{ustn}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-[0.65rem] text-muted-foreground">Commodity *</Label>
            <Input value={commodity} onChange={(e) => setCommodity(e.target.value)} placeholder="e.g. Frozen strawberries" />
          </div>
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">HS Code</Label>
            <Input value={commodityHs} onChange={(e) => setCommodityHs(e.target.value)} placeholder="0811.10.00" />
          </div>
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">Origin Country *</Label>
            <Select value={originCountry} onValueChange={setOriginCountry}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="EG">Egypt</SelectItem>
                <SelectItem value="DE">Germany</SelectItem>
                <SelectItem value="FR">France</SelectItem>
                <SelectItem value="IT">Italy</SelectItem>
                <SelectItem value="ES">Spain</SelectItem>
                <SelectItem value="TR">Türkiye</SelectItem>
                <SelectItem value="US">United States</SelectItem>
                <SelectItem value="CN">China</SelectItem>
                <SelectItem value="IN">India</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">Production Date</Label>
            <Input type="date" value={productionDate} onChange={(e) => setProductionDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">Expiry Date</Label>
            <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">Batch Number</Label>
            <Input value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">Quantity (units)</Label>
            <Input type="number" value={quantityUnits} onChange={(e) => setQuantityUnits(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">Net Weight (kg)</Label>
            <Input type="number" step="0.1" value={netWeightKg} onChange={(e) => setNetWeightKg(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">Gross Weight (kg)</Label>
            <Input type="number" step="0.1" value={grossWeightKg} onChange={(e) => setGrossWeightKg(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">Cold Storage Temp (°C)</Label>
            <Input type="number" step="0.1" value={coldStorageTemp} onChange={(e) => setColdStorageTemp(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">Treatment Status</Label>
            <Select value={treatmentStatus} onValueChange={setTreatmentStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="fumigated">Fumigated</SelectItem>
                <SelectItem value="cold-treated">Cold-treated</SelectItem>
                <SelectItem value="irradiated">Irradiated</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">GMO Status</Label>
            <Select value={gmoStatus} onValueChange={setGmoStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="UNKNOWN">Unknown</SelectItem>
                <SelectItem value="GMO">GMO</SelectItem>
                <SelectItem value="NON-GMO">Non-GMO</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2 pb-1">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox checked={organicCertified} onCheckedChange={(v) => setOrganicCertified(v === true)} />
              Organic certified
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
            Create Lot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Assign Pallets to Lot Dialog
// -----------------------------------------------------------------------------

function AssignPalletsDialog({
  lots,
  pallets,
  open,
  onOpenChange,
  onAssigned,
}: {
  lots: LotRow[];
  pallets: PalletRow[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAssigned: () => void;
}): ReactElement {
  const [selectedLot, setSelectedLot] = useState<string>("");
  const [selectedPallets, setSelectedPallets] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const togglePallet = (id: string) => {
    setSelectedPallets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    if (!selectedLot) {
      toast.error("Select a target lot");
      return;
    }
    if (selectedPallets.size === 0) {
      toast.error("Select at least one pallet");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetchWithTimeout<{ assignedCount: number; skippedCount: number }>(
        `/api/sgtx/lots/${selectedLot}/pallets`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ palletIds: Array.from(selectedPallets) }),
        },
      );
      toast.success(`Assigned ${r.assignedCount} pallet(s)${r.skippedCount > 0 ? ` · ${r.skippedCount} skipped` : ""}`);
      setSelectedLot(""); setSelectedPallets(new Set());
      onOpenChange(false);
      onAssigned();
    } catch (e) {
      toast.error("Assignment failed", { description: (e as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Boxes className="w-5 h-5 text-gold" /> Assign Pallets to Lot
          </DialogTitle>
          <DialogDescription>
            Select a target lot and the pallets to assign. Pallets must belong to the same trade.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">Target Lot *</Label>
            <Select value={selectedLot} onValueChange={setSelectedLot}>
              <SelectTrigger><SelectValue placeholder="Select a lot" /></SelectTrigger>
              <SelectContent>
                {lots.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.lotNumber} — {l.commodity}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[0.65rem] text-muted-foreground mb-1.5 block">
              Pallets ({selectedPallets.size} selected of {pallets.length})
            </Label>
            <div className="max-h-72 overflow-y-auto rounded-lg border border-border/40 divide-y divide-border/30">
              {pallets.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground text-center">No pallets available for this trade.</p>
              ) : (
                pallets.map((p) => (
                  <label key={p.id} className="flex items-center gap-3 p-2 hover:bg-muted/30 cursor-pointer">
                    <Checkbox
                      checked={selectedPallets.has(p.id)}
                      onCheckedChange={() => togglePallet(p.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono truncate">{p.sscc}</p>
                      <p className="text-[0.65rem] text-muted-foreground">
                        {p.totalCartons ?? 0} cartons · {p.netWeightKg != null ? fmtKg(p.netWeightKg) : "—"}
                        {p.loaded && <span className="ml-1.5 text-emerald-600">· loaded</span>}
                      </p>
                    </div>
                    {p.lotId && <Badge variant="outline" className="text-[0.6rem]">has lot</Badge>}
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Boxes className="w-3.5 h-3.5 mr-1.5" />}
            Assign {selectedPallets.size || ""} Pallet{selectedPallets.size === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Lot card
// -----------------------------------------------------------------------------

function LotCard({
  lot,
  onStatusChange,
  onSummary,
}: {
  lot: LotRow;
  onStatusChange: (lot: LotRow, status: LotStatus) => void;
  onSummary: (lot: LotRow) => void;
}): ReactElement {
  const [expanded, setExpanded] = useState(false);
  const palletCount = lot.pallets?.length || 0;

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex flex-wrap items-center gap-3 p-3 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          <Layers className="w-4 h-4 text-gold" />
          <div className="min-w-0">
            <p className="text-sm font-semibold font-mono truncate">{lot.lotNumber}</p>
            <p className="text-[0.65rem] text-muted-foreground truncate">
              {lot.commodity}{lot.commodityHs ? ` · HS ${lot.commodityHs}` : ""} · {lot.originCountry}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {lotStatusBadge(lot.status)}
          <Badge variant="outline" className="text-[0.65rem]"><Boxes className="w-3 h-3" /> {palletCount} pallets</Badge>
          <Badge variant="outline" className="text-[0.65rem]">{lot.quantityUnits} units</Badge>
          {lot.netWeightKg > 0 && <Badge variant="outline" className="text-[0.65rem]">{fmtKg(lot.netWeightKg)}</Badge>}
        </div>
      </button>

      {expanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="border-t border-border/50 p-3 space-y-3"
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">Production</p>
              <p>{lot.productionDate ? fmtDate(lot.productionDate) : "—"}</p>
            </div>
            <div>
              <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">Expiry</p>
              <p>{lot.expiryDate ? fmtDate(lot.expiryDate) : "—"}</p>
            </div>
            <div>
              <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">Batch</p>
              <p>{lot.batchNumber || "—"}</p>
            </div>
            <div>
              <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">Cold Temp</p>
              <p>{lot.coldStorageTemp != null ? `${lot.coldStorageTemp}°C` : "—"}</p>
            </div>
            <div>
              <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">Treatment</p>
              <p>{lot.treatmentStatus || "—"}</p>
            </div>
            <div>
              <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">Organic</p>
              <p>{lot.organicCertified ? "Yes" : "No"}</p>
            </div>
            <div>
              <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">GMO</p>
              <p>{lot.gmoStatus || "—"}</p>
            </div>
            <div>
              <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">Gross Weight</p>
              <p>{lot.grossWeightKg > 0 ? fmtKg(lot.grossWeightKg) : "—"}</p>
            </div>
          </div>

          {lot.notes && (
            <div className="rounded-md bg-muted/20 border border-border/40 p-2 text-xs">
              <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider mb-0.5">Notes</p>
              <p>{lot.notes}</p>
            </div>
          )}

          {/* Pallets table */}
          {palletCount > 0 && (
            <div>
              <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Pallets in this lot ({palletCount})</p>
              <div className="rounded-lg border border-border/40 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[0.65rem] h-7">SSCC</TableHead>
                      <TableHead className="text-[0.65rem] h-7">Cartons</TableHead>
                      <TableHead className="text-[0.65rem] h-7">Net wt</TableHead>
                      <TableHead className="text-[0.65rem] h-7">Loaded</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lot.pallets!.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-[0.7rem] font-mono py-1.5">{p.sscc}</TableCell>
                        <TableCell className="text-[0.7rem] py-1.5">{p.totalCartons ?? "—"}</TableCell>
                        <TableCell className="text-[0.7rem] py-1.5">{p.netWeightKg != null ? fmtKg(p.netWeightKg) : "—"}</TableCell>
                        <TableCell className="py-1.5">
                          {p.loaded ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <span className="text-muted-foreground text-[0.65rem]">—</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Status actions */}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/30">
            <span className="text-[0.65rem] text-muted-foreground uppercase tracking-wider mr-1">Status:</span>
            <Button size="sm" variant="outline" className="h-7 text-[0.65rem]" disabled={lot.status === "QUARANTINED"} onClick={() => onStatusChange(lot, "QUARANTINED")}>
              <AlertTriangle className="w-3 h-3 mr-1" /> Quarantine
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-[0.65rem]" disabled={lot.status === "RELEASED"} onClick={() => onStatusChange(lot, "RELEASED")}>
              <CheckCircle2 className="w-3 h-3 mr-1" /> Release
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-[0.65rem] text-rose-600" disabled={lot.status === "REJECTED"} onClick={() => onStatusChange(lot, "REJECTED")}>
              <AlertTriangle className="w-3 h-3 mr-1" /> Reject
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-[0.65rem]" disabled={lot.status === "ACTIVE"} onClick={() => onStatusChange(lot, "ACTIVE")}>
              <Tag className="w-3 h-3 mr-1" /> Reactivate
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-[0.65rem] ml-auto" onClick={() => onSummary(lot)}>
              View summary
            </Button>
          </div>
        </motion.div>
      )}
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Container → Lots → Pallets hierarchy view
// -----------------------------------------------------------------------------

function ContainerHierarchyView({ containers }: { containers: TradeContainerSummary[] }): ReactElement {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [data, setData] = useState<Record<string, ContainerLotEntry[]>>({});
  const [loading, setLoading] = useState<Set<string>>(new Set());

  const toggle = async (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (!data[id] && !loading.has(id)) {
      setLoading((prev) => new Set(prev).add(id));
      try {
        const r = await fetchWithTimeout<{ lots: ContainerLotEntry[] }>(
          `/api/sgtx/containers/${id}/lots`,
        );
        setData((prev) => ({ ...prev, [id]: r.lots || [] }));
      } catch (e) {
        toast.error("Failed to load container lots", { description: (e as Error).message });
        setData((prev) => ({ ...prev, [id]: [] }));
      } finally {
        setLoading((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    }
  };

  if (containers.length === 0) {
    return (
      <Card className="p-6 text-center">
        <Package className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm font-semibold mb-1">No containers on this trade</p>
        <p className="text-xs text-muted-foreground">Add containers to see the lot hierarchy.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {containers.map((c) => {
        const isOpen = expanded.has(c.id);
        const lots = data[c.id] || [];
        return (
          <Card key={c.id} className="overflow-hidden">
            <button
              type="button"
              onClick={() => void toggle(c.id)}
              className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/30 transition-colors"
            >
              {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              <Package className="w-4 h-4 text-gold" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">
                  Container #{c.sequence}
                  {c.containerSize && <span className="text-muted-foreground font-normal ml-1.5">· {c.containerSize}</span>}
                </p>
                <p className="text-[0.65rem] text-muted-foreground truncate">{c.commodities}</p>
              </div>
              {loading.has(c.id) ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
              ) : (
                <Badge variant="outline" className="text-[0.65rem]">{lots.length} lots</Badge>
              )}
            </button>
            {isOpen && (
              <div className="border-t border-border/50 p-3 space-y-2">
                {lots.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">No lots assigned to this container.</p>
                ) : (
                  lots.map((entry, i) => (
                    <div key={i} className="rounded-lg border border-border/40 p-2">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Layers className="w-3.5 h-3.5 text-gold" />
                        <span className="text-xs font-mono font-semibold">{entry.lot.lotNumber}</span>
                        {lotStatusBadge(entry.lot.status)}
                        <Badge variant="outline" className="text-[0.6rem]">{entry.pallets.length} pallets</Badge>
                        <span className="text-[0.65rem] text-muted-foreground ml-auto">{entry.lot.commodity} · {entry.lot.originCountry}</span>
                      </div>
                      {entry.pallets.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {entry.pallets.map((p) => (
                            <div key={p.id} className="flex items-center gap-2 text-[0.7rem] bg-muted/20 rounded px-2 py-1">
                              <span className="font-mono">{p.sscc}</span>
                              <span className="text-muted-foreground ml-auto">{p.totalCartons ?? 0} ctn</span>
                              {p.loaded && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Lot summary dialog
// -----------------------------------------------------------------------------

function LotSummaryContent({ lot }: { lot: LotRow }): ReactElement {
  // The initial loading=true state is fresh per remount (the parent passes
  // `key={lot.id}` so each lot change gets a new component instance). The
  // effect only mutates state in async callbacks — no synchronous setState
  // in the effect body (avoids the react-hooks/set-state-in-effect rule).
  const [summary, setSummary] = useState<LotSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchWithTimeout<LotSummary>(`/api/sgtx/lots/${lot.id}/summary`)
      .then((r) => {
        if (!cancelled) setSummary(r);
      })
      .catch((e) => {
        if (!cancelled) toast.error("Failed to load summary", { description: (e as Error).message });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lot.id]);

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (!summary) {
    return <p className="text-xs text-muted-foreground">No summary available.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-2">
          <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">Pallets</p>
          <p className="text-lg font-bold">{summary.palletCount}</p>
        </Card>
        <Card className="p-2">
          <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">Cartons</p>
          <p className="text-lg font-bold">{summary.totalCartons}</p>
        </Card>
        <Card className="p-2">
          <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">Net wt</p>
          <p className="text-lg font-bold">{fmtKg(summary.netWeightKg)}</p>
        </Card>
        <Card className="p-2">
          <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">Gross wt</p>
          <p className="text-lg font-bold">{fmtKg(summary.grossWeightKg)}</p>
        </Card>
      </div>
      {summary.containerId && (
        <p className="text-xs text-muted-foreground">Container: <span className="font-mono">{summary.containerId}</span></p>
      )}
      {summary.shipmentId && (
        <p className="text-xs text-muted-foreground">Shipment: <span className="font-mono">{summary.shipmentId}</span></p>
      )}
    </div>
  );
}

function LotSummaryDialog({
  lot,
  open,
  onOpenChange,
}: {
  lot: LotRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}): ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-gold" /> Lot Summary
          </DialogTitle>
          <DialogDescription>
            {lot && <span className="font-mono">{lot.lotNumber}</span>}
          </DialogDescription>
        </DialogHeader>
        {lot ? <LotSummaryContent key={lot.id} lot={lot} /> : <p className="text-xs text-muted-foreground">No lot selected.</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Main panel
// -----------------------------------------------------------------------------

export function LotManagementPanel({ tradeId, ustn }: { tradeId?: string; ustn?: string }): ReactElement {
  const [lots, setLots] = useState<LotRow[]>([]);
  const [containers, setContainers] = useState<TradeContainerSummary[]>([]);
  const [pallets, setPallets] = useState<PalletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [summaryLot, setSummaryLot] = useState<LotRow | null>(null);

  const effectiveUstn = ustn || "";

  const refresh = useCallback(async () => {
    if (!effectiveUstn) {
      setError("No USTN provided. Open a trade first.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [tradeResp, lotsResp] = await Promise.all([
        fetchWithTimeout<{ id: string; ustn: string; containers: TradeContainerSummary[] }>(
          `/api/sgtx/trade?ustn=${encodeURIComponent(effectiveUstn)}`,
        ).catch(() => null),
        fetchWithTimeout<{ lots: LotRow[] }>(
          `/api/sgtx/lots?ustn=${encodeURIComponent(effectiveUstn)}`,
        ).catch((e) => {
          throw e;
        }),
      ]);
      const resolvedTradeId = tradeResp?.id || tradeId;
      setLots(lotsResp.lots || []);
      setContainers(tradeResp?.containers || []);

      // Fetch pallets for the trade (used by the assign dialog). We piggy-back
      // on the lots' pallets if available — no separate pallets endpoint
      // exists in the new lots API surface; the assign dialog accepts the
      // whole trade's pallet list as candidates.
      const allPallets: PalletRow[] = [];
      for (const l of lotsResp.lots || []) {
        if (Array.isArray(l.pallets)) {
          for (const p of l.pallets) allPallets.push(p);
        }
      }
      setPallets(allPallets);
      void resolvedTradeId;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [effectiveUstn, tradeId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleStatusChange = async (lot: LotRow, status: LotStatus) => {
    try {
      await fetchWithTimeout(`/api/sgtx/lots/${lot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      toast.success(`Lot ${lot.lotNumber} → ${status}`);
      void refresh();
    } catch (e) {
      toast.error("Status change failed", { description: (e as Error).message });
    }
  };

  const stats = useMemo(() => {
    const total = lots.length;
    const active = lots.filter((l) => l.status === "ACTIVE").length;
    const quarantined = lots.filter((l) => l.status === "QUARANTINED").length;
    const rejected = lots.filter((l) => l.status === "REJECTED").length;
    const palletCount = lots.reduce((s, l) => s + (l.pallets?.length || 0), 0);
    return { total, active, quarantined, rejected, palletCount };
  }, [lots]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-6 text-center">
        <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
        <p className="text-sm font-semibold mb-1">Unable to load lots</p>
        <p className="text-xs text-muted-foreground mb-4">{error}</p>
        <Button size="sm" variant="outline" onClick={() => void refresh()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Layers className="w-5 h-5 text-gold" /> Lot Management
          </h2>
          <p className="text-xs text-muted-foreground">
            Container → lots → pallets · USTN <span className="font-mono">{effectiveUstn}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void refresh()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)} disabled={lots.length === 0 || pallets.length === 0}>
            <Boxes className="w-3.5 h-3.5 mr-1.5" /> Assign Pallets
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Create Lot
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2 text-[0.65rem] text-muted-foreground uppercase tracking-wider"><Layers className="w-3 h-3" /> Total Lots</div>
          <p className="text-xl font-bold mt-1">{stats.total}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-[0.65rem] text-muted-foreground uppercase tracking-wider"><CheckCircle2 className="w-3 h-3" /> Active</div>
          <p className="text-xl font-bold mt-1 text-emerald-600">{stats.active}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-[0.65rem] text-muted-foreground uppercase tracking-wider"><AlertTriangle className="w-3 h-3" /> Quarantined</div>
          <p className={`text-xl font-bold mt-1 ${stats.quarantined > 0 ? "text-amber-600" : ""}`}>{stats.quarantined}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-[0.65rem] text-muted-foreground uppercase tracking-wider"><Boxes className="w-3 h-3" /> Total Pallets</div>
          <p className="text-xl font-bold mt-1">{stats.palletCount}</p>
        </Card>
      </div>

      <Tabs defaultValue="lots">
        <TabsList>
          <TabsTrigger value="lots"><Layers className="w-3.5 h-3.5 mr-1.5" /> Lots ({lots.length})</TabsTrigger>
          <TabsTrigger value="hierarchy"><Package className="w-3.5 h-3.5 mr-1.5" /> Container Hierarchy</TabsTrigger>
        </TabsList>

        <TabsContent value="lots" className="mt-3">
          {lots.length === 0 ? (
            <Card className="p-8 text-center">
              <Layers className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm font-semibold mb-1">No lots created for this trade</p>
              <p className="text-xs text-muted-foreground mb-4">Create your first lot to start tracking pallets and inventory.</p>
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Create Lot
              </Button>
            </Card>
          ) : (
            <div className="space-y-2">
              {lots.map((l) => (
                <LotCard
                  key={l.id}
                  lot={l}
                  onStatusChange={handleStatusChange}
                  onSummary={(lot) => setSummaryLot(lot)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="hierarchy" className="mt-3">
          <ContainerHierarchyView containers={containers} />
        </TabsContent>
      </Tabs>

      <CreateLotDialog ustn={effectiveUstn} open={createOpen} onOpenChange={setCreateOpen} onCreated={() => void refresh()} />
      <AssignPalletsDialog
        lots={lots}
        pallets={pallets}
        open={assignOpen}
        onOpenChange={setAssignOpen}
        onAssigned={() => void refresh()}
      />
      <LotSummaryDialog
        lot={summaryLot}
        open={!!summaryLot}
        onOpenChange={(v) => { if (!v) setSummaryLot(null); }}
      />
    </div>
  );
}
