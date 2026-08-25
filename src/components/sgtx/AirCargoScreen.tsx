"use client";

// ════════════════════════════════════════════════════════════════════════════
// AirCargoScreen — SGTX Articles 47-52 AIR CARGO ENGINE portal surface (SHIP portal)
//
// Two-pane view:
//   • Top   — list of air bookings with a "Create booking" button + USTN filter.
//   • Drill — selected booking detail showing:
//       - flight info (origin → destination, scheduled/actual times, aircraft)
//       - waybills (MAWB / HAWB list + create dialog)
//       - pieces (cargo pieces with weight + dims)
//       - ULDs (containerised cargo with assignment dialog)
//       - status timeline (RCS/DEP/ARR/RCF/NFD/DLV milestones + record dialog)
//       - chargeable weight calculator (actual vs volumetric vs chargeable)
//
// Defensive everywhere — all API responses are normalised. The component works
// against an empty backend (missing Turso tables) and surfaces clean error
// states instead of crashing. Uses TanStack Query for fetching + invalidation
// on mutations.
//
// Companion to /api/sgtx/air-cargo/* (8 routes) and src/lib/sgtx/air-cargo.
// ════════════════════════════════════════════════════════════════════════════

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { SectionHeader } from "@/components/sgtx/widgets";
import { toast } from "sonner";
import {
  Plane, Plus, Loader2, AlertTriangle, ArrowLeft, ChevronRight,
  Package, Boxes, FileText, Activity, Scale,
} from "lucide-react";

// ─── Constants (mirrored from src/lib/sgtx/air-cargo) ─────────────────────────

const BOOKING_STATUSES = ["BOOKED", "CONFIRMED", "ACCEPTED", "DEPARTED", "ARRIVED", "DELIVERED", "CANCELLED"];
const STATUS_EVENT_TYPES = ["RCS", "DEP", "ARR", "RCF", "NFD", "DLV"];
const STATUS_EVENT_NAMES: Record<string, string> = {
  RCS: "Received for Shipment",
  DEP: "Departed",
  ARR: "Arrived",
  RCF: "Received at Consignee Facility",
  NFD: "Notified for Delivery",
  DLV: "Delivered",
};
const WAYBILL_TYPES = ["MAWB", "HAWB"];
const ULD_TYPES = ["AKE", "AKN", "PAJ", "PMC", "PAG", "PGA", "RKN", "RKP", "AAP"];

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
      year: "numeric", month: "short", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return String(v);
  }
}

function fmtKg(v: any): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "number" ? v : parseFloat(v);
  if (!isFinite(n)) return "—";
  return n.toLocaleString() + " kg";
}

function fmtNum(v: any, suffix = ""): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "number" ? v : parseFloat(v);
  if (!isFinite(n)) return "—";
  return n.toLocaleString() + suffix;
}

function StatusBadge({ value }: { value: any }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const s = String(value).toUpperCase();
  const tone =
    /DELIVERED|ARRIVED|CONFIRMED|ACCEPTED|ISSUED|EXECUTED/.test(s)
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
      : /BOOKED|PENDING|DRAFT|QUEUED|SCHEDULED/.test(s)
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
      : /CANCELLED|REJECTED|FAILED|VOID|DELAYED/.test(s)
      ? "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30"
      : "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30";
  return (
    <Badge variant="outline" className={`text-[0.6rem] font-semibold px-1.5 py-0 ${tone}`}>
      {s}
    </Badge>
  );
}

function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="text-center text-xs text-muted-foreground py-6">
        {message}
      </td>
    </tr>
  );
}

function ErrorCard({ message }: { message: string }) {
  if (!message) return null;
  return (
    <Card className="p-4 border-red-500/30 bg-red-500/5">
      <div className="flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
        <AlertTriangle className="h-4 w-4" />
        <span>{message}</span>
      </div>
    </Card>
  );
}

function LoadingRow({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="text-center py-6">
        <Loader2 className="h-4 w-4 animate-spin inline-block text-muted-foreground" />
      </td>
    </tr>
  );
}

// ─── Main AirCargoScreen ─────────────────────────────────────────────────────

