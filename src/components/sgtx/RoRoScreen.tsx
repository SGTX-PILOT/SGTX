"use client";

// ════════════════════════════════════════════════════════════════════════════
// RoRoScreen — SGTX Articles 55-86 RoRo & ROLLING CARGO ENGINE portal surface.
//
// Two-pane view:
//   • Top   — list of RoRo shipments (with unit count + total weight) +
//             a "Create shipment" dialog (USTN, origin/destination port, units).
//   • Drill — selected shipment detail showing:
//       - shipment header (origin → destination, transit ports, incoterm)
//       - units (VIN-level table with unit type / make / model / status / yard)
//       - voyages list + bookings on the voyage
//       - bills of lading (B/L type + VIN list)
//       - Egypt RoRo adapter status (Nafeza applicability, UCR, shipping-agent msgs)
//       - per-unit drill: state machine visualization (19 states, current
//         highlighted), inspection history with damage comparison
//         (AI POSSIBLE_DAMAGE vs human CONFIRMED_DAMAGE), yard position,
//         gate events.
//
// Defensive everywhere — all API responses are normalised. The component works
// against an empty backend (missing Turso tables) and surfaces clean error /
// empty states instead of crashing. Uses TanStack Query for fetching +
// invalidation on mutations.
//
// Companion to /api/sgtx/roro/* (11 routes) and src/lib/sgtx/roro.
// ════════════════════════════════════════════════════════════════════════════

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { SectionHeader } from "@/components/sgtx/widgets";
import { toast } from "sonner";
import {
  Ship, Plus, Loader2, AlertTriangle, ArrowLeft, ChevronRight,
  Truck, FileText, MapPin, Anchor, Warehouse, ClipboardCheck, Globe2,
} from "lucide-react";

// ─── Constants (mirrored from src/lib/sgtx/roro) ─────────────────────────────

const UNIT_STATUSES = [
  "BOOKED", "DOCUMENTS_PENDING", "CUSTOMS_PENDING", "READY_FOR_GATE",
  "GATE_IN", "INSPECTION_PENDING", "INSPECTED", "YARD", "READY_FOR_LOAD",
  "LOADED", "AT_SEA", "TRANSSHIPMENT", "DISCHARGED", "DESTINATION_YARD",
  "CUSTOMS_HOLD", "CUSTOMS_RELEASED", "DELIVERY_ORDER", "READY_FOR_GATE_OUT",
  "GATE_OUT", "DELIVERED", "ACCEPTED",
];

const UNIT_TYPE_OPTIONS = [
  "VEHICLE", "TRUCK", "TRACTOR", "TRAILER", "BUS",
  "MOTORCYCLE", "MACHINERY", "NON_RUNNING",
];

const INSPECTION_TYPE_OPTIONS = ["PRE_LOAD", "POST_DISCHARGE", "CLAIM"];
const GATE_EVENT_TYPES = ["GATE_IN", "GATE_OUT"];
const GATE_TYPES = ["ORIGIN", "DESTINATION"];
const BL_TYPE_OPTIONS = ["MASTER", "HOUSE"];
const SHIPMENT_STATUSES = ["BOOKED", "IN_TRANSIT", "DISCHARGED", "DELIVERED", "CLOSED", "CANCELLED"];

