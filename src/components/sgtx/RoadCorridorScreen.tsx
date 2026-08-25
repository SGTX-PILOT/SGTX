"use client";

// ════════════════════════════════════════════════════════════════════════════
// RoadCorridorScreen — LSP portal screen for the SGTX Road Corridor Engine
// (Blueprint v13.1 FINAL Articles 43-46)
//
// Layout (3 panes via internal tab switch):
//   1. Corridors  — list + create-form (RoadCorridor + RoadLeg)
//   2. Shipments  — list + create-form + drill-down view (RoadShipment +
//                   RoadLeg[] + RoadBorderCrossing[] + RoadGpsTracking[])
//   3. Resources  — RoadVehicle + RoadDriver management (read-mostly)
//
// Defensive by design — every API response is normalized via Array.isArray
// checks before being rendered. useQuery from @tanstack/react-query drives
// server state; client state via useState for form inputs + drill-down id.
// ════════════════════════════════════════════════════════════════════════════

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { SectionHeader } from "@/components/sgtx/widgets";
import { toast } from "sonner";
import {
  Truck, Plus, Loader2, MapPin, ArrowRight, Clock, Globe2, Inbox,
  PackageCheck, Navigation, ShieldCheck, X,
} from "lucide-react";

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(v: any): string {
  if (!v) return "—";
  try {
    const d = typeof v === "string" ? new Date(v) : v instanceof Date ? v : null;
    if (!d || isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
  } catch {
    return String(v);
  }
}

function fmtDateTime(v: any): string {
  if (!v) return "—";
  try {
    const d = typeof v === "string" ? new Date(v) : v instanceof Date ? v : null;
    if (!d || isNaN(d.getTime())) return String(v);
    return d.toLocaleString(undefined, {
      year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return String(v);
  }
}

function StatusPill({ value, className = "" }: { value: any; className?: string }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const s = String(value).toUpperCase();
  const tone =
    /ACTIVE|CONFIRMED|VERIFIED|CLEARED|DELIVERED|PASS|COMPLETED|SIGNED|ISSUED/.test(s)
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
      : /PENDING|DRAFT|PLANNED|SUBMITTED|QUEUED|WAITING|ARRIVED|IN_TRANSIT|AT_BORDER/.test(s)
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
      : /CANCELLED|REJECTED|FAILED|HELD|CRITICAL|EXPIRED/.test(s)
      ? "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30"
      : "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30";
  return (
    <Badge variant="outline" className={`text-[0.6rem] font-semibold px-1.5 py-0 ${tone} ${className}`}>
      {s}
    </Badge>
  );
}

function safeArray<T>(v: any): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === "object") {
    if (Array.isArray(v.rows)) return v.rows as T[];
    if (Array.isArray(v.data)) return v.data as T[];
  }
  return [];
}

// ─── Screen ──────────────────────────────────────────────────────────────────

type Pane = "corridors" | "shipments" | "resources";

export function RoadCorridorScreen({ data }: { data: any }) {
  const [pane, setPane] = useState<Pane>("corridors");
  return (
    <div className="space-y-4 w-full max-w-7xl mx-auto">
      <SectionHeader
        title="Road Corridor Engine"
        subtitle="Multi-country road shipment orchestration (Egypt → Jordan → Saudi → UAE) per Articles 43-46."
      />
      <div className="flex flex-wrap gap-2">
        {([
          { id: "corridors", label: "Corridors", icon: Globe2 },
          { id: "shipments", label: "Shipments", icon: Truck },
          { id: "resources", label: "Vehicles & Drivers", icon: ShieldCheck },
        ] as const).map((p) => (
          <Button
            key={p.id}
            size="sm"
            variant={pane === p.id ? "default" : "outline"}
            onClick={() => setPane(p.id)}
            className={pane === p.id ? "bg-gold-gradient text-sovereign" : ""}
          >
            <p.icon className="w-3.5 h-3.5 mr-1.5" aria-hidden />
            {p.label}
          </Button>
        ))}
      </div>
      {pane === "corridors" && <CorridorsPane />}
      {pane === "shipments" && <ShipmentsPane />}
      {pane === "resources" && <ResourcesPane />}
    </div>
  );
}

export default RoadCorridorScreen;

// ════════════════════════════════════════════════════════════════════════════
// 1. Corridors pane
// ════════════════════════════════════════════════════════════════════════════

function CorridorsPane() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: apiData, isLoading } = useQuery({
    queryKey: ["road-corridors"],
    queryFn: async () => {
      try {
        const r = await fetch("/api/sgtx/road-corridor");
        if (!r.ok) return { corridors: [] as any[] };
        const j = await r.json();
        return { corridors: safeArray<any>(j?.corridors || j) };
      } catch {
        return { corridors: [] as any[] };
      }
    },
    staleTime: 30_000,
  });

  const corridors = apiData?.corridors || [];

  async function handleCreate(payload: any) {
    try {
      const r = await fetch("/api/sgtx/road-corridor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) {
        toast.error(j?.error || "Failed to create corridor");
        return false;
      }
      toast.success(`Corridor ${j.corridor?.corridorCode || ""} created`);
      qc.invalidateQueries({ queryKey: ["road-corridors"] });
      setShowCreate(false);
      return true;
    } catch (e: any) {
      toast.error(e?.message || "Network error");
      return false;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" className="bg-gold-gradient text-sovereign" onClick={() => setShowCreate(true)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" aria-hidden /> New Corridor
        </Button>
      </div>
      <Card className="p-4 min-w-0 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-gold" aria-hidden />
            <span className="ml-2 text-sm text-muted-foreground">Loading corridors…</span>
          </div>
        ) : corridors.length === 0 ? (
          <EmptyState
            icon={Globe2}
            message="No road corridors defined yet. Click “New Corridor” to create one (e.g. EG → JO → SA → AE)."
          />
        ) : (
          <div className="overflow-x-auto scroll-gold rounded-md">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 text-muted-foreground">
                <tr>
                  <Th>Corridor Code</Th>
                  <Th>Route</Th>
                  <Th>Transit Countries</Th>
                  <Th className="text-right">Distance (km)</Th>
                  <Th className="text-right">Est. Hours</Th>
                  <Th>Status</Th>
                  <Th>Created</Th>
                </tr>
              </thead>
              <tbody>
                {corridors.map((c: any) => (
                  <tr key={c.id} className="border-t border-border hover:bg-muted/20 transition-colors">
                    <td className="p-2.5 font-mono text-[0.65rem]">{c.corridorCode || "—"}</td>
                    <td className="p-2.5 text-[0.7rem]">
                      <span className="font-mono">{c.originCountry || "—"}</span>
                      <ArrowRight className="w-3 h-3 inline mx-1 text-muted-foreground" aria-hidden />
                      <span className="font-mono">{c.destinationCountry || "—"}</span>
                    </td>
                    <td className="p-2.5">
                      <div className="flex flex-wrap gap-1">
                        {(safeArray<string>(c.transitCountries) || []).map((cc) => (
                          <Badge key={cc} variant="outline" className="text-[0.55rem] font-mono px-1 py-0">
                            {cc}
                          </Badge>
                        ))}
                        {safeArray<string>(c.transitCountries).length === 0 && (
                          <span className="text-muted-foreground text-[0.65rem]">direct</span>
                        )}
                      </div>
                    </td>
                    <td className="p-2.5 text-right">{(c.totalDistanceKm || 0).toLocaleString()}</td>
                    <td className="p-2.5 text-right">{c.estimatedTransitHours || 0}</td>
                    <td className="p-2.5"><StatusPill value={c.status} /></td>
                    <td className="p-2.5 text-[0.65rem] text-muted-foreground">{fmtDate(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showCreate && (
        <CreateCorridorDialog onClose={() => setShowCreate(false)} onSubmit={handleCreate} />
      )}
    </div>
  );
}

function CreateCorridorDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (payload: any) => Promise<boolean>;
}) {
  const [code, setCode] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [transit, setTransit] = useState("");
  const [distance, setDistance] = useState("");
  const [hours, setHours] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!code || !origin || !destination) {
      toast.error("Corridor code, origin, and destination are required");
      return;
    }
    setSubmitting(true);
    const transitCountries = transit
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    await onSubmit({
      corridorCode: code.trim().toUpperCase(),
      originCountry: origin.trim().toUpperCase(),
      destinationCountry: destination.trim().toUpperCase(),
      transitCountries,
      totalDistanceKm: distance ? parseInt(distance, 10) : 0,
      estimatedTransitHours: hours ? parseInt(hours, 10) : 0,
    });
    setSubmitting(false);
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Road Corridor</DialogTitle>
          <DialogDescription>
            Define a multi-country road corridor (e.g. Egypt → Jordan → Saudi → UAE).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="rc-code" className="text-xs">Corridor Code</Label>
            <Input id="rc-code" value={code} onChange={(e) => setCode(e.target.value)}
              placeholder="EG-JO-SA-AE" className="h-9 text-xs uppercase" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="rc-origin" className="text-xs">Origin Country (ISO-2)</Label>
              <Input id="rc-origin" value={origin} onChange={(e) => setOrigin(e.target.value)}
                placeholder="EG" maxLength={3} className="h-9 text-xs uppercase" />
            </div>
            <div>
              <Label htmlFor="rc-dest" className="text-xs">Destination (ISO-2)</Label>
              <Input id="rc-dest" value={destination} onChange={(e) => setDestination(e.target.value)}
                placeholder="AE" maxLength={3} className="h-9 text-xs uppercase" />
            </div>
          </div>
          <div>
            <Label htmlFor="rc-transit" className="text-xs">Transit Countries (comma-separated)</Label>
            <Input id="rc-transit" value={transit} onChange={(e) => setTransit(e.target.value)}
              placeholder="JO, SA" className="h-9 text-xs uppercase" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="rc-dist" className="text-xs">Total Distance (km)</Label>
              <Input id="rc-dist" type="number" value={distance} onChange={(e) => setDistance(e.target.value)}
                placeholder="3500" className="h-9 text-xs" />
            </div>
            <div>
              <Label htmlFor="rc-hours" className="text-xs">Est. Transit (hours)</Label>
              <Input id="rc-hours" type="number" value={hours} onChange={(e) => setHours(e.target.value)}
                placeholder="72" className="h-9 text-xs" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button size="sm" className="bg-gold-gradient text-sovereign" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" aria-hidden /> : <Plus className="w-3.5 h-3.5 mr-1" aria-hidden />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 2. Shipments pane
// ════════════════════════════════════════════════════════════════════════════

function ShipmentsPane() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterUstn, setFilterUstn] = useState("");

  const { data: apiData, isLoading } = useQuery({
    queryKey: ["road-shipments", filterUstn],
    queryFn: async () => {
      try {
        const qs = filterUstn ? `?ustn=${encodeURIComponent(filterUstn)}` : "";
        const r = await fetch(`/api/sgtx/road-corridor/shipment${qs}`);
        if (!r.ok) return { shipments: [] as any[] };
        const j = await r.json();
        return { shipments: safeArray<any>(j?.shipments || j) };
      } catch {
        return { shipments: [] as any[] };
      }
    },
    staleTime: 30_000,
  });

  const shipments = apiData?.shipments || [];

  async function handleCreate(payload: any) {
    try {
      const r = await fetch("/api/sgtx/road-corridor/shipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) {
        toast.error(j?.error || "Failed to create shipment");
        return false;
      }
      toast.success("Road shipment created");
      qc.invalidateQueries({ queryKey: ["road-shipments", filterUstn] });
      setShowCreate(false);
      return true;
    } catch (e: any) {
      toast.error(e?.message || "Network error");
      return false;
    }
  }

  if (selectedId) {
    return <ShipmentDetail shipmentId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Input
            value={filterUstn}
            onChange={(e) => setFilterUstn(e.target.value)}
            placeholder="Filter by USTN…"
            className="max-w-xs h-8 text-xs"
            aria-label="Filter shipments by USTN"
          />
          {filterUstn && (
            <Button size="sm" variant="ghost" onClick={() => setFilterUstn("")}>
              <X className="w-3 h-3" aria-hidden /> Clear
            </Button>
          )}
        </div>
        <Button size="sm" className="bg-gold-gradient text-sovereign" onClick={() => setShowCreate(true)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" aria-hidden /> New Shipment
        </Button>
      </div>
      <Card className="p-4 min-w-0 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-gold" aria-hidden />
            <span className="ml-2 text-sm text-muted-foreground">Loading shipments…</span>
          </div>
        ) : shipments.length === 0 ? (
          <EmptyState
            icon={Truck}
            message="No road shipments yet. Click “New Shipment” to dispatch one through a corridor."
          />
        ) : (
          <div className="overflow-x-auto scroll-gold rounded-md">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 text-muted-foreground">
                <tr>
                  <Th>USTN</Th>
                  <Th>Corridor</Th>
                  <Th>Carrier</Th>
                  <Th className="text-right">Weight (kg)</Th>
                  <Th>Incoterm</Th>
                  <Th>Status</Th>
                  <Th>Started</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((s: any) => (
                  <tr key={s.id} className="border-t border-border hover:bg-muted/20 transition-colors">
                    <td className="p-2.5 font-mono text-[0.65rem]">{s.ustn || "—"}</td>
                    <td className="p-2.5 text-[0.65rem] font-mono">
                      {s.corridor?.corridorCode || s.corridorId?.slice(-8) || "—"}
                    </td>
                    <td className="p-2.5 text-[0.65rem] truncate max-w-[140px]">
                      {s.carrierGtid || "—"}
                    </td>
                    <td className="p-2.5 text-right">{(s.grossWeightKg || 0).toLocaleString()}</td>
                    <td className="p-2.5">{s.incoterm || "—"}</td>
                    <td className="p-2.5"><StatusPill value={s.status} /></td>
                    <td className="p-2.5 text-[0.65rem] text-muted-foreground">{fmtDate(s.startedAt)}</td>
                    <td className="p-2.5">
                      <Button size="sm" variant="outline" onClick={() => setSelectedId(s.id)}>
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showCreate && (
        <CreateShipmentDialog onClose={() => setShowCreate(false)} onSubmit={handleCreate} />
      )}
    </div>
  );
}

function CreateShipmentDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (payload: any) => Promise<boolean>;
}) {
  const [ustn, setUstn] = useState("");
  const [corridorId, setCorridorId] = useState("");
  const [carrierGtid, setCarrierGtid] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [weight, setWeight] = useState("");
  const [incoterm, setIncoterm] = useState("DAP");
  const [cargo, setCargo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Fetch corridors to populate the corridor picker
  const { data: corridorsData } = useQuery({
    queryKey: ["road-corridors"],
    queryFn: async () => {
      try {
        const r = await fetch("/api/sgtx/road-corridor");
        if (!r.ok) return { corridors: [] as any[] };
        const j = await r.json();
        return { corridors: safeArray<any>(j?.corridors || j) };
      } catch {
        return { corridors: [] as any[] };
      }
    },
    staleTime: 60_000,
  });
  const corridors = corridorsData?.corridors || [];

  async function handleSubmit() {
    if (!ustn || !corridorId) {
      toast.error("USTN and Corridor are required");
      return;
    }
    setSubmitting(true);
    await onSubmit({
      ustn: ustn.trim(),
      corridorId,
      carrierGtid: carrierGtid.trim() || undefined,
      vehicleId: vehicleId.trim() || undefined,
      driverId: driverId.trim() || undefined,
      grossWeightKg: weight ? parseInt(weight, 10) : 0,
      incoterm: incoterm.trim() || undefined,
      cargoDescription: cargo.trim() || undefined,
    });
    setSubmitting(false);
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Road Shipment</DialogTitle>
          <DialogDescription>
            Dispatch a shipment through an existing road corridor.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="rs-ustn" className="text-xs">USTN (Trade reference)</Label>
            <Input id="rs-ustn" value={ustn} onChange={(e) => setUstn(e.target.value)}
              placeholder="SGTX-PEND-…-XXXXXX" className="h-9 text-xs font-mono" />
          </div>
          <div>
            <Label htmlFor="rs-corridor" className="text-xs">Corridor</Label>
            <select
              id="rs-corridor"
              value={corridorId}
              onChange={(e) => setCorridorId(e.target.value)}
              className="w-full h-9 text-xs rounded-md border border-input bg-background px-2"
            >
              <option value="">Select a corridor…</option>
              {corridors.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.corridorCode} ({c.originCountry} → {c.destinationCountry})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="rs-carrier" className="text-xs">Carrier GTID</Label>
              <Input id="rs-carrier" value={carrierGtid} onChange={(e) => setCarrierGtid(e.target.value)}
                placeholder="SGTX-EG-LSP-000120-4C7D" className="h-9 text-xs font-mono" />
            </div>
            <div>
              <Label htmlFor="rs-incoterm" className="text-xs">Incoterm</Label>
              <Input id="rs-incoterm" value={incoterm} onChange={(e) => setIncoterm(e.target.value.toUpperCase())}
                placeholder="DAP" maxLength={4} className="h-9 text-xs uppercase" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="rs-vehicle" className="text-xs">Vehicle ID</Label>
              <Input id="rs-vehicle" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}
                placeholder="(cuid)" className="h-9 text-xs font-mono" />
            </div>
            <div>
              <Label htmlFor="rs-driver" className="text-xs">Driver ID</Label>
              <Input id="rs-driver" value={driverId} onChange={(e) => setDriverId(e.target.value)}
                placeholder="(cuid)" className="h-9 text-xs font-mono" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="rs-weight" className="text-xs">Gross Weight (kg)</Label>
              <Input id="rs-weight" type="number" value={weight} onChange={(e) => setWeight(e.target.value)}
                placeholder="18000" className="h-9 text-xs" />
            </div>
            <div>
              <Label htmlFor="rs-cargo" className="text-xs">Cargo Description</Label>
              <Input id="rs-cargo" value={cargo} onChange={(e) => setCargo(e.target.value)}
                placeholder="Industrial machinery" className="h-9 text-xs" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button size="sm" className="bg-gold-gradient text-sovereign" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" aria-hidden /> : <Plus className="w-3.5 h-3.5 mr-1" aria-hidden />}
            Dispatch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Shipment detail (drill-down) ────────────────────────────────────────────

function ShipmentDetail({ shipmentId, onBack }: { shipmentId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const [borderForm, setBorderForm] = useState({
    borderName: "", country: "", crossingType: "ENTRY", sealNumber: "",
    customsDeclarationRef: "",
  });
  const [gpsForm, setGpsForm] = useState({ latitude: "", longitude: "", speed: "", heading: "" });
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [borderSubmitting, setBorderSubmitting] = useState(false);
  const [gpsSubmitting, setGpsSubmitting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["road-shipment", shipmentId],
    queryFn: async () => {
      try {
        const r = await fetch(`/api/sgtx/road-corridor/shipment/${shipmentId}`);
        if (!r.ok) return { shipment: null as any };
        const j = await r.json();
        return { shipment: j?.shipment || null };
      } catch {
        return { shipment: null as any };
      }
    },
    staleTime: 15_000,
  });

  const shipment = data?.shipment;

  const legs = useMemo(() => safeArray<any>(shipment?.corridor?.legs), [shipment]);
  const borders = useMemo(() => safeArray<any>(shipment?.borderCrossings), [shipment]);
  const gps = useMemo(() => safeArray<any>(shipment?.gpsTracking), [shipment]);

  async function transitionStatus(next: string) {
    setStatusUpdating(true);
    try {
      const r = await fetch(`/api/sgtx/road-corridor/shipment/${shipmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) {
        toast.error(j?.error || "Transition rejected");
        if (j?.allowed) toast.info(`Allowed: ${j.allowed.join(", ")}`);
      } else {
        toast.success(`Shipment → ${next}`);
        qc.invalidateQueries({ queryKey: ["road-shipment", shipmentId] });
        qc.invalidateQueries({ queryKey: ["road-shipments"] });
      }
    } catch (e: any) {
      toast.error(e?.message || "Network error");
    }
    setStatusUpdating(false);
  }

  async function recordBorder() {
    if (!borderForm.borderName || !borderForm.country) {
      toast.error("Border name and country are required");
      return;
    }
    setBorderSubmitting(true);
    try {
      const r = await fetch(`/api/sgtx/road-corridor/shipment/${shipmentId}/border-crossing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...borderForm,
          arrivedAt: new Date().toISOString(),
        }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) {
        toast.error(j?.error || "Failed to record border crossing");
      } else {
        toast.success("Border crossing recorded");
        setBorderForm({
          borderName: "", country: "", crossingType: "ENTRY", sealNumber: "",
          customsDeclarationRef: "",
        });
        qc.invalidateQueries({ queryKey: ["road-shipment", shipmentId] });
      }
    } catch (e: any) {
      toast.error(e?.message || "Network error");
    }
    setBorderSubmitting(false);
  }

  async function recordGps() {
    const lat = parseFloat(gpsForm.latitude);
    const lon = parseFloat(gpsForm.longitude);
    if (!isFinite(lat) || !isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      toast.error("Valid latitude (-90..90) and longitude (-180..180) required");
      return;
    }
    setGpsSubmitting(true);
    try {
      const r = await fetch(`/api/sgtx/road-corridor/shipment/${shipmentId}/gps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: lat,
          longitude: lon,
          speed: gpsForm.speed ? parseFloat(gpsForm.speed) : undefined,
          heading: gpsForm.heading ? parseFloat(gpsForm.heading) : undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) {
        toast.error(j?.error || "Failed to record GPS ping");
      } else {
        toast.success("GPS ping recorded");
        setGpsForm({ latitude: "", longitude: "", speed: "", heading: "" });
        qc.invalidateQueries({ queryKey: ["road-shipment", shipmentId] });
      }
    } catch (e: any) {
      toast.error(e?.message || "Network error");
    }
    setGpsSubmitting(false);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-gold" aria-hidden />
        <span className="ml-2 text-sm text-muted-foreground">Loading shipment…</span>
      </div>
    );
  }

  if (!shipment) {
    return (
      <EmptyState
        icon={Inbox}
        message="Shipment not found."
        action={<Button size="sm" variant="outline" onClick={onBack}>Back to list</Button>}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button size="sm" variant="outline" onClick={onBack}>
          <ArrowRight className="w-3.5 h-3.5 mr-1 rotate-180" aria-hidden /> Back to list
        </Button>
        <StatusPill value={shipment.status} />
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <Info label="USTN" value={shipment.ustn} mono />
          <Info label="Corridor" value={shipment.corridor?.corridorCode || "—"} mono />
          <Info label="Carrier" value={shipment.carrierGtid || "—"} mono />
          <Info label="Origin → Destination" value={`${shipment.corridor?.originCountry || "—"} → ${shipment.corridor?.destinationCountry || "—"}`} />
          <Info label="Gross Weight" value={`${(shipment.grossWeightKg || 0).toLocaleString()} kg`} />
          <Info label="Incoterm" value={shipment.incoterm || "—"} />
          <Info label="Started" value={fmtDateTime(shipment.startedAt)} />
          <Info label="Completed" value={fmtDateTime(shipment.completedAt)} />
          <Info label="Cargo" value={shipment.cargoDescription || "—"} />
        </div>
        <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-border">
          <span className="text-[0.65rem] text-muted-foreground self-center mr-1">Transition:</span>
          {["IN_TRANSIT", "AT_BORDER", "CLEARED", "DELIVERED", "CANCELLED"].map((s) => (
            <Button
              key={s}
              size="sm"
              variant="outline"
              disabled={statusUpdating || shipment.status === s}
              onClick={() => transitionStatus(s)}
              className="h-7 text-[0.65rem]"
            >
              {s}
            </Button>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Legs */}
        <Card className="p-4">
          <h4 className="font-display text-sm font-semibold mb-2 flex items-center gap-2">
            <Navigation className="w-4 h-4 text-gold" aria-hidden /> Corridor Legs
          </h4>
          {legs.length === 0 ? (
            <p className="text-xs text-muted-foreground">No legs defined for this corridor.</p>
          ) : (
            <ol className="space-y-2">
              {legs.map((leg: any, i: number) => (
                <li key={leg.id || i} className="text-xs border-l-2 border-gold/40 pl-2 py-1">
                  <div className="font-medium">
                    <span className="text-muted-foreground mr-1">#{leg.sequence || i + 1}</span>
                    {leg.originLocation} <ArrowRight className="w-3 h-3 inline text-muted-foreground" aria-hidden /> {leg.destinationLocation}
                  </div>
                  <div className="text-[0.65rem] text-muted-foreground">
                    {leg.borderCrossing ? `Border: ${leg.borderCrossing} · ` : ""}
                    {leg.distanceKm || 0} km · ~{leg.estimatedHours || 0}h
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>

        {/* Border crossings */}
        <Card className="p-4">
          <h4 className="font-display text-sm font-semibold mb-2 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-gold" aria-hidden /> Border Crossings
          </h4>
          {borders.length === 0 ? (
            <p className="text-xs text-muted-foreground">No border crossings recorded yet.</p>
          ) : (
            <ul className="space-y-2 mb-3 max-h-48 overflow-y-auto">
              {borders.map((b: any, i: number) => (
                <li key={b.id || i} className="text-xs border-l-2 border-muted-foreground/30 pl-2 py-1">
                  <div className="font-medium">
                    {b.borderName} <span className="text-muted-foreground">({b.country})</span>
                  </div>
                  <div className="text-[0.65rem] text-muted-foreground flex items-center gap-2">
                    <StatusPill value={b.crossingType} />
                    <StatusPill value={b.status} />
                  </div>
                  <div className="text-[0.65rem] text-muted-foreground">
                    Arrived: {fmtDateTime(b.arrivedAt)} · Cleared: {fmtDateTime(b.clearedAt)}
                  </div>
                  {b.sealNumber && <div className="text-[0.65rem] text-muted-foreground">Seal: {b.sealNumber}</div>}
                </li>
              ))}
            </ul>
          )}
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="grid grid-cols-2 gap-2">
              <Input value={borderForm.borderName} onChange={(e) => setBorderForm({ ...borderForm, borderName: e.target.value })}
                placeholder="Border name" className="h-8 text-xs" />
              <Input value={borderForm.country} onChange={(e) => setBorderForm({ ...borderForm, country: e.target.value.toUpperCase() })}
                placeholder="Country (ISO-2)" maxLength={3} className="h-8 text-xs uppercase" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <select
                value={borderForm.crossingType}
                onChange={(e) => setBorderForm({ ...borderForm, crossingType: e.target.value })}
                className="h-8 text-xs rounded-md border border-input bg-background px-2"
                aria-label="Crossing type"
              >
                <option value="EXIT">EXIT</option>
                <option value="ENTRY">ENTRY</option>
                <option value="TRANSIT">TRANSIT</option>
              </select>
              <Input value={borderForm.sealNumber} onChange={(e) => setBorderForm({ ...borderForm, sealNumber: e.target.value })}
                placeholder="Seal #" className="h-8 text-xs" />
              <Input value={borderForm.customsDeclarationRef} onChange={(e) => setBorderForm({ ...borderForm, customsDeclarationRef: e.target.value })}
                placeholder="Customs ref" className="h-8 text-xs" />
            </div>
            <Button size="sm" className="w-full bg-gold-gradient text-sovereign" onClick={recordBorder} disabled={borderSubmitting}>
              {borderSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" aria-hidden /> : <Plus className="w-3.5 h-3.5 mr-1" aria-hidden />}
              Record Border Crossing
            </Button>
          </div>
        </Card>

        {/* GPS trail */}
        <Card className="p-4">
          <h4 className="font-display text-sm font-semibold mb-2 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-gold" aria-hidden /> GPS Trail
          </h4>
          {gps.length === 0 ? (
            <p className="text-xs text-muted-foreground mb-3">No GPS pings recorded yet.</p>
          ) : (
            <ul className="space-y-1 mb-3 max-h-48 overflow-y-auto">
              {gps.slice(0, 20).map((p: any, i: number) => (
                <li key={p.id || i} className="text-[0.65rem] font-mono text-muted-foreground">
                  {p.latitude?.toFixed(4)}, {p.longitude?.toFixed(4)}
                  {p.speed != null && ` · ${p.speed.toFixed(1)} km/h`}
                  <span className="ml-1 text-muted-foreground/70">· {fmtDateTime(p.recordedAt)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" value={gpsForm.latitude} onChange={(e) => setGpsForm({ ...gpsForm, latitude: e.target.value })}
                placeholder="Latitude" className="h-8 text-xs" />
              <Input type="number" value={gpsForm.longitude} onChange={(e) => setGpsForm({ ...gpsForm, longitude: e.target.value })}
                placeholder="Longitude" className="h-8 text-xs" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" value={gpsForm.speed} onChange={(e) => setGpsForm({ ...gpsForm, speed: e.target.value })}
                placeholder="Speed (km/h)" className="h-8 text-xs" />
              <Input type="number" value={gpsForm.heading} onChange={(e) => setGpsForm({ ...gpsForm, heading: e.target.value })}
                placeholder="Heading (deg)" className="h-8 text-xs" />
            </div>
            <Button size="sm" className="w-full bg-gold-gradient text-sovereign" onClick={recordGps} disabled={gpsSubmitting}>
              {gpsSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" aria-hidden /> : <Plus className="w-3.5 h-3.5 mr-1" aria-hidden />}
              Record GPS Ping
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 3. Resources pane (Vehicles + Drivers)
// ════════════════════════════════════════════════════════════════════════════

function ResourcesPane() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <VehiclesCard />
      <DriversCard />
    </div>
  );
}

function VehiclesCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["road-vehicles"],
    queryFn: async () => {
      try {
        const r = await fetch("/api/sgtx/road-corridor/vehicle");
        if (!r.ok) return { vehicles: [] as any[] };
        const j = await r.json();
        return { vehicles: safeArray<any>(j?.vehicles || j) };
      } catch {
        return { vehicles: [] as any[] };
      }
    },
    staleTime: 60_000,
  });
  const vehicles = data?.vehicles || [];

  return (
    <Card className="p-4">
      <h4 className="font-display text-sm font-semibold mb-3 flex items-center gap-2">
        <Truck className="w-4 h-4 text-gold" aria-hidden /> Registered Vehicles
        <Badge variant="outline" className="ml-auto text-[0.6rem]">{vehicles.length}</Badge>
      </h4>
      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-4 h-4 animate-spin text-gold" aria-hidden />
        </div>
      ) : vehicles.length === 0 ? (
        <p className="text-xs text-muted-foreground">No vehicles registered.</p>
      ) : (
        <div className="overflow-x-auto scroll-gold rounded-md">
          <table className="w-full text-xs">
            <thead className="bg-muted/30 text-muted-foreground">
              <tr>
                <Th>Registration</Th>
                <Th>Type</Th>
                <Th className="text-right">Cap (kg)</Th>
                <Th>Capabilities</Th>
                <Th>Insurance Until</Th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v: any) => (
                <tr key={v.id} className="border-t border-border">
                  <td className="p-2 font-mono text-[0.65rem]">{v.vehicleRegistration}</td>
                  <td className="p-2"><StatusPill value={v.vehicleType} /></td>
                  <td className="p-2 text-right">{(v.capacityKg || 0).toLocaleString()}</td>
                  <td className="p-2">
                    <div className="flex gap-1 flex-wrap">
                      {v.dgCapability && <Badge variant="outline" className="text-[0.55rem] px-1 py-0">DG</Badge>}
                      {v.reeferCapability && <Badge variant="outline" className="text-[0.55rem] px-1 py-0">REEFER</Badge>}
                      {!v.dgCapability && !v.reeferCapability && (
                        <span className="text-muted-foreground text-[0.65rem]">standard</span>
                      )}
                    </div>
                  </td>
                  <td className="p-2 text-[0.65rem] text-muted-foreground">{fmtDate(v.insuranceValidUntil)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function DriversCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["road-drivers"],
    queryFn: async () => {
      try {
        const r = await fetch("/api/sgtx/road-corridor/driver");
        if (!r.ok) return { drivers: [] as any[] };
        const j = await r.json();
        return { drivers: safeArray<any>(j?.drivers || j) };
      } catch {
        return { drivers: [] as any[] };
      }
    },
    staleTime: 60_000,
  });
  const drivers = data?.drivers || [];

  return (
    <Card className="p-4">
      <h4 className="font-display text-sm font-semibold mb-3 flex items-center gap-2">
        <PackageCheck className="w-4 h-4 text-gold" aria-hidden /> Authorized Drivers
        <Badge variant="outline" className="ml-auto text-[0.6rem]">{drivers.length}</Badge>
      </h4>
      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-4 h-4 animate-spin text-gold" aria-hidden />
        </div>
      ) : drivers.length === 0 ? (
        <p className="text-xs text-muted-foreground">No drivers registered.</p>
      ) : (
        <div className="overflow-x-auto scroll-gold rounded-md">
          <table className="w-full text-xs">
            <thead className="bg-muted/30 text-muted-foreground">
              <tr>
                <Th>Full Name</Th>
                <Th>License #</Th>
                <Th>Visa Countries</Th>
                <Th>Auth</Th>
                <Th>License Until</Th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d: any) => (
                <tr key={d.id} className="border-t border-border">
                  <td className="p-2">{d.fullName}</td>
                  <td className="p-2 font-mono text-[0.65rem]">{d.licenseNumber || "—"}</td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-1">
                      {(safeArray<string>(d.visaCountries) || []).map((c) => (
                        <Badge key={c} variant="outline" className="text-[0.55rem] font-mono px-1 py-0">{c}</Badge>
                      ))}
                      {safeArray<string>(d.visaCountries).length === 0 && (
                        <span className="text-muted-foreground text-[0.65rem]">none</span>
                      )}
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="flex gap-1 flex-wrap">
                      {d.internationalLicense && <Badge variant="outline" className="text-[0.55rem] px-1 py-0">INTL</Badge>}
                      {d.dgAuthorization && <Badge variant="outline" className="text-[0.55rem] px-1 py-0">DG</Badge>}
                      {!d.internationalLicense && !d.dgAuthorization && (
                        <span className="text-muted-foreground text-[0.65rem]">basic</span>
                      )}
                    </div>
                  </td>
                  <td className="p-2 text-[0.65rem] text-muted-foreground">{fmtDate(d.licenseValidUntil)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ─── Small shared primitives ─────────────────────────────────────────────────

function Th({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return (
    <th scope="col" className={`text-left font-semibold p-2.5 whitespace-nowrap ${className}`}>
      {children}
    </th>
  );
}

function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[0.6rem] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`mt-0.5 ${mono ? "font-mono text-[0.7rem]" : ""} text-foreground`}>{value}</div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  message,
  action,
}: {
  icon: any;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="text-center py-12 flex flex-col items-center gap-2">
      <Icon className="w-6 h-6 text-muted-foreground/60" aria-hidden />
      <p className="text-sm text-muted-foreground max-w-md">{message}</p>
      {action}
    </div>
  );
}
