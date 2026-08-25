"use client";

// ════════════════════════════════════════════════════════════════════════════
// RailScreen — SGTX Article 54 RAIL ENGINE portal surface (LSP portal)
//
// Two-pane view:
//   • Left / top  — list of rail bookings with a "Create booking" button.
//   • Right / bottom — drilled-in detail of a selected booking showing the
//     train + wagon roster (ordered by positionInTrain), CIM/SMGS consignment
//     notes, transit segments with customs guarantee, and the tracking
//     timeline (status events).
//
// Defensive everywhere — all API responses are normalised. The component
// works against an empty backend (missing Turso tables) and surfaces clean
// error states instead of crashing. Uses TanStack Query for fetching +
// invalidation on mutations.
//
// Companion to /api/sgtx/rail/* (8 routes) and src/lib/sgtx/rail/index.ts.
// ════════════════════════════════════════════════════════════════════════════

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { SectionHeader } from "@/components/sgtx/widgets";
import { toast } from "sonner";
import {
  Train, Plus, Loader2, AlertTriangle, ArrowLeft, ChevronRight,
  FileText, Route as RouteIcon, Clock,
} from "lucide-react";

// ─── Constants (mirrored from src/lib/sgtx/rail) ──────────────────────────────

const EVENT_TYPES = ["BOOKED", "LOADED", "DEPARTED", "AT_BORDER", "CUSTOMS_HOLD", "CUSTOMS_RELEASED", "ARRIVED", "UNLOADED", "DELIVERED"];
const NOTE_TYPES = ["CIM", "SMGS"];
const GUARANTEE_TYPES = ["TIR", "CIM", "BANK_GUARANTEE", "CUSTOMS_BOND"];

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
    return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
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

function fmtNum(v: any): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "number" ? v : parseInt(v, 10);
  if (!isFinite(n)) return "—";
  return String(n);
}