export function AirCargoScreen({ data }: { data?: any }) {
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  if (selectedBookingId) {
    return (
      <AirBookingDetail
        bookingId={selectedBookingId}
        onBack={() => setSelectedBookingId(null)}
      />
    );
  }

  return (
    <div className="space-y-4 w-full max-w-7xl mx-auto">
      <SectionHeader
        title="Air Cargo Engine (Articles 47-52)"
        subtitle="Air booking, flight, airport, MAWB/HAWB waybill, piece, ULD, status events (RCS/DEP/ARR/RCF/NFD/DLV), chargeable weight"
        action={
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            New Booking
          </Button>
        }
      />

      <AirBookingsList onSelect={setSelectedBookingId} />

      <CreateBookingDialog open={showCreate} onOpenChange={setShowCreate} />
    </div>
  );
}

// ─── Air bookings list ─────────────────────────────────────────────────────────

function AirBookingsList({ onSelect }: { onSelect: (id: string) => void }) {
  const [filterUstn, setFilterUstn] = useState("");
  const [committedUstn, setCommittedUstn] = useState("");
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["air-cargo-bookings", committedUstn],
    queryFn: async () => {
      try {
        const url = committedUstn
          ? `/api/sgtx/air-cargo?ustn=${encodeURIComponent(committedUstn)}`
          : `/api/sgtx/air-cargo`;
        const r = await fetch(url);
        if (!r.ok) {
          const body = await r.text().catch(() => "");
          return { rows: [], error: `${r.status} ${r.statusText} ${body.slice(0, 200)}` };
        }
        const j = await r.json();
        return { rows: normalizeArray(j, "bookings"), error: null as string | null };
      } catch (e: any) {
        return { rows: [], error: e?.message || "fetch failed" };
      }
    },
  });

  const rows = data?.rows || [];
  const fetchError = data?.error;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-end gap-2 flex-wrap">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Filter by USTN</Label>
          <Input
            placeholder="e.g. SGTX-EG-TRD-001234-5B6C"
            value={filterUstn}
            onChange={(e) => setFilterUstn(e.target.value)}
            className="h-8 w-72 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter") setCommittedUstn(filterUstn.trim());
            }}
            aria-label="Filter by USTN"
          />
        </div>
        <Button size="sm" variant="secondary" className="h-8" onClick={() => setCommittedUstn(filterUstn.trim())}>
          Apply
        </Button>
        {committedUstn && (
          <Button size="sm" variant="ghost" className="h-8" onClick={() => { setFilterUstn(""); setCommittedUstn(""); }}>
            Clear
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-8 ml-auto"
          onClick={() => qc.invalidateQueries({ queryKey: ["air-cargo-bookings"] })}
          aria-label="Refresh bookings"
        >
          <Loader2 className="h-3.5 w-3.5 mr-1" /> Refresh
        </Button>
      </div>

      <ErrorCard message={fetchError || (error as any)?.message || ""} />

      <div className="overflow-x-auto scroll-gold rounded-md border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-[0.65rem] uppercase tracking-wide">
            <tr>
              <th scope="col" className="text-left p-2 font-medium">Booking Ref</th>
              <th scope="col" className="text-left p-2 font-medium">USTN</th>
              <th scope="col" className="text-left p-2 font-medium">Route</th>
              <th scope="col" className="text-left p-2 font-medium">Flight Date</th>
              <th scope="col" className="text-left p-2 font-medium">MAWB</th>
              <th scope="col" className="text-left p-2 font-medium">Status</th>
              <th scope="col" className="text-left p-2 font-medium">Created</th>
              <th scope="col" className="text-right p-2 font-medium">Open</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <LoadingRow colSpan={8} />
            ) : rows.length === 0 ? (
              <EmptyRow colSpan={8} message="No air bookings found. Click New Booking to create one." />
            ) : (
              rows.map((b: any) => (
                <tr key={b.id} className="border-t hover:bg-muted/30 transition-colors">
                  <td className="p-2 font-mono text-[0.7rem]">{b.bookingReference || "—"}</td>
                  <td className="p-2 font-mono text-[0.7rem]">{b.ustn || "—"}</td>
                  <td className="p-2">
                    <span className="font-mono">{b.originAirport || "?"}</span>
                    <ChevronRight className="inline h-3 w-3 mx-0.5 text-muted-foreground" />
                    <span className="font-mono">{b.destinationAirport || "?"}</span>
                  </td>
                  <td className="p-2">{fmtDate(b.flightDate)}</td>
                  <td className="p-2 font-mono text-[0.7rem]">{b.mawbNumber || "—"}</td>
                  <td className="p-2"><StatusBadge value={b.status} /></td>
                  <td className="p-2">{fmtDate(b.createdAt)}</td>
                  <td className="p-2 text-right">
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => onSelect(b.id)}>
                      Open
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="text-[0.65rem] text-muted-foreground">
        {rows.length} booking{rows.length === 1 ? "" : "s"} shown.
      </div>
    </Card>
  );
}

// ─── Create booking dialog ──────────────────────────────────────────────────────

function CreateBookingDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [ustn, setUstn] = useState("");
  const [shipperGtid, setShipperGtid] = useState("");
  const [consigneeGtid, setConsigneeGtid] = useState("");
  const [originAirport, setOriginAirport] = useState("");
  const [destinationAirport, setDestinationAirport] = useState("");
  const [flightDate, setFlightDate] = useState("");
  const [carrierGtid, setCarrierGtid] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!ustn || !originAirport || !destinationAirport) {
      toast.error("USTN, origin airport, and destination airport are required");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/sgtx/air-cargo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ustn: ustn.trim(),
          shipperGtid: shipperGtid.trim() || undefined,
          consigneeGtid: consigneeGtid.trim() || undefined,
          originAirport: originAirport.trim().toUpperCase(),
          destinationAirport: destinationAirport.trim().toUpperCase(),
          flightDate: flightDate || undefined,
          carrierGtid: carrierGtid.trim() || undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) {
        toast.error(j?.error || `Failed (${r.status})`);
      } else {
        toast.success(`Booking ${j.booking?.bookingReference || ""} created`);
        qc.invalidateQueries({ queryKey: ["air-cargo-bookings"] });
        setUstn(""); setShipperGtid(""); setConsigneeGtid("");
        setOriginAirport(""); setDestinationAirport("");
        setFlightDate(""); setCarrierGtid("");
        onOpenChange(false);
      }
    } catch (e: any) {
      toast.error(e?.message || "Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New Air Booking</DialogTitle>
          <DialogDescription>
            Create a top-level air cargo booking under a USTN. Once created, you
            can attach flight info, MAWB/HAWB waybills, pieces, ULDs, status
            events, and run the chargeable-weight calculator.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">USTN *</Label>
            <Input value={ustn} onChange={(e) => setUstn(e.target.value)} className="h-8 text-xs" placeholder="SGTX-EG-TRD-001234-5B6C" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Shipper GTID</Label>
            <Input value={shipperGtid} onChange={(e) => setShipperGtid(e.target.value)} className="h-8 text-xs" placeholder="SGTX-EG-TRD-000111-..." />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Consignee GTID</Label>
            <Input value={consigneeGtid} onChange={(e) => setConsigneeGtid(e.target.value)} className="h-8 text-xs" placeholder="SGTX-DE-TRD-001234-..." />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Origin Airport (IATA) *</Label>
            <Input value={originAirport} onChange={(e) => setOriginAirport(e.target.value)} className="h-8 text-xs uppercase" placeholder="CAI" maxLength={4} />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Destination Airport (IATA) *</Label>
            <Input value={destinationAirport} onChange={(e) => setDestinationAirport(e.target.value)} className="h-8 text-xs uppercase" placeholder="FRA" maxLength={4} />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Flight Date</Label>
            <Input type="datetime-local" value={flightDate} onChange={(e) => setFlightDate(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="flex flex-col gap-1 md:col-span-2">
            <Label className="text-xs">Carrier GTID</Label>
            <Input value={carrierGtid} onChange={(e) => setCarrierGtid(e.target.value)} className="h-8 text-xs" placeholder="SGTX-EG-SHP-000031-9E8F" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Create Booking
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Booking detail ───────────────────────────────────────────────────────────

function AirBookingDetail({ bookingId, onBack }: { bookingId: string; onBack: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["air-cargo-booking", bookingId],
    queryFn: async () => {
      try {
        const r = await fetch(`/api/sgtx/air-cargo/${encodeURIComponent(bookingId)}`);
        if (!r.ok) {
          const body = await r.text().catch(() => "");
          return { booking: null, error: `${r.status} ${r.statusText} ${body.slice(0, 200)}` };
        }
        const j = await r.json();
        return { booking: j?.booking || null, error: (!j?.ok && j?.error) ? j.error : null };
      } catch (e: any) {
        return { booking: null, error: e?.message || "fetch failed" };
      }
    },
  });

  const booking = data?.booking;
  const fetchError = data?.error || (error as any)?.message || "";

  return (
    <div className="space-y-4 w-full max-w-7xl mx-auto">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to bookings
      </button>

      <ErrorCard message={fetchError} />

      {isLoading ? (
        <Card className="p-6 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </Card>
      ) : !booking ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Booking not found or air cargo tables not yet provisioned.
        </Card>
      ) : (
        <>
          <Card className="p-4 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Plane className="h-4 w-4 text-gold" />
              <span className="font-mono text-base font-semibold">{booking.bookingReference}</span>
              <StatusBadge value={booking.status} />
              <span className="text-[0.7rem] text-muted-foreground ml-auto">id: {booking.id}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <div className="text-[0.6rem] text-muted-foreground uppercase">USTN</div>
                <div className="font-mono">{booking.ustn || "—"}</div>
              </div>
              <div>
                <div className="text-[0.6rem] text-muted-foreground uppercase">Route</div>
                <div className="font-mono">
                  {booking.originAirport} <ChevronRight className="inline h-3 w-3" /> {booking.destinationAirport}
                </div>
              </div>
              <div>
                <div className="text-[0.6rem] text-muted-foreground uppercase">Flight Date</div>
                <div>{fmtDate(booking.flightDate)}</div>
              </div>
              <div>
                <div className="text-[0.6rem] text-muted-foreground uppercase">MAWB Number</div>
                <div className="font-mono">{booking.mawbNumber || "—"}</div>
              </div>
              <div>
                <div className="text-[0.6rem] text-muted-foreground uppercase">Shipper GTID</div>
                <div className="font-mono text-[0.7rem]">{booking.shipperGtid || "—"}</div>
              </div>
              <div>
                <div className="text-[0.6rem] text-muted-foreground uppercase">Consignee GTID</div>
                <div className="font-mono text-[0.7rem]">{booking.consigneeGtid || "—"}</div>
              </div>
              <div>
                <div className="text-[0.6rem] text-muted-foreground uppercase">Carrier GTID</div>
                <div className="font-mono text-[0.7rem]">{booking.carrierGtid || "—"}</div>
              </div>
              <div>
                <div className="text-[0.6rem] text-muted-foreground uppercase">Created</div>
                <div>{fmtDate(booking.createdAt)}</div>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <WaybillsCard bookingId={bookingId} waybills={booking.waybills} />
            <PiecesCard bookingId={bookingId} pieces={booking.pieces} />
            <UldsCard bookingId={bookingId} ulds={booking.ulds} pieces={booking.pieces} />
            <ChargeableWeightCard bookingId={bookingId} cw={booking.chargeableWeight} />
          </div>

          <StatusEventsCard bookingId={bookingId} events={booking.statusEvents} />
        </>
      )}
    </div>
  );
}

// ─── Waybills card ─────────────────────────────────────────────────────────────

function WaybillsCard({ bookingId, waybills }: { bookingId: string; waybills: any[] }) {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [type, setType] = useState<"MAWB" | "HAWB">("MAWB");
  const [shipper, setShipper] = useState("");
  const [consignee, setConsignee] = useState("");
  const [saving, setSaving] = useState(false);

  const rows = normalizeArray(waybills);

  async function handleCreate() {
    setSaving(true);
    try {
      const r = await fetch(`/api/sgtx/air-cargo/${bookingId}/waybill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waybillType: type, shipper: shipper || undefined, consignee: consignee || undefined }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) toast.error(j?.error || `Failed (${r.status})`);
      else {
        toast.success(`${type} ${j.waybill?.waybillNumber || ""} issued`);
        qc.invalidateQueries({ queryKey: ["air-cargo-booking", bookingId] });
        setShowCreate(false); setShipper(""); setConsignee("");
      }
    } catch (e: any) {
      toast.error(e?.message || "Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-gold" />
        <h3 className="text-sm font-semibold">Waybills</h3>
        <span className="text-[0.65rem] text-muted-foreground ml-auto">{rows.length} record(s)</span>
        <Button size="sm" variant="secondary" className="h-7" onClick={() => setShowCreate(true)}>
          <Plus className="h-3 w-3 mr-1" /> New
        </Button>
      </div>
      <div className="overflow-x-auto scroll-gold rounded-md border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-[0.6rem] uppercase">
            <tr>
              <th scope="col" className="text-left p-2">Type</th>
              <th scope="col" className="text-left p-2">Number</th>
              <th scope="col" className="text-left p-2">Shipper</th>
              <th scope="col" className="text-left p-2">Consignee</th>
              <th scope="col" className="text-left p-2">Issued</th>
              <th scope="col" className="text-left p-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={6} message="No waybills yet." />
            ) : rows.map((w: any) => (
              <tr key={w.id} className="border-t hover:bg-muted/30">
                <td className="p-2"><Badge variant="outline" className="text-[0.55rem]">{w.waybillType}</Badge></td>
                <td className="p-2 font-mono text-[0.7rem]">{w.waybillNumber}</td>
                <td className="p-2 truncate max-w-[120px]">{w.shipper || "—"}</td>
                <td className="p-2 truncate max-w-[120px]">{w.consignee || "—"}</td>
                <td className="p-2">{fmtDate(w.issuedAt)}</td>
                <td className="p-2"><StatusBadge value={w.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue a Waybill</DialogTitle>
            <DialogDescription>
              MAWB = Master Air Waybill (carrier-issued). HAWB = House Air Waybill (forwarder-issued).
              If you omit the AWB number, an 11-digit IATA number with mod-11 check digit will be generated.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Waybill Type</Label>
              <Select value={type} onValueChange={(v: any) => setType(v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WAYBILL_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Shipper (optional)</Label>
              <Input value={shipper} onChange={(e) => setShipper(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Consignee (optional)</Label>
              <Input value={consignee} onChange={(e) => setConsignee(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />} Issue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─── Pieces card ───────────────────────────────────────────────────────────────

function PiecesCard({ bookingId, pieces }: { bookingId: string; pieces: any[] }) {
  const rows = normalizeArray(pieces);
  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Package className="h-4 w-4 text-gold" />
        <h3 className="text-sm font-semibold">Pieces</h3>
        <span className="text-[0.65rem] text-muted-foreground ml-auto">{rows.length} piece(s)</span>
      </div>
      <div className="overflow-x-auto scroll-gold rounded-md border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-[0.6rem] uppercase">
            <tr>
              <th scope="col" className="text-left p-2">#</th>
              <th scope="col" className="text-left p-2">SSCC</th>
              <th scope="col" className="text-right p-2">Weight</th>
              <th scope="col" className="text-right p-2">L×W×H (cm)</th>
              <th scope="col" className="text-right p-2">Vol (CBM)</th>
              <th scope="col" className="text-left p-2">Description</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={6} message="No pieces registered for this booking." />
            ) : rows.map((p: any) => (
              <tr key={p.id} className="border-t hover:bg-muted/30">
                <td className="p-2">{p.pieceNumber}</td>
                <td className="p-2 font-mono text-[0.7rem]">{p.sscc || "—"}</td>
                <td className="p-2 text-right">{fmtKg(p.weightKg)}</td>
                <td className="p-2 text-right text-[0.7rem] text-muted-foreground">
                  {p.lengthCm ?? "—"} × {p.widthCm ?? "—"} × {p.heightCm ?? "—"}
                </td>
                <td className="p-2 text-right">{fmtNum(p.volumeCbm, " m³")}</td>
                <td className="p-2 truncate max-w-[160px]">{p.description || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─── ULDs card ─────────────────────────────────────────────────────────────────

function UldsCard({ bookingId, ulds, pieces }: { bookingId: string; ulds: any[]; pieces: any[] }) {
  const qc = useQueryClient();
  const [showAssign, setShowAssign] = useState(false);
  const [uldNumber, setUldNumber] = useState("");
  const [uldType, setUldType] = useState("AKE");
  const [tareWeightKg, setTareWeightKg] = useState("");
  const [maxPayloadKg, setMaxPayloadKg] = useState("");
  const [selectedPieceIds, setSelectedPieceIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const rows = normalizeArray(ulds);
  const pieceRows = normalizeArray(pieces);

  async function handleAssign() {
    if (!uldNumber || !uldType) {
      toast.error("ULD number and type are required");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(`/api/sgtx/air-cargo/${bookingId}/uld`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uldNumber: uldNumber.trim().toUpperCase(),
          uldType,
          pieceIds: selectedPieceIds,
          tareWeightKg: tareWeightKg ? Number(tareWeightKg) : undefined,
          maxPayloadKg: maxPayloadKg ? Number(maxPayloadKg) : undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) toast.error(j?.error || `Failed (${r.status})`);
      else {
        toast.success(`ULD ${j.uld?.uldNumber} assigned`);
        qc.invalidateQueries({ queryKey: ["air-cargo-booking", bookingId] });
        setShowAssign(false);
        setUldNumber(""); setTareWeightKg(""); setMaxPayloadKg(""); setSelectedPieceIds([]);
      }
    } catch (e: any) {
      toast.error(e?.message || "Network error");
    } finally {
      setSaving(false);
    }
  }

  function togglePiece(id: string) {
    setSelectedPieceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Boxes className="h-4 w-4 text-gold" />
        <h3 className="text-sm font-semibold">ULDs</h3>
        <span className="text-[0.65rem] text-muted-foreground ml-auto">{rows.length} ULD(s)</span>
        <Button size="sm" variant="secondary" className="h-7" onClick={() => setShowAssign(true)}>
          <Plus className="h-3 w-3 mr-1" /> Assign
        </Button>
      </div>
      <div className="overflow-x-auto scroll-gold rounded-md border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-[0.6rem] uppercase">
            <tr>
              <th scope="col" className="text-left p-2">ULD Number</th>
              <th scope="col" className="text-left p-2">Type</th>
              <th scope="col" className="text-right p-2">Tare</th>
              <th scope="col" className="text-right p-2">Max Payload</th>
              <th scope="col" className="text-right p-2">Pieces</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={5} message="No ULDs assigned to this booking." />
            ) : rows.map((u: any) => {
              const contentsArr = Array.isArray(u.contentsArr) ? u.contentsArr
                : Array.isArray(u.contents) ? u.contents
                : (typeof u.contents === "string" ? safeJsonParseArr(u.contents) : []);
              return (
                <tr key={u.id} className="border-t hover:bg-muted/30">
                  <td className="p-2 font-mono text-[0.7rem]">{u.uldNumber}</td>
                  <td className="p-2"><Badge variant="outline" className="text-[0.55rem]">{u.uldType}</Badge></td>
                  <td className="p-2 text-right">{fmtKg(u.tareWeightKg)}</td>
                  <td className="p-2 text-right">{fmtKg(u.maxPayloadKg)}</td>
                  <td className="p-2 text-right">{contentsArr.length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={showAssign} onOpenChange={setShowAssign}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Assign a ULD</DialogTitle>
            <DialogDescription>
              Register a Unit Load Device (AKE / PMC / PAG / etc.) against this
              booking. Optionally select which pieces are inside it.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">ULD Number *</Label>
              <Input value={uldNumber} onChange={(e) => setUldNumber(e.target.value)} className="h-8 text-xs uppercase" placeholder="AKE12345MS" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">ULD Type</Label>
              <Select value={uldType} onValueChange={setUldType}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ULD_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Tare Weight (kg)</Label>
              <Input type="number" value={tareWeightKg} onChange={(e) => setTareWeightKg(e.target.value)} className="h-8 text-xs" placeholder="80" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Max Payload (kg)</Label>
              <Input type="number" value={maxPayloadKg} onChange={(e) => setMaxPayloadKg(e.target.value)} className="h-8 text-xs" placeholder="1500" />
            </div>
          </div>
          <div className="border rounded-md max-h-48 overflow-y-auto scroll-gold">
            <div className="text-[0.65rem] text-muted-foreground p-2 sticky top-0 bg-background/95 backdrop-blur">
              Select pieces to include in this ULD:
            </div>
            {pieceRows.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground text-center">No pieces registered yet.</div>
            ) : pieceRows.map((p: any) => (
              <label key={p.id} className="flex items-center gap-2 p-2 hover:bg-muted/30 cursor-pointer text-xs border-t">
                <input
                  type="checkbox"
                  checked={selectedPieceIds.includes(p.id)}
                  onChange={() => togglePiece(p.id)}
                  className="h-3.5 w-3.5"
                />
                <span className="font-mono">#{p.pieceNumber}</span>
                <span className="text-muted-foreground truncate">{p.sscc || p.description || "—"}</span>
                <span className="ml-auto text-muted-foreground">{fmtKg(p.weightKg)}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAssign(false)}>Cancel</Button>
            <Button onClick={handleAssign} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />} Assign ULD
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function safeJsonParseArr(s: any): any[] {
  if (!s) return [];
  if (Array.isArray(s)) return s;
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// ─── Chargeable weight card ────────────────────────────────────────────────────

function ChargeableWeightCard({ bookingId, cw }: { bookingId: string; cw: any }) {
  const qc = useQueryClient();
  const [ratePerKg, setRatePerKg] = useState("");
  const [computing, setComputing] = useState(false);

  // cw may be the persisted AirChargeableWeight row (from booking.chargeableWeight).
  const persisted = cw || null;

  async function handleCompute() {
    setComputing(true);
    try {
      const url = ratePerKg
        ? `/api/sgtx/air-cargo/${bookingId}/chargeable-weight?ratePerKg=${encodeURIComponent(ratePerKg)}`
        : `/api/sgtx/air-cargo/${bookingId}/chargeable-weight`;
      const r = await fetch(url);
      const j = await r.json();
      if (!r.ok || !j?.ok) {
        toast.error(j?.error || `Failed (${r.status})`);
      } else {
        toast.success(`Chargeable weight ${j.chargeableWeightKg} kg (${j.pieceCount} pieces)`);
        qc.invalidateQueries({ queryKey: ["air-cargo-booking", bookingId] });
      }
    } catch (e: any) {
      toast.error(e?.message || "Network error");
    } finally {
      setComputing(false);
    }
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Scale className="h-4 w-4 text-gold" />
        <h3 className="text-sm font-semibold">Chargeable Weight</h3>
        <span className="text-[0.65rem] text-muted-foreground ml-auto">IATA divisor 6000</span>
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="border rounded-md p-2">
          <div className="text-[0.55rem] text-muted-foreground uppercase">Actual</div>
          <div className="text-base font-bold">{fmtNum(persisted?.actualWeightKg, " kg")}</div>
        </div>
        <div className="border rounded-md p-2">
          <div className="text-[0.55rem] text-muted-foreground uppercase">Volumetric</div>
          <div className="text-base font-bold">{fmtNum(persisted?.volumetricWeightKg, " kg")}</div>
        </div>
        <div className="border rounded-md p-2 bg-gold/10">
          <div className="text-[0.55rem] text-muted-foreground uppercase">Chargeable</div>
          <div className="text-base font-bold text-gold">{fmtNum(persisted?.chargeableWeightKg, " kg")}</div>
        </div>
      </div>
      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1 flex-1">
          <Label className="text-xs">Rate per kg (optional)</Label>
          <Input
            type="number"
            value={ratePerKg}
            onChange={(e) => setRatePerKg(e.target.value)}
            className="h-8 text-xs"
            placeholder="12.50"
          />
        </div>
        <Button size="sm" onClick={handleCompute} disabled={computing}>
          {computing && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />} Compute
        </Button>
      </div>
      {persisted?.totalCharge != null && (
        <div className="text-xs text-right">
          Total charge: <span className="font-semibold">
            {persisted.currency || "USD"} {Number(persisted.totalCharge).toLocaleString()}
          </span>
        </div>
      )}
      <div className="text-[0.6rem] text-muted-foreground">
        Chargeable = max(actual, volumetric). Volumetric per piece = (L×W×H in cm) / 6000.
      </div>
    </Card>
  );
}

// ─── Status events card ────────────────────────────────────────────────────────

function StatusEventsCard({ bookingId, events }: { bookingId: string; events: any[] }) {
  const qc = useQueryClient();
  const [showRecord, setShowRecord] = useState(false);
  const [eventType, setEventType] = useState("RCS");
  const [airport, setAirport] = useState("");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  const rows = normalizeArray(events);

  async function handleRecord() {
    setSaving(true);
    try {
      const r = await fetch(`/api/sgtx/air-cargo/${bookingId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType,
          airport: airport.trim().toUpperCase() || undefined,
          remarks: remarks || undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) toast.error(j?.error || `Failed (${r.status})`);
      else {
        toast.success(`${eventType} milestone recorded (${STATUS_EVENT_NAMES[eventType]})`);
        qc.invalidateQueries({ queryKey: ["air-cargo-booking", bookingId] });
        qc.invalidateQueries({ queryKey: ["air-cargo-bookings"] });
        setShowRecord(false); setAirport(""); setRemarks("");
      }
    } catch (e: any) {
      toast.error(e?.message || "Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-gold" />
        <h3 className="text-sm font-semibold">Milestone Timeline</h3>
        <span className="text-[0.65rem] text-muted-foreground ml-auto">{rows.length} event(s)</span>
        <Button size="sm" variant="secondary" className="h-7" onClick={() => setShowRecord(true)}>
          <Plus className="h-3 w-3 mr-1" /> Record
        </Button>
      </div>
      <div className="space-y-1 max-h-96 overflow-y-auto scroll-gold">
        {rows.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground py-6">
            No milestones recorded yet. Record RCS to begin the air cargo lifecycle.
          </div>
        ) : rows.map((e: any) => (
          <div key={e.id} className="flex items-start gap-3 p-2 border-l-2 border-gold/30 hover:bg-muted/30">
            <div className="flex flex-col items-center mt-0.5">
              <div className="w-2 h-2 rounded-full bg-gold" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <Badge variant="outline" className="text-[0.55rem] font-mono">{e.eventType}</Badge>
                <span className="text-[0.7rem] text-muted-foreground">{STATUS_EVENT_NAMES[e.eventType] || "—"}</span>
                <span className="text-[0.65rem] text-muted-foreground ml-auto">{fmtDate(e.eventTime)}</span>
              </div>
              <div className="text-[0.7rem] text-muted-foreground mt-0.5">
                {e.airport && <span className="font-mono">{e.airport}</span>}
                {e.airport && e.remarks ? " · " : ""}
                {e.remarks && <span>{e.remarks}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={showRecord} onOpenChange={setShowRecord}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Milestone Event</DialogTitle>
            <DialogDescription>
              Air cargo milestones follow the IATA CXML event codes:
              RCS (Received for Shipment), DEP (Departed), ARR (Arrived),
              RCF (Received at Consignee Facility), NFD (Notified for Delivery),
              DLV (Delivered).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Event Type</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_EVENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      <span className="font-mono">{t}</span> <span className="text-muted-foreground">— {STATUS_EVENT_NAMES[t]}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Airport (IATA, optional)</Label>
              <Input value={airport} onChange={(e) => setAirport(e.target.value)} className="h-8 text-xs uppercase" placeholder="CAI" maxLength={4} />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Remarks (optional)</Label>
              <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} className="h-8 text-xs" placeholder="e.g. Accepted by GHA EgyptAir Cargo" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowRecord(false)}>Cancel</Button>
            <Button onClick={handleRecord} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />} Record Event
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