// Status colour bands (matches the rest of the SGTX design system).
const STATUS_BANDS: Record<string, string> = {
  BOOKED: "bg-slate-100 text-slate-700",
  DOCUMENTS_PENDING: "bg-amber-100 text-amber-700",
  CUSTOMS_PENDING: "bg-amber-100 text-amber-700",
  READY_FOR_GATE: "bg-sky-100 text-sky-700",
  GATE_IN: "bg-sky-100 text-sky-700",
  INSPECTION_PENDING: "bg-amber-100 text-amber-700",
  INSPECTED: "bg-emerald-100 text-emerald-700",
  YARD: "bg-slate-100 text-slate-700",
  READY_FOR_LOAD: "bg-sky-100 text-sky-700",
  LOADED: "bg-indigo-100 text-indigo-700",
  AT_SEA: "bg-indigo-100 text-indigo-700",
  TRANSSHIPMENT: "bg-violet-100 text-violet-700",
  DISCHARGED: "bg-emerald-100 text-emerald-700",
  DESTINATION_YARD: "bg-slate-100 text-slate-700",
  CUSTOMS_HOLD: "bg-rose-100 text-rose-700",
  CUSTOMS_RELEASED: "bg-emerald-100 text-emerald-700",
  DELIVERY_ORDER: "bg-amber-100 text-amber-700",
  READY_FOR_GATE_OUT: "bg-sky-100 text-sky-700",
  GATE_OUT: "bg-sky-100 text-sky-700",
  DELIVERED: "bg-emerald-100 text-emerald-700",
  ACCEPTED: "bg-emerald-200 text-emerald-800",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeArray(j: any, ...keys: string[]): any[] {
  if (!j) return [];
  if (Array.isArray(j)) return j;
  if (typeof j !== "object") return [];
  if (j.error) return [];
  for (const k of keys) {
    if (Array.isArray(j[k])) return j[k];
  }
  if (Array.isArray(j.rows)) return j.rows;
  if (Array.isArray(j.data)) return j.data;
  return [];
}

function fmtDate(v: any): string {
  if (!v) return "—";
  try {
    const d = typeof v === "string" ? new Date(v) : v instanceof Date ? v : null;
    if (!d || isNaN(d.getTime())) return String(v);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(v);
  }
}

function fmtKg(n: any): string {
  const v = Number(n);
  if (!isFinite(v)) return "—";
  return `${v.toLocaleString()} kg`;
}

function statusBand(status: string): string {
  return STATUS_BANDS[status] || "bg-slate-100 text-slate-600";
}

function safeJsonArr(v: any): any[] {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

function safeJsonObj(v: any): Record<string, any> | null {
  if (!v) return null;
  if (typeof v === "object") return v;
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v);
      return typeof p === "object" && p !== null ? p : null;
    } catch {
      return null;
    }
  }
  return null;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function RoRoScreen({ data: _data }: { data?: any }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ustnFilter, setUstnFilter] = useState<string>("");
  const [showCreateShipment, setShowCreateShipment] = useState<boolean>(false);

  if (selectedId) {
    return (
      <RoRoShipmentDetail
        shipmentId={selectedId}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <SectionHeader
        title="RoRo & Rolling Cargo"
        subtitle="Vessels · VIN-level units · voyages · yard · gate · inspection · Egypt Nafeza adapter"
        action={
          <div className="flex items-center gap-2">
            <Input
              placeholder="Filter by USTN"
              value={ustnFilter}
              onChange={(e) => setUstnFilter(e.target.value)}
              className="w-48"
            />
            <Button size="sm" onClick={() => setShowCreateShipment(true)}>
              <Plus className="h-4 w-4 mr-1" /> New Shipment
            </Button>
          </div>
        }
      />
      <RoRoShipmentList
        ustnFilter={ustnFilter}
        onSelect={(id) => setSelectedId(id)}
      />
      {showCreateShipment && (
        <CreateShipmentDialog
          onClose={() => setShowCreateShipment(false)}
        />
      )}
    </div>
  );
}

// ─── Shipment list ────────────────────────────────────────────────────────────