function StatusBadge({ value }: { value: any }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const s = String(value).toUpperCase();
  const tone =
    /CONFIRMED|DELIVERED|ARRIVED|COMPLETED|RELEASED|ISSUED|LOADED|UNLOADED/.test(s)
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
      : /BOOKED|PENDING|DRAFT|QUEUED|SCHEDULED/.test(s)
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
      : /CANCELLED|REJECTED|FAILED|HOLD|CRITICAL/.test(s)
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

// ─── Main RailScreen ─────────────────────────────────────────────────────────

export function RailScreen({ data }: { data?: any }) {
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  if (selectedBookingId) {
    return (
      <RailBookingDetail
        bookingId={selectedBookingId}
        onBack={() => setSelectedBookingId(null)}
      />
    );
  }

  return (
    <div className="space-y-4 w-full max-w-7xl mx-auto">
      <SectionHeader
        title="Rail Engine (Article 54)"
        subtitle="Rail booking, train, wagon, terminal, consignment (CIM/SMGS), transit, tracking, interchange, delivery"
        action={
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            New Booking
          </Button>
        }
      />

      <RailBookingsList onSelect={setSelectedBookingId} />

      <CreateBookingDialog open={showCreate} onOpenChange={setShowCreate} />
    </div>
  );
}

// ─── Rail bookings list ───────────────────────────────────────────────────────

function RailBookingsList({ onSelect }: { onSelect: (id: string) => void }) {
  const [filterUstn, setFilterUstn] = useState("");
  const [committedUstn, setCommittedUstn] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["rail-bookings", committedUstn],
    queryFn: async () => {
      try {
        const url = committedUstn
          ? `/api/sgtx/rail?ustn=${encodeURIComponent(committedUstn)}`
          : `/api/sgtx/rail`;
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
            placeholder="e.g. SGTX-DE-TRD-001234-5B6C"
            value={filterUstn}
            onChange={(e) => setFilterUstn(e.target.value)}
            className="h-8 w-72 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter") setCommittedUstn(filterUstn.trim());
            }}
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
        <div className="ml-auto text-xs text-muted-foreground">
          {rows.length} booking{rows.length === 1 ? "" : "s"}
        </div>
      </div>

      {fetchError ? (
        <ErrorCard message={`API error: ${fetchError}`} />
      ) : null}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Booking Ref</th>
              <th className="text-left px-3 py-2 font-medium">USTN</th>
              <th className="text-left px-3 py-2 font-medium">Origin</th>
              <th className="text-left px-3 py-2 font-medium">Destination</th>
              <th className="text-left px-3 py-2 font-medium">Carrier</th>
              <th className="text-right px-3 py-2 font-medium">Gross Wt</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-left px-3 py-2 font-medium">Created</th>
              <th className="text-right px-3 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <LoadingRow colSpan={9} />
            ) : rows.length === 0 ? (
              <EmptyRow colSpan={9} message={fetchError ? "— see error above —" : "No rail bookings yet. Click 'New Booking' to create one."} />
            ) : (
              rows.map((b: any) => (
                <tr key={b.id} className="border-t hover:bg-muted/20">
                  <td className="px-3 py-2 font-mono">{b.bookingReference || "—"}</td>
                  <td className="px-3 py-2 font-mono">{b.ustn || "—"}</td>
                  <td className="px-3 py-2">{b.originTerminal || "—"}</td>
                  <td className="px-3 py-2">{b.destinationTerminal || "—"}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{b.carrierGtid || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtKg(b.grossWeightKg)}</td>
                  <td className="px-3 py-2"><StatusBadge value={b.status} /></td>
                  <td className="px-3 py-2 text-muted-foreground">{fmtDate(b.createdAt)}</td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => onSelect(b.id)}>
                      Open <ChevronRight className="h-3 w-3 ml-0.5" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─── Booking detail (drill-in) ────────────────────────────────────────────────

function RailBookingDetail({ bookingId, onBack }: { bookingId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["rail-booking", bookingId],
    queryFn: async () => {
      try {
        const r = await fetch(`/api/sgtx/rail/${encodeURIComponent(bookingId)}`);
        if (!r.ok) {
          const body = await r.text().catch(() => "");
          return { booking: null, error: `${r.status} ${r.statusText} ${body.slice(0, 200)}` };
        }
        const j = await r.json();
        return { booking: j?.booking || null, error: null as string | null };
      } catch (e: any) {
        return { booking: null, error: e?.message || "fetch failed" };
      }
    },
  });

  const booking = data?.booking;
  const fetchError = data?.error;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["rail-booking", bookingId] });
    qc.invalidateQueries({ queryKey: ["rail-bookings"] });
  };

  if (isLoading) {
    return (
      <div className="space-y-4 w-full max-w-7xl mx-auto">
        <SectionHeader title="Rail Booking" subtitle="Loading…" />
        <Card className="p-8 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </Card>
      </div>
    );
  }

  if (fetchError || !booking) {
    return (
      <div className="space-y-4 w-full max-w-7xl mx-auto">
        <Button size="sm" variant="ghost" onClick={onBack} className="h-8">
          <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to list
        </Button>
        <SectionHeader title="Rail Booking" subtitle="Could not load this booking" />
        <ErrorCard message={fetchError || "Booking not found"} />
      </div>
    );
  }

  return (
    <div className="space-y-4 w-full max-w-7xl mx-auto">
      <Button size="sm" variant="ghost" onClick={onBack} className="h-8">
        <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to list
      </Button>

      <SectionHeader
        title={`Booking ${booking.bookingReference || ""}`}
        subtitle={`USTN ${booking.ustn} · ${booking.originTerminal} → ${booking.destinationTerminal} · ${booking.incoterm || "—"}`}
        action={<StatusBadge value={booking.status} />}
      />

      {/* Top summary card */}
      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <SummaryItem label="Shipper GTID" value={booking.shipperGtid} mono />
          <SummaryItem label="Consignee GTID" value={booking.consigneeGtid} mono />
          <SummaryItem label="Carrier GTID" value={booking.carrierGtid} mono />
          <SummaryItem label="Train ID" value={booking.train?.trainNumber || booking.trainId} mono />
          <SummaryItem label="Gross Weight" value={fmtKg(booking.grossWeightKg)} />
          <SummaryItem label="Incoterm" value={booking.incoterm} />
          <SummaryItem label="Cargo" value={booking.cargoDescription} />
          <SummaryItem label="Created" value={fmtDate(booking.createdAt)} />
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Train + Wagons */}
        <Card className="p-4 space-y-3">
          <SectionTitle icon={<Train className="h-4 w-4" />} title="Train & Wagons" subtitle="Ordered by positionInTrain" />
          <TrainAndWagons booking={booking} />
        </Card>

        {/* Status timeline */}
        <Card className="p-4 space-y-3">
          <SectionTitle icon={<Clock className="h-4 w-4" />} title="Tracking Timeline" subtitle="Status events (newest first)" />
          <StatusTimeline booking={booking} />
          <RecordEventInline bookingId={booking.id} onRecorded={invalidate} />
        </Card>

        {/* Consignment notes */}
        <Card className="p-4 space-y-3">
          <SectionTitle icon={<FileText className="h-4 w-4" />} title="Consignment Notes" subtitle="CIM (Western Europe) / SMGS (CIS gauge)" />
          <ConsignmentsList booking={booking} />
          <CreateConsignmentInline bookingId={booking.id} onCreated={invalidate} />
        </Card>

        {/* Transit segments */}
        <Card className="p-4 space-y-3">
          <SectionTitle icon={<RouteIcon className="h-4 w-4" />} title="Transit Segments" subtitle="Customs guarantee per leg (TIR / CIM / Bank / Bond)" />
          <TransitList booking={booking} />
          <CreateTransitInline bookingId={booking.id} onCreated={invalidate} />
        </Card>
      </div>
    </div>
  );
}

function SummaryItem({ label, value, mono }: { label: string; value: any; mono?: boolean }) {
  return (
    <div>
      <div className="text-[0.65rem] uppercase text-muted-foreground tracking-wide">{label}</div>
      <div className={`text-xs mt-0.5 ${mono ? "font-mono" : ""} truncate`}>{value || "—"}</div>
    </div>
  );
}

function SectionTitle({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="text-[0.7rem] text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

// ─── Sub-sections inside the booking detail ───────────────────────────────────

function TrainAndWagons({ booking }: { booking: any }) {
  const train = booking.train;
  const wagons: any[] = booking.wagons || [];
  if (!train && wagons.length === 0) {
    return (
      <div className="text-xs text-muted-foreground py-4 text-center">
        No train or wagons assigned to this booking.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {train && (
        <div className="rounded-md border bg-muted/20 p-3 text-xs space-y-1">
          <div className="flex items-center gap-2">
            <Train className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-mono font-semibold">{train.trainNumber}</span>
            <StatusBadge value={train.status} />
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1 text-muted-foreground">
            <span>Operator: <span className="font-mono">{train.operatorGtid || "—"}</span></span>
            <span>Wagons: <span className="tabular-nums">{fmtNum(train.totalWagons)}</span></span>
            <span>Max payload: <span className="tabular-nums">{fmtKg(train.maxPayloadKg)}</span></span>
            <span>Sched. dep.: <span>{fmtDate(train.scheduledDeparture)}</span></span>
            <span>Actual dep.: <span>{fmtDate(train.actualDeparture)}</span></span>
            <span>Sched. arr.: <span>{fmtDate(train.scheduledArrival)}</span></span>
          </div>
        </div>
      )}

      {wagons.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="text-left px-2 py-1.5 font-medium">#</th>
                <th className="text-left px-2 py-1.5 font-medium">Wagon</th>
                <th className="text-left px-2 py-1.5 font-medium">Type</th>
                <th className="text-right px-2 py-1.5 font-medium">Tare</th>
                <th className="text-right px-2 py-1.5 font-medium">Max Load</th>
                <th className="text-right px-2 py-1.5 font-medium">Length</th>
                <th className="text-left px-2 py-1.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {wagons.map((w: any, idx: number) => (
                <tr key={w.id || idx} className="border-t">
                  <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{w.positionInTrain ?? idx + 1}</td>
                  <td className="px-2 py-1.5 font-mono">{w.wagonNumber}</td>
                  <td className="px-2 py-1.5"><Badge variant="outline" className="text-[0.55rem] px-1 py-0">{w.wagonType || "FLAT"}</Badge></td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtKg(w.tareWeightKg)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtKg(w.maxPayloadKg)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{w.lengthM ? `${w.lengthM} m` : "—"}</td>
                  <td className="px-2 py-1.5"><StatusBadge value={w.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusTimeline({ booking }: { booking: any }) {
  const events: any[] = booking.statusEvents || [];
  if (events.length === 0) {
    return <div className="text-xs text-muted-foreground py-3 text-center">No status events yet.</div>;
  }
  return (
    <ol className="space-y-2 max-h-72 overflow-y-auto pr-1">
      {events.map((ev: any, idx: number) => (
        <li key={ev.id || idx} className="flex gap-2 text-xs">
          <div className="flex flex-col items-center pt-0.5">
            <div className={`h-2 w-2 rounded-full ${EVENT_DOT_TONE[ev.eventType as keyof typeof EVENT_DOT_TONE] || "bg-slate-400"}`} />
            {idx < events.length - 1 && <div className="w-px flex-1 bg-border mt-0.5" style={{ minHeight: 12 }} />}
          </div>
          <div className="flex-1 pb-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{ev.eventType}</span>
              <span className="text-muted-foreground text-[0.7rem]">{fmtDate(ev.eventTime)}</span>
            </div>
            {ev.terminal && <div className="text-muted-foreground text-[0.7rem]">Terminal: {ev.terminal}</div>}
            {ev.remarks && <div className="text-muted-foreground mt-0.5">{ev.remarks}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

const EVENT_DOT_TONE: Record<string, string> = {
  BOOKED: "bg-amber-500",
  LOADED: "bg-emerald-500",
  DEPARTED: "bg-blue-500",
  AT_BORDER: "bg-purple-500",
  CUSTOMS_HOLD: "bg-red-500",
  CUSTOMS_RELEASED: "bg-emerald-500",
  ARRIVED: "bg-cyan-500",
  UNLOADED: "bg-emerald-500",
  DELIVERED: "bg-emerald-600",
};

function ConsignmentsList({ booking }: { booking: any }) {
  const consignments: any[] = booking.consignments || [];
  if (consignments.length === 0) {
    return <div className="text-xs text-muted-foreground py-3 text-center">No consignment notes issued yet.</div>;
  }
  return (
    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
      {consignments.map((c: any, idx: number) => (
        <div key={c.id || idx} className="rounded-md border p-2 text-xs space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[0.55rem] px-1 py-0">{c.noteType || "CIM"}</Badge>
            <span className="font-mono">{c.consignmentNoteNumber}</span>
            <StatusBadge value={c.status} />
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-muted-foreground">
            <span>Shipper: {c.shipper || "—"}</span>
            <span>Consignee: {c.consignee || "—"}</span>
            <span>HS: <span className="font-mono">{c.hsCode || "—"}</span></span>
            <span>Packages: <span className="tabular-nums">{fmtNum(c.packageCount)}</span></span>
            <span>Gross wt: <span className="tabular-nums">{fmtKg(c.grossWeightKg)}</span></span>
            <span>Issued: {fmtDate(c.issuedAt)}</span>
          </div>
          {c.goodsDescription && <div className="text-muted-foreground">{c.goodsDescription}</div>}
          {Array.isArray(c.specialConditions) && c.specialConditions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {c.specialConditions.map((sc: string, i: number) => (
                <Badge key={i} variant="secondary" className="text-[0.55rem] px-1 py-0">{sc}</Badge>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function TransitList({ booking }: { booking: any }) {
  const segments: any[] = booking.transitSegments || [];
  if (segments.length === 0) {
    return <div className="text-xs text-muted-foreground py-3 text-center">No transit segments recorded yet.</div>;
  }
  return (
    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
      {segments.map((t: any, idx: number) => (
        <div key={t.id || idx} className="rounded-md border p-2 text-xs space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[0.55rem] px-1 py-0">{t.transitGuaranteeType || "TIR"}</Badge>
            <StatusBadge value={t.status} />
            <span className="font-mono text-muted-foreground">{t.guaranteeReference || "—"}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-muted-foreground">
            <span>From: {t.originTerminal || "—"}</span>
            <span>To: {t.destinationTerminal || "—"}</span>
            <span>Started: {fmtDate(t.startedAt)}</span>
            <span>Completed: {fmtDate(t.completedAt)}</span>
          </div>
          {Array.isArray(t.transitCountries) && t.transitCountries.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {t.transitCountries.map((cc: string, i: number) => (
                <Badge key={i} variant="secondary" className="text-[0.55rem] px-1 py-0 font-mono">{cc}</Badge>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Inline mutation helpers (small forms inside the detail cards) ───────────

function RecordEventInline({ bookingId, onRecorded }: { bookingId: string; onRecorded: () => void }) {
  const [eventType, setEventType] = useState<string>("");
  const [terminal, setTerminal] = useState("");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!eventType) {
      toast.error("Select an event type first");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/sgtx/rail/${encodeURIComponent(bookingId)}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType, terminal: terminal || undefined, remarks: remarks || undefined }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        toast.error(j.error || `HTTP ${r.status}`);
      } else {
        toast.success(`Recorded ${eventType} event`);
        setEventType("");
        setTerminal("");
        setRemarks("");
        onRecorded();
      }
    } catch (e: any) {
      toast.error(e?.message || "Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-dashed p-2 space-y-2">
      <div className="text-[0.7rem] font-medium text-muted-foreground">Record new status event</div>
      <div className="grid grid-cols-2 gap-2">
        <Select value={eventType} onValueChange={setEventType}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Event type" /></SelectTrigger>
          <SelectContent>
            {EVENT_TYPES.map((t) => (<SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>))}
          </SelectContent>
        </Select>
        <Input placeholder="Terminal (optional)" value={terminal} onChange={(e) => setTerminal(e.target.value)} className="h-8 text-xs" />
      </div>
      <Textarea placeholder="Remarks (optional)" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} className="text-xs" />
      <Button size="sm" className="h-7 w-full" disabled={busy || !eventType} onClick={submit}>
        {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Clock className="h-3 w-3 mr-1" />}
        Record Event
      </Button>
    </div>
  );
}

function CreateConsignmentInline({ bookingId, onCreated }: { bookingId: string; onCreated: () => void }) {
  const [noteNumber, setNoteNumber] = useState("");
  const [noteType, setNoteType] = useState("CIM");
  const [shipper, setShipper] = useState("");
  const [consignee, setConsignee] = useState("");
  const [hsCode, setHsCode] = useState("");
  const [grossWeightKg, setGrossWeightKg] = useState("");
  const [packageCount, setPackageCount] = useState("");
  const [goodsDescription, setGoodsDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!noteNumber) {
      toast.error("Consignment note number is required");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/sgtx/rail/${encodeURIComponent(bookingId)}/consignment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consignmentNoteNumber: noteNumber,
          noteType,
          shipper: shipper || undefined,
          consignee: consignee || undefined,
          hsCode: hsCode || undefined,
          grossWeightKg: grossWeightKg ? parseFloat(grossWeightKg) : undefined,
          packageCount: packageCount ? parseInt(packageCount, 10) : undefined,
          goodsDescription: goodsDescription || undefined,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        toast.error(j.error || `HTTP ${r.status}`);
      } else {
        toast.success(`Consignment ${noteNumber} issued (${noteType})`);
        setNoteNumber(""); setShipper(""); setConsignee(""); setHsCode("");
        setGrossWeightKg(""); setPackageCount(""); setGoodsDescription("");
        onCreated();
      }
    } catch (e: any) {
      toast.error(e?.message || "Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-dashed p-2 space-y-2">
      <div className="text-[0.7rem] font-medium text-muted-foreground">Issue new consignment note</div>
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Note number" value={noteNumber} onChange={(e) => setNoteNumber(e.target.value)} className="h-8 text-xs" />
        <Select value={noteType} onValueChange={setNoteType}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {NOTE_TYPES.map((t) => (<SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>))}
          </SelectContent>
        </Select>
        <Input placeholder="Shipper" value={shipper} onChange={(e) => setShipper(e.target.value)} className="h-8 text-xs" />
        <Input placeholder="Consignee" value={consignee} onChange={(e) => setConsignee(e.target.value)} className="h-8 text-xs" />
        <Input placeholder="HS code" value={hsCode} onChange={(e) => setHsCode(e.target.value)} className="h-8 text-xs font-mono" />
        <Input placeholder="Gross weight (kg)" type="number" value={grossWeightKg} onChange={(e) => setGrossWeightKg(e.target.value)} className="h-8 text-xs" />
        <Input placeholder="Package count" type="number" value={packageCount} onChange={(e) => setPackageCount(e.target.value)} className="h-8 text-xs" />
        <Input placeholder="Goods description" value={goodsDescription} onChange={(e) => setGoodsDescription(e.target.value)} className="h-8 text-xs" />
      </div>
      <Button size="sm" className="h-7 w-full" disabled={busy || !noteNumber} onClick={submit}>
        {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <FileText className="h-3 w-3 mr-1" />}
        Issue Note
      </Button>
    </div>
  );
}

function CreateTransitInline({ bookingId, onCreated }: { bookingId: string; onCreated: () => void }) {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [countries, setCountries] = useState("");
  const [guaranteeType, setGuaranteeType] = useState("TIR");
  const [guaranteeRef, setGuaranteeRef] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/sgtx/rail/${encodeURIComponent(bookingId)}/transit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originTerminal: origin || undefined,
          destinationTerminal: destination || undefined,
          transitCountries: countries
            ? countries.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
            : undefined,
          transitGuaranteeType: guaranteeType,
          guaranteeReference: guaranteeRef || undefined,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        toast.error(j.error || `HTTP ${r.status}`);
      } else {
        toast.success(`Transit segment created (${guaranteeType})`);
        setOrigin(""); setDestination(""); setCountries(""); setGuaranteeRef("");
        onCreated();
      }
    } catch (e: any) {
      toast.error(e?.message || "Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-dashed p-2 space-y-2">
      <div className="text-[0.7rem] font-medium text-muted-foreground">Add transit segment</div>
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Origin terminal" value={origin} onChange={(e) => setOrigin(e.target.value)} className="h-8 text-xs" />
        <Input placeholder="Destination terminal" value={destination} onChange={(e) => setDestination(e.target.value)} className="h-8 text-xs" />
        <Input placeholder="Countries (DE,AT,HU,RO)" value={countries} onChange={(e) => setCountries(e.target.value)} className="h-8 text-xs font-mono col-span-2" />
        <Select value={guaranteeType} onValueChange={setGuaranteeType}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {GUARANTEE_TYPES.map((t) => (<SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>))}
          </SelectContent>
        </Select>
        <Input placeholder="Guarantee reference" value={guaranteeRef} onChange={(e) => setGuaranteeRef(e.target.value)} className="h-8 text-xs font-mono" />
      </div>
      <Button size="sm" className="h-7 w-full" disabled={busy} onClick={submit}>
        {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RouteIcon className="h-3 w-3 mr-1" />}
        Add Segment
      </Button>
    </div>
  );
}

// ─── Create-booking dialog (top-level "New Booking" button) ──────────────────

function CreateBookingDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [ustn, setUstn] = useState("");
  const [bookingReference, setBookingReference] = useState("");
  const [originTerminal, setOriginTerminal] = useState("");
  const [destinationTerminal, setDestinationTerminal] = useState("");
  const [shipperGtid, setShipperGtid] = useState("");
  const [consigneeGtid, setConsigneeGtid] = useState("");
  const [carrierGtid, setCarrierGtid] = useState("");
  const [grossWeightKg, setGrossWeightKg] = useState("");
  const [incoterm, setIncoterm] = useState("");
  const [cargoDescription, setCargoDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setUstn(""); setBookingReference(""); setOriginTerminal(""); setDestinationTerminal("");
    setShipperGtid(""); setConsigneeGtid(""); setCarrierGtid(""); setGrossWeightKg("");
    setIncoterm(""); setCargoDescription("");
  };

  const submit = async () => {
    if (!ustn || !bookingReference || !originTerminal || !destinationTerminal) {
      toast.error("USTN, booking reference, origin and destination terminals are required");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/sgtx/rail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ustn, bookingReference, originTerminal, destinationTerminal,
          shipperGtid: shipperGtid || undefined,
          consigneeGtid: consigneeGtid || undefined,
          carrierGtid: carrierGtid || undefined,
          grossWeightKg: grossWeightKg ? parseFloat(grossWeightKg) : undefined,
          incoterm: incoterm || undefined,
          cargoDescription: cargoDescription || undefined,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        toast.error(j.error || `HTTP ${r.status}`);
      } else {
        toast.success(`Rail booking ${bookingReference} created`);
        reset();
        onOpenChange(false);
        qc.invalidateQueries({ queryKey: ["rail-bookings"] });
      }
    } catch (e: any) {
      toast.error(e?.message || "Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Train className="h-4 w-4" /> New Rail Booking</DialogTitle>
          <DialogDescription>
            Create a new rail booking under a USTN. A "BOOKED" status event will be recorded automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-2">
          <Field label="USTN *">
            <Input value={ustn} onChange={(e) => setUstn(e.target.value)} className="h-8 text-xs font-mono" placeholder="SGTX-DE-TRD-001234-5B6C" />
          </Field>
          <Field label="Booking Reference *">
            <Input value={bookingReference} onChange={(e) => setBookingReference(e.target.value)} className="h-8 text-xs font-mono" placeholder="RB-2026-001" />
          </Field>
          <Field label="Origin Terminal *">
            <Input value={originTerminal} onChange={(e) => setOriginTerminal(e.target.value)} className="h-8 text-xs font-mono" placeholder="CAI-RT" />
          </Field>
          <Field label="Destination Terminal *">
            <Input value={destinationTerminal} onChange={(e) => setDestinationTerminal(e.target.value)} className="h-8 text-xs font-mono" placeholder="HAM-RT" />
          </Field>
          <Field label="Shipper GTID">
            <Input value={shipperGtid} onChange={(e) => setShipperGtid(e.target.value)} className="h-8 text-xs font-mono" />
          </Field>
          <Field label="Consignee GTID">
            <Input value={consigneeGtid} onChange={(e) => setConsigneeGtid(e.target.value)} className="h-8 text-xs font-mono" />
          </Field>
          <Field label="Carrier GTID">
            <Input value={carrierGtid} onChange={(e) => setCarrierGtid(e.target.value)} className="h-8 text-xs font-mono" />
          </Field>
          <Field label="Incoterm">
            <Input value={incoterm} onChange={(e) => setIncoterm(e.target.value)} className="h-8 text-xs font-mono" placeholder="CIP" />
          </Field>
          <Field label="Gross Weight (kg)">
            <Input type="number" value={grossWeightKg} onChange={(e) => setGrossWeightKg(e.target.value)} className="h-8 text-xs" />
          </Field>
          <Field label="Cargo Description" full>
            <Textarea value={cargoDescription} onChange={(e) => setCargoDescription(e.target.value)} rows={2} className="text-xs" />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
            Create Booking
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 ${full ? "col-span-2" : ""}`}>
      <Label className="text-[0.7rem] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