function RoRoShipmentList({
  ustnFilter,
  onSelect,
}: {
  ustnFilter: string;
  onSelect: (id: string) => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["roro-shipments", ustnFilter],
    queryFn: async () => {
      const url = ustnFilter
        ? `/api/sgtx/roro?ustn=${encodeURIComponent(ustnFilter)}`
        : `/api/sgtx/roro`;
      const j = await (await fetch(url)).json();
      return j;
    },
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <Card className="p-4 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        Loading RoRo shipments...
      </Card>
    );
  }
  if (error) {
    return (
      <Card className="p-4 flex items-center text-rose-600">
        <AlertTriangle className="h-4 w-4 mr-2" />
        Failed to load shipments: {(error as Error)?.message || "unknown error"}
      </Card>
    );
  }
  const shipments = normalizeArray(data, "shipments");
  if (shipments.length === 0) {
    return (
      <Card className="p-8 flex flex-col items-center text-center text-muted-foreground">
        <Ship className="h-10 w-10 mb-3 text-muted-foreground/40" />
        <p className="font-medium text-foreground">No RoRo shipments found</p>
        <p className="text-xs mt-1 max-w-md">
          Create a new shipment to start tracking rolling cargo units, voyages, yard positions, and
          Egypt Nafeza adapter status.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {shipments.map((s: any) => {
        const units = Array.isArray(s.units) ? s.units : [];
        const unitCount = s.totalUnits ?? units.length;
        const totalWeight = s.totalWeightKg ?? 0;
        const transitPorts = safeJsonArr(s.transitPorts);
        return (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className="w-full text-left"
          >
            <Card className="p-4 hover:shadow-md transition-shadow flex items-center gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                <Ship className="h-5 w-5 text-slate-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-semibold text-foreground truncate">
                    {s.shipmentReference || s.id}
                  </span>
                  <Badge variant="outline" className={statusBand(s.status)}>
                    {s.status || "BOOKED"}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                  <span className="font-mono">{s.ustn}</span>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {s.originPort} → {s.destinationPort}
                  </span>
                  {transitPorts.length > 0 && (
                    <span className="text-muted-foreground/70">
                      via {transitPorts.join(" → ")}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex-shrink-0 flex items-center gap-4 text-right">
                <div>
                  <p className="text-xs text-muted-foreground">Units</p>
                  <p className="font-semibold">{unitCount}</p>
                </div>
                <div className="hidden sm:block">
                  <p className="text-xs text-muted-foreground">Weight</p>
                  <p className="font-semibold text-sm">{fmtKg(totalWeight)}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Card>
          </button>
        );
      })}
    </div>
  );
}

// ─── Create shipment dialog ───────────────────────────────────────────────────

function CreateShipmentDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    ustn: "",
    shipperGtid: "",
    consigneeGtid: "",
    originPort: "",
    destinationPort: "",
    incoterm: "FCA",
    transitPorts: "",
  });

  const submit = async () => {
    if (!form.ustn || !form.originPort || !form.destinationPort) {
      toast.error("USTN, originPort and destinationPort are required");
      return;
    }
    setSubmitting(true);
    try {
      const body: any = {
        ustn: form.ustn,
        originPort: form.originPort.toUpperCase(),
        destinationPort: form.destinationPort.toUpperCase(),
        incoterm: form.incoterm,
        units: [],
      };
      if (form.shipperGtid) body.shipperGtid = form.shipperGtid;
      if (form.consigneeGtid) body.consigneeGtid = form.consigneeGtid;
      if (form.transitPorts.trim()) {
        body.transitPorts = form.transitPorts
          .split(",")
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean);
      }
      const res = await fetch("/api/sgtx/roro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok || j.error) {
        toast.error(j.error || `Failed to create shipment (HTTP ${res.status})`);
        return;
      }
      toast.success(`RoRo shipment created: ${j.shipment?.shipmentReference || j.shipment?.id}`);
      qc.invalidateQueries({ queryKey: ["roro-shipments"] });
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New RoRo Shipment</DialogTitle>
          <DialogDescription>
            Create a RORO_MASTER_OBJECT under a USTN. Origin/destination UN/LOCODEs trigger
            Egypt Nafeza adapter auto-apply (Art 77).
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>USTN</Label>
            <Input
              value={form.ustn}
              onChange={(e) => setForm({ ...form, ustn: e.target.value })}
              placeholder="SGTX-..."
            />
          </div>
          <div>
            <Label>Origin port (UN/LOCODE)</Label>
            <Input
              value={form.originPort}
              onChange={(e) => setForm({ ...form, originPort: e.target.value })}
              placeholder="EGDMT"
            />
          </div>
          <div>
            <Label>Destination port</Label>
            <Input
              value={form.destinationPort}
              onChange={(e) => setForm({ ...form, destinationPort: e.target.value })}
              placeholder="ITTRI"
            />
          </div>
          <div>
            <Label>Shipper GTID</Label>
            <Input
              value={form.shipperGtid}
              onChange={(e) => setForm({ ...form, shipperGtid: e.target.value })}
              placeholder="SGTX-EG-SHP-..."
            />
          </div>
          <div>
            <Label>Consignee GTID</Label>
            <Input
              value={form.consigneeGtid}
              onChange={(e) => setForm({ ...form, consigneeGtid: e.target.value })}
              placeholder="SGTX-IT-BUY-..."
            />
          </div>
          <div>
            <Label>Incoterm</Label>
            <Input
              value={form.incoterm}
              onChange={(e) => setForm({ ...form, incoterm: e.target.value })}
              placeholder="FCA"
            />
          </div>
          <div>
            <Label>Transit ports (comma-sep)</Label>
            <Input
              value={form.transitPorts}
              onChange={(e) => setForm({ ...form, transitPorts: e.target.value })}
              placeholder="EGPSD, ITGOA"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Shipment detail ──────────────────────────────────────────────────────────

function RoRoShipmentDetail({
  shipmentId,
  onBack,
}: {
  shipmentId: string;
  onBack: () => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["roro-shipment", shipmentId],
    queryFn: async () => {
      const j = await (await fetch(`/api/sgtx/roro/${shipmentId}`)).json();
      return j;
    },
    staleTime: 30_000,
  });

  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Loading shipment...
      </div>
    );
  }
  if (error || data?.error) {
    return (
      <div className="p-6 space-y-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to list
        </Button>
        <Card className="p-4 text-rose-600 flex items-center">
          <AlertTriangle className="h-4 w-4 mr-2" />
          {data?.error || (error as Error)?.message || "Failed to load shipment"}
        </Card>
      </div>
    );
  }

  const shipment = data?.shipment;
  if (!shipment) {
    return (
      <div className="p-6 space-y-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to list
        </Button>
        <Card className="p-4 text-muted-foreground">Shipment not found.</Card>
      </div>
    );
  }

  const units = normalizeArray(shipment, "units");
  const bookings = normalizeArray(shipment, "bookings");
  const billsOfLading = normalizeArray(shipment, "billsOfLading");
  const transitPorts = safeJsonArr(shipment.transitPorts);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
      </div>

      {/* Shipment header */}
      <Card className="p-4 sm:p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Ship className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-display text-xl font-bold text-foreground">
                {shipment.shipmentReference || shipment.id}
              </h2>
              <Badge variant="outline" className={statusBand(shipment.status)}>
                {shipment.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1 font-mono">{shipment.ustn}</p>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Units</p>
              <p className="font-semibold">{shipment.totalUnits ?? units.length}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Weight</p>
              <p className="font-semibold">{fmtKg(shipment.totalWeightKg)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Incoterm</p>
              <p className="font-semibold">{shipment.incoterm || "—"}</p>
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Origin</p>
              <p className="font-medium">{shipment.originPort}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Destination</p>
              <p className="font-medium">{shipment.destinationPort}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Globe2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Transit</p>
              <p className="font-medium">
                {transitPorts.length > 0 ? transitPorts.join(", ") : "Direct"}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Units */}
      <Card className="p-4">
        <SectionHeader
          title="Rolling Cargo Units"
          subtitle="VIN-level identity per Art 57-58 — click any row to drill into state machine + inspections"
        />
        {units.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No units added. Use POST /api/sgtx/roro/{shipmentId}/unit to add one.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b text-xs text-muted-foreground">
                  <th className="py-2 pr-3">VIN / ID</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Make / Model</th>
                  <th className="py-2 pr-3">Weight</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Yard</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {units.map((u: any) => {
                  const yard = u.yard;
                  return (
                    <tr
                      key={u.id}
                      className="border-b last:border-b-0 hover:bg-muted/40 cursor-pointer"
                      onClick={() => setSelectedUnitId(u.id)}
                    >
                      <td className="py-2 pr-3 font-mono text-xs">
                        {u.vin || <span className="text-muted-foreground">(no VIN)</span>}
                      </td>
                      <td className="py-2 pr-3">
                        <Badge variant="outline">{u.unitType}</Badge>
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {u.make || "—"} {u.model || ""}
                        {u.year ? ` (${u.year})` : ""}
                      </td>
                      <td className="py-2 pr-3 text-xs">{fmtKg(u.weightKg)}</td>
                      <td className="py-2 pr-3">
                        <Badge variant="outline" className={statusBand(u.status)}>
                          {u.status}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">
                        {yard ? `${yard.yardZone || "?"}-${yard.block || "?"}-${yard.row || "?"}-${yard.slot || "?"}` : "—"}
                      </td>
                      <td className="py-2">
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Voyages & bookings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <SectionHeader title="Bookings" subtitle="Bookings on voyages (Art 59)" />
          {bookings.length === 0 ? (
            <p className="text-sm text-muted-foreground py-3">No bookings recorded.</p>
          ) : (
            <div className="space-y-2">
              {bookings.map((b: any) => {
                const specialHandling = safeJsonArr(b.specialHandling);
                return (
                  <div key={b.id} className="border rounded-lg p-3 text-sm">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-mono font-semibold">{b.bookingReference}</span>
                      <Badge variant="outline" className={statusBand(b.status)}>
                        {b.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 grid grid-cols-2 gap-2">
                      <span>Units: {b.unitsCount ?? "—"}</span>
                      <span>Weight: {fmtKg(b.totalWeightKg)}</span>
                      <span>Incoterm: {b.incoterm || "—"}</span>
                      <span>Voyage ID: {b.voyageId?.slice(-8) || "—"}</span>
                    </div>
                    {specialHandling.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {specialHandling.map((h: string, i: number) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {h}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <SectionHeader title="Bills of Lading" subtitle="Master / House B/Ls (Art 72)" />
          {billsOfLading.length === 0 ? (
            <p className="text-sm text-muted-foreground py-3">No B/Ls issued.</p>
          ) : (
            <div className="space-y-2">
              {billsOfLading.map((bl: any) => {
                const vins = safeJsonArr(bl.vinsList);
                return (
                  <div key={bl.id} className="border rounded-lg p-3 text-sm">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-mono font-semibold">{bl.blNumber}</span>
                      <Badge variant="outline">{bl.blType}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 grid grid-cols-2 gap-2">
                      <span>Vessel: {bl.vesselName || "—"}</span>
                      <span>Voyage: {bl.voyageNumber || "—"}</span>
                      <span>POL: {bl.portOfLoading || "—"}</span>
                      <span>POD: {bl.portOfDischarge || "—"}</span>
                      <span>Weight: {fmtKg(bl.totalWeightKg)}</span>
                      <span>VINs: {vins.length}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Egypt adapter */}
      <EgyptAdapterPanel ustn={shipment.ustn} />

      {/* Unit drill-down */}
      {selectedUnitId && (
        <UnitDetailDialog
          unitId={selectedUnitId}
          onClose={() => setSelectedUnitId(null)}
        />
      )}
    </div>
  );
}

// ─── Egypt RoRo Adapter panel ─────────────────────────────────────────────────

function EgyptAdapterPanel({ ustn }: { ustn: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["roro-egypt-adapter", ustn],
    queryFn: async () => {
      const j = await (await fetch(`/api/sgtx/roro/egypt-adapter?ustn=${encodeURIComponent(ustn)}`)).json();
      return j;
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <Card className="p-4 flex items-center text-muted-foreground">
        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading Egypt adapter...
      </Card>
    );
  }
  const adapter = data?.adapter;
  if (!adapter) {
    return (
      <Card className="p-4">
        <SectionHeader title="Egypt RoRo Adapter" subtitle="Nafeza applicability per Art 77" />
        <p className="text-sm text-muted-foreground">
          No Egypt adapter configured for this USTN. Click apply to determine Nafeza applicability.
        </p>
        <ApplyAdapterButton ustn={ustn} />
      </Card>
    );
  }
  const messages = safeJsonArr(adapter.shippingAgentMessages);
  const steps = safeJsonArr(adapter.terminalProcessSteps);
  const portReq = safeJsonObj(adapter.portRequirements);
  const destReq = safeJsonObj(adapter.destinationRequirements);
  const docs = safeJsonArr(adapter.unitDocumentationRequired);

  return (
    <Card className="p-4">
      <SectionHeader
        title="Egypt RoRo Adapter"
        subtitle="Nafeza applicability, UCR, shipping-agent messages, customs procedure — per Art 77"
        action={<ApplyAdapterButton ustn={ustn} />}
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
        <KV label="Nafeza applies" value={adapter.nafezaApplies ? "Yes" : "No"} />
        <KV label="UCR" value={adapter.ucr || "—"} mono />
        <KV label="Customs procedure" value={adapter.customsProcedure || "—"} />
        <KV label="Manifest required" value={adapter.manifestRequired ? "Yes" : "No"} />
        <KV label="Export declaration" value={adapter.exportDeclarationRequired ? "Yes" : "No"} />
        <KV label="Transit declaration" value={adapter.transitDeclarationRequired ? "Yes" : "No"} />
      </div>
      {messages.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-muted-foreground mb-1">
            Shipping-agent messages (Empty Containers intentionally omitted for RoRo)
          </p>
          <div className="flex flex-wrap gap-1">
            {messages.map((m: string, i: number) => (
              <Badge key={i} variant="secondary" className="text-xs font-mono">
                {m}
              </Badge>
            ))}
          </div>
        </div>
      )}
      {docs.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-muted-foreground mb-1">Unit documentation required</p>
          <div className="flex flex-wrap gap-1">
            {docs.map((d: string, i: number) => (
              <Badge key={i} variant="outline" className="text-xs">
                {d}
              </Badge>
            ))}
          </div>
        </div>
      )}
      {steps.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-muted-foreground mb-1">Terminal process steps (Art 63)</p>
          <div className="flex flex-wrap gap-1 text-xs">
            {steps.map((s: string, i: number) => (
              <span key={i} className="px-2 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                {i + 1}. {s}
              </span>
            ))}
          </div>
        </div>
      )}
      {portReq && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <p className="font-medium text-muted-foreground mb-1">Port requirements (origin)</p>
            <pre className="bg-muted/50 rounded p-2 overflow-x-auto text-xs">
              {JSON.stringify(portReq.origin || {}, null, 2)}
            </pre>
          </div>
          <div>
            <p className="font-medium text-muted-foreground mb-1">Destination requirements</p>
            <pre className="bg-muted/50 rounded p-2 overflow-x-auto text-xs">
              {JSON.stringify(destReq || portReq.destination || {}, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </Card>
  );
}

function ApplyAdapterButton({ ustn }: { ustn: string }) {
  const qc = useQueryClient();
  const [applying, setApplying] = useState(false);
  const apply = async () => {
    setApplying(true);
    try {
      const res = await fetch("/api/sgtx/roro/egypt-adapter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ustn }),
      });
      const j = await res.json();
      if (!res.ok || j.error) {
        toast.error(j.error || `Failed (HTTP ${res.status})`);
        return;
      }
      toast.success("Egypt adapter applied");
      qc.invalidateQueries({ queryKey: ["roro-egypt-adapter", ustn] });
    } catch (e: any) {
      toast.error(e?.message || "Network error");
    } finally {
      setApplying(false);
    }
  };
  return (
    <Button size="sm" variant="outline" onClick={apply} disabled={applying}>
      {applying ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
      {applying ? "Applying..." : "Apply / Refresh"}
    </Button>
  );
}

// ─── Unit detail dialog (state machine + inspections + yard + gate) ──────────

function UnitDetailDialog({ unitId, onClose }: { unitId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["roro-unit", unitId],
    queryFn: async () => {
      const j = await (await fetch(`/api/sgtx/roro/unit/${unitId}`)).json();
      return j;
    },
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-3xl">
          <div className="flex items-center text-muted-foreground">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading unit...
          </div>
        </DialogContent>
      </Dialog>
    );
  }
  const unit = data?.unit;
  if (!unit) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-3xl">
          <p className="text-rose-600">Unit not found.</p>
        </DialogContent>
      </Dialog>
    );
  }

  const inspections = normalizeArray(unit, "inspections");
  const gateEvents = normalizeArray(unit, "gateEvents");
  const yard = unit.yard;
  const currentStatus = unit.status || "BOOKED";
  const currentIndex = UNIT_STATUSES.indexOf(currentStatus);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <Truck className="h-5 w-5 text-muted-foreground" />
            <span className="font-mono">{unit.vin || unit.id}</span>
            <Badge variant="outline" className={statusBand(currentStatus)}>
              {currentStatus}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {unit.make || "—"} {unit.model || ""} {unit.year ? `· ${unit.year}` : ""} · {unit.unitType}
          </DialogDescription>
        </DialogHeader>

        {/* State machine visualisation (19 states, current highlighted) */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Unit state machine (Art 74 — 19 states)
          </p>
          <div className="flex flex-wrap gap-1">
            {UNIT_STATUSES.map((s, i) => {
              const isCurrent = s === currentStatus;
              const isPast = i < currentIndex;
              return (
                <span
                  key={s}
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                    isCurrent
                      ? "bg-emerald-600 text-white border-emerald-700"
                      : isPast
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-muted text-muted-foreground border-muted"
                  }`}
                  title={s}
                >
                  {s.replace(/_/g, " ")}
                </span>
              );
            })}
          </div>
        </div>

        {/* Unit attributes */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <KV label="Weight" value={fmtKg(unit.weightKg)} />
          <KV label="Dims (L×W×H cm)" value={`${unit.lengthCm || "—"}×${unit.widthCm || "—"}×${unit.heightCm || "—"}`} />
          <KV label="Fuel" value={unit.fuelType || "—"} />
          <KV label="Battery charged" value={unit.batteryCharged ? "Yes" : "No"} />
          <KV label="Running" value={unit.runningStatus} />
          <KV label="HS code" value={unit.hsCode || "—"} mono />
          <KV label="Origin" value={unit.originCountry || "—"} />
          <KV label="Destination" value={unit.destinationCountry || "—"} />
        </div>

        {/* Yard position */}
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <Warehouse className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium">Yard position (Art 64)</p>
          </div>
          {yard ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <KV label="Zone" value={yard.yardZone || "—"} />
              <KV label="Block" value={yard.block || "—"} />
              <KV label="Row" value={yard.row || "—"} />
              <KV label="Slot" value={yard.slot || "—"} />
              <KV label="Deck" value={yard.deck || "—"} />
              <KV label="Position" value={yard.position || "—"} />
              <KV label="Status" value={yard.status || "—"} />
              <KV label="Arrival" value={fmtDate(yard.arrivalTime)} />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No yard position assigned.</p>
          )}
        </Card>

        {/* Gate events */}
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <Anchor className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium">Gate events (Art 65)</p>
          </div>
          {gateEvents.length === 0 ? (
            <p className="text-xs text-muted-foreground">No gate events recorded.</p>
          ) : (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {gateEvents.map((g: any) => (
                <div key={g.id} className="flex items-center gap-2 text-xs">
                  <Badge variant="outline" className={statusBand(g.eventType)}>
                    {g.eventType}
                  </Badge>
                  <span className="text-muted-foreground">{g.gateType}</span>
                  <span>{fmtDate(g.eventTime)}</span>
                  {g.customsStatus && (
                    <span className="text-muted-foreground">· customs: {g.customsStatus}</span>
                  )}
                  {g.vinScan && (
                    <span className="text-muted-foreground font-mono">· VIN scanned: {g.vinScan}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Inspections (with damage comparison: AI POSSIBLE vs human CONFIRMED) */}
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium">Inspection history (Art 66-67)</p>
          </div>
          {inspections.length === 0 ? (
            <p className="text-xs text-muted-foreground">No inspections recorded.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {inspections.map((insp: any) => {
                const pre = safeJsonArr(insp.preExistingDamage);
                const fresh = safeJsonArr(insp.newDamage);
                const ai = safeJsonObj(insp.aiDamageAssessment);
                const photos = safeJsonArr(insp.photos);
                const aiDamageCount = ai?.possibleDamageCount
                  || (Array.isArray(ai?.detections) ? ai.detections.length : 0);
                return (
                  <div key={insp.id} className="border rounded-lg p-2 text-xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline">{insp.inspectionType}</Badge>
                      <span className="text-muted-foreground">{fmtDate(insp.inspectionTime)}</span>
                      {insp.inspectorName && (
                        <span className="text-muted-foreground">· {insp.inspectorName}</span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                      <KV label="Mileage" value={insp.mileage != null ? `${insp.mileage} km` : "—"} />
                      <KV label="Fuel" value={insp.fuelLevel || "—"} />
                      <KV label="Battery" value={insp.batteryLevel || "—"} />
                      <KV label="Keys" value={insp.keysPresent ? "Present" : "Missing"} />
                    </div>
                    {/* Damage comparison: AI vs human (Art 67) */}
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="rounded border border-amber-200 bg-amber-50 p-2">
                        <p className="text-xs font-medium text-amber-800 mb-1">
                          A2 AI assessment (POSSIBLE_DAMAGE only)
                        </p>
                        {ai ? (
                          <div className="text-xs text-amber-800">
                            <p>Flagged areas: {aiDamageCount}</p>
                            {Array.isArray(ai.detections) && ai.detections.length > 0 && (
                              <ul className="mt-1 space-y-0.5">
                                {ai.detections.slice(0, 3).map((d: any, i: number) => (
                                  <li key={i}>· {d?.location || "unknown"}: {d?.description || ""}</li>
                                ))}
                              </ul>
                            )}
                            <p className="mt-1 text-[10px] italic text-amber-700">
                              AI never determines liability — human confirmation required.
                            </p>
                          </div>
                        ) : (
                          <p className="text-xs text-amber-700/70">No AI assessment.</p>
                        )}
                      </div>
                      <div className="rounded border border-emerald-200 bg-emerald-50 p-2">
                        <p className="text-xs font-medium text-emerald-800 mb-1">
                          Human-confirmed damage (CONFIRMED_DAMAGE)
                        </p>
                        {fresh.length > 0 ? (
                          <ul className="text-xs text-emerald-800 space-y-0.5">
                            {fresh.map((d: any, i: number) => (
                              <li key={i}>
                                · {d?.location || "unknown"}: {d?.description || ""}{" "}
                                {d?.severity && (
                                  <span className="text-emerald-700/70">({d.severity})</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-emerald-700/70">No new damage confirmed.</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          Pre-existing: {pre.length} item(s)
                        </p>
                      </div>
                    </div>
                    {photos.length > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-1">{photos.length} photo(s) attached</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </DialogContent>
    </Dialog>
  );
}

// ─── Small presentational helpers ────────────────────────────────────────────

function KV({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-sm font-medium ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

export default RoRoScreen;
