"use client";

// =============================================================================
// SGTX — Container Compliance Dashboard (VGM + DG + Seals)
// =============================================================================
// Per-container compliance grid for a single trade. For each TradeContainer
// the panel renders:
//   • VGM status (compliant / non-compliant / exempt) with kg value, method,
//     verifier + timestamp. Inline form to submit a new VGM.
//   • Dangerous Goods status (declared / not-declared). When `isDangerous`,
//     surfaces IMDG class, UN number, packing group, flashpoint. Inline form
//     to file a DG declaration.
//   • Seal status (seal #1 + #2 + verifier + verified-at + break info).
//     Inline form to record seals.
//   • Overall compliance verdict (canLoad / blocked) + list of blockers.
// A "Segregation Check" button runs an IMDG segregation analysis across all
// DG-flagged containers on the shipment (POST /dangerous-goods/segregation-check).
//
// Theme: gold / amber / emerald / rose — matches existing SGTX style.
// All fetches use `fetch()` with a 15s AbortController timeout and are wrapped
// in try/catch. Loading / empty / error states are friendly.
// =============================================================================

import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Flame,
  Loader2,
  Lock,
  Package,
  RefreshCw,
  Scale,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { fmtDateTime, fmtKg } from "@/lib/sgtx/format";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const REQUEST_TIMEOUT_MS = 15_000;

// -----------------------------------------------------------------------------
// Types — narrow mirrors of the Prisma `TradeContainer`, `VgmVerification`
// and `DangerousGoodsDeclaration` rows.
// -----------------------------------------------------------------------------

interface TradeContainerRow {
  id: string;
  sequence: number;
  originCountry: string;
  destCountry: string;
  port: string;
  containerSize: string | null;
  commodities: string;
  // VGM
  vgmKg: number | null;
  vgmMethod: string | null;
  vgmVerifiedAt: string | null;
  vgmVerifiedBy: string | null;
  vgmExempt: boolean;
  // Seals
  sealNumber1: string | null;
  sealNumber2: string | null;
  sealVerifiedAt: string | null;
  sealVerifiedBy: string | null;
  sealBrokenAt: string | null;
  sealBreakReason: string | null;
  // DG
  isDangerous: boolean;
  imdgClass: string | null;
  unNumber: string | null;
  properShippingName: string | null;
  packingGroup: string | null;
  flashpointC: number | null;
  marinePollutant: boolean;
  emergencyContact: string | null;
}

interface VgmRow {
  id: string;
  containerId: string;
  vgmKg: number;
  vgmMethod: string;
  weigherName: string | null;
  weigherGtid: string | null;
  verifiedAt: string;
  notes: string | null;
}

interface DgRow {
  id: string;
  containerId: string;
  shippingName: string;
  imdgClass: string;
  unNumber: string;
  packingGroup: string;
  flashpointC: number | null;
  marinePollutant: boolean;
  emergencyContact: string;
  declarantName: string;
  declarantSigned: boolean;
  createdAt: string;
}

interface SegregationConflict {
  container1: string;
  container2: string;
  rule?: string;
  severity?: string;
  classPair?: string;
}

interface SegregationResult {
  compliant: boolean;
  conflicts: SegregationConflict[];
  checked: number;
  dangerousCount: number;
  note?: string;
}

// -----------------------------------------------------------------------------
// fetchWithTimeout — shared helper for all client-side API calls.
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
// Compliance verdict helpers
// -----------------------------------------------------------------------------

interface ComplianceVerdict {
  canLoad: boolean;
  vgmCompliant: boolean;
  dgCompliant: boolean;
  sealsPresent: boolean;
  blockers: string[];
}

function deriveVerdict(c: TradeContainerRow): ComplianceVerdict {
  const blockers: string[] = [];
  const vgmCompliant =
    c.vgmExempt || (c.vgmKg != null && c.vgmMethod != null && c.vgmVerifiedAt != null);
  if (!vgmCompliant) {
    blockers.push("VGM missing — SOLAS Verified Gross Mass not submitted");
  }
  // DG compliance: if flagged dangerous, must have a class+UN+packing group;
  // if not dangerous, it's compliant by default.
  const dgCompliant = c.isDangerous
    ? !!(c.imdgClass && c.unNumber && c.packingGroup)
    : true;
  if (!dgCompliant) {
    blockers.push("DG declaration incomplete — IMDG class / UN / packing group missing");
  }
  const sealsPresent = !!(c.sealNumber1 && c.sealVerifiedAt);
  if (!sealsPresent) {
    // seals are a WARN-level blocker — they don't block loading but warn.
    blockers.push("WARN: primary seal not recorded or verified");
  }
  return {
    canLoad: vgmCompliant && dgCompliant,
    vgmCompliant,
    dgCompliant,
    sealsPresent,
    blockers,
  };
}

// -----------------------------------------------------------------------------
// Status badge helpers
// -----------------------------------------------------------------------------

function vgmBadge(c: TradeContainerRow): ReactElement {
  if (c.vgmExempt) {
    return (
      <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30">
        VGM EXEMPT
      </Badge>
    );
  }
  if (c.vgmKg != null && c.vgmVerifiedAt != null) {
    return (
      <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
        VGM ✓ {fmtKg(c.vgmKg)}
      </Badge>
    );
  }
  return (
    <Badge className="bg-rose-500/10 text-rose-600 border-rose-500/30">
      VGM MISSING
    </Badge>
  );
}

function dgBadge(c: TradeContainerRow): ReactElement {
  if (!c.isDangerous) {
    return (
      <Badge className="bg-muted text-muted-foreground border-border">
        NON-DG
      </Badge>
    );
  }
  if (c.imdgClass && c.unNumber) {
    return (
      <Badge className="bg-rose-500/10 text-rose-600 border-rose-500/30">
        <Flame className="w-3 h-3" /> IMDG {c.imdgClass} · UN{c.unNumber}
      </Badge>
    );
  }
  return (
    <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30">
      <Flame className="w-3 h-3" /> DG INCOMPLETE
    </Badge>
  );
}

function sealBadge(c: TradeContainerRow): ReactElement {
  if (c.sealBrokenAt) {
    return (
      <Badge className="bg-rose-500/10 text-rose-600 border-rose-500/30">
        <Lock className="w-3 h-3" /> SEAL BROKEN
      </Badge>
    );
  }
  if (c.sealNumber1 && c.sealVerifiedAt) {
    return (
      <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
        <Lock className="w-3 h-3" /> SEAL ✓
      </Badge>
    );
  }
  return (
    <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30">
      <Lock className="w-3 h-3" /> NO SEAL
    </Badge>
  );
}

// -----------------------------------------------------------------------------
// Inline VGM submission form (renders inside the expanded container row).
// -----------------------------------------------------------------------------

function VgmForm({
  containerId,
  ustn,
  onSubmitted,
}: {
  containerId: string;
  ustn: string;
  onSubmitted: () => void;
}): ReactElement {
  const [vgmKg, setVgmKg] = useState("");
  const [method, setMethod] = useState<"METHOD_1" | "METHOD_2">("METHOD_1");
  const [tareKg, setTareKg] = useState("");
  const [cargoKg, setCargoKg] = useState("");
  const [dunnageKg, setDunnageKg] = useState("");
  const [weigherName, setWeigherName] = useState("");
  const [weigherGtid, setWeigherGtid] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const kg = parseFloat(vgmKg);
    if (!Number.isFinite(kg) || kg <= 0) {
      toast.error("VGM weight must be a positive number");
      return;
    }
    if (method === "METHOD_2" && (!tareKg || !cargoKg)) {
      toast.error("Method 2 requires tare + cargo weights");
      return;
    }
    setSubmitting(true);
    try {
      await fetchWithTimeout("/api/sgtx/execution/vgm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          containerId,
          ustn,
          vgmKg: kg,
          vgmMethod: method,
          tareKg: tareKg ? parseFloat(tareKg) : undefined,
          cargoKg: cargoKg ? parseFloat(cargoKg) : undefined,
          dunnageKg: dunnageKg ? parseFloat(dunnageKg) : undefined,
          weigherName: weigherName || undefined,
          weigherGtid: weigherGtid || undefined,
        }),
      });
      toast.success("VGM submitted");
      setVgmKg(""); setTareKg(""); setCargoKg(""); setDunnageKg("");
      onSubmitted();
    } catch (e) {
      toast.error("VGM submission failed", { description: (e as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03] p-3 space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
        <ShieldCheck className="w-3.5 h-3.5" /> Submit VGM (SOLAS Verified Gross Mass)
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-[0.65rem] text-muted-foreground">VGM Weight (kg) *</Label>
          <Input type="number" value={vgmKg} onChange={(e) => setVgmKg(e.target.value)} placeholder="e.g. 18450.5" />
        </div>
        <div className="space-y-1">
          <Label className="text-[0.65rem] text-muted-foreground">Method *</Label>
          <Select value={method} onValueChange={(v) => setMethod(v as "METHOD_1" | "METHOD_2")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="METHOD_1">Method 1 — Weighed</SelectItem>
              <SelectItem value="METHOD_2">Method 2 — Calculated</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {method === "METHOD_2" && (
          <>
            <div className="space-y-1">
              <Label className="text-[0.65rem] text-muted-foreground">Tare (kg)</Label>
              <Input type="number" value={tareKg} onChange={(e) => setTareKg(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[0.65rem] text-muted-foreground">Cargo (kg)</Label>
              <Input type="number" value={cargoKg} onChange={(e) => setCargoKg(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[0.65rem] text-muted-foreground">Dunnage (kg)</Label>
              <Input type="number" value={dunnageKg} onChange={(e) => setDunnageKg(e.target.value)} />
            </div>
          </>
        )}
        <div className="space-y-1">
          <Label className="text-[0.65rem] text-muted-foreground">Weigher Name</Label>
          <Input value={weigherName} onChange={(e) => setWeigherName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-[0.65rem] text-muted-foreground">Weigher GTID</Label>
          <Input value={weigherGtid} onChange={(e) => setWeigherGtid(e.target.value)} placeholder="SGTX-XX-XXX-..." />
        </div>
      </div>
      <Button size="sm" onClick={submit} disabled={submitting} className="bg-emerald-600 text-white hover:bg-emerald-700">
        {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
        Submit VGM
      </Button>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Inline DG declaration form
// -----------------------------------------------------------------------------

function DgForm({
  containerId,
  ustn,
  onSubmitted,
}: {
  containerId: string;
  ustn: string;
  onSubmitted: () => void;
}): ReactElement {
  const [shippingName, setShippingName] = useState("");
  const [imdgClass, setImdgClass] = useState("");
  const [unNumber, setUnNumber] = useState("");
  const [packingGroup, setPackingGroup] = useState<"I" | "II" | "III">("II");
  const [flashpoint, setFlashpoint] = useState("");
  const [marinePollutant, setMarinePollutant] = useState(false);
  const [emergencyContact, setEmergencyContact] = useState("");
  const [declarantName, setDeclarantName] = useState("");
  const [declarantGtid, setDeclarantGtid] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!shippingName || !imdgClass || !unNumber || !emergencyContact || !declarantName || !declarantGtid) {
      toast.error("Required fields missing");
      return;
    }
    setSubmitting(true);
    try {
      await fetchWithTimeout("/api/sgtx/execution/dangerous-goods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          containerId,
          ustn,
          shippingName,
          imdgClass,
          unNumber,
          packingGroup,
          flashpointC: flashpoint ? parseFloat(flashpoint) : undefined,
          marinePollutant,
          limitedQuantities: false,
          emergencyContact,
          declarantName,
          declarantGtid,
        }),
      });
      toast.success("DG declaration filed");
      setShippingName(""); setImdgClass(""); setUnNumber(""); setFlashpoint("");
      setEmergencyContact(""); setDeclarantName(""); setDeclarantGtid("");
      onSubmitted();
    } catch (e) {
      toast.error("DG declaration failed", { description: (e as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-lg border border-rose-500/20 bg-rose-500/[0.03] p-3 space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-rose-700">
        <Flame className="w-3.5 h-3.5" /> File Dangerous Goods Declaration (IMDG)
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <div className="space-y-1 sm:col-span-2 lg:col-span-2">
          <Label className="text-[0.65rem] text-muted-foreground">Proper Shipping Name *</Label>
          <Input value={shippingName} onChange={(e) => setShippingName(e.target.value)} placeholder="e.g. CORROSIVE LIQUID, N.O.S." />
        </div>
        <div className="space-y-1">
          <Label className="text-[0.65rem] text-muted-foreground">IMDG Class *</Label>
          <Input value={imdgClass} onChange={(e) => setImdgClass(e.target.value)} placeholder="e.g. 8" />
        </div>
        <div className="space-y-1">
          <Label className="text-[0.65rem] text-muted-foreground">UN Number *</Label>
          <Input value={unNumber} onChange={(e) => setUnNumber(e.target.value)} placeholder="e.g. 1760" />
        </div>
        <div className="space-y-1">
          <Label className="text-[0.65rem] text-muted-foreground">Packing Group *</Label>
          <Select value={packingGroup} onValueChange={(v) => setPackingGroup(v as "I" | "II" | "III")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="I">I — Great danger</SelectItem>
              <SelectItem value="II">II — Medium danger</SelectItem>
              <SelectItem value="III">III — Minor danger</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[0.65rem] text-muted-foreground">Flashpoint (°C)</Label>
          <Input type="number" value={flashpoint} onChange={(e) => setFlashpoint(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-[0.65rem] text-muted-foreground">Emergency Contact *</Label>
          <Input value={emergencyContact} onChange={(e) => setEmergencyContact(e.target.value)} placeholder="24h phone" />
        </div>
        <div className="space-y-1">
          <Label className="text-[0.65rem] text-muted-foreground">Declarant Name *</Label>
          <Input value={declarantName} onChange={(e) => setDeclarantName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-[0.65rem] text-muted-foreground">Declarant GTID *</Label>
          <Input value={declarantGtid} onChange={(e) => setDeclarantGtid(e.target.value)} placeholder="SGTX-XX-XXX-..." />
        </div>
        <div className="flex items-end gap-2 pb-1">
          <Button
            type="button"
            size="sm"
            variant={marinePollutant ? "default" : "outline"}
            onClick={() => setMarinePollutant((v) => !v)}
            className={marinePollutant ? "bg-rose-600 text-white" : ""}
          >
            {marinePollutant ? "Marine Pollutant ✓" : "Marine Pollutant"}
          </Button>
        </div>
      </div>
      <Button size="sm" onClick={submit} disabled={submitting} className="bg-rose-600 text-white hover:bg-rose-700">
        {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Flame className="w-3.5 h-3.5 mr-1.5" />}
        File Declaration
      </Button>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Inline Seal recording form
// -----------------------------------------------------------------------------

function SealForm({
  containerId,
  onSubmitted,
}: {
  containerId: string;
  onSubmitted: () => void;
}): ReactElement {
  const [seal1, setSeal1] = useState("");
  const [seal2, setSeal2] = useState("");
  const [verifiedBy, setVerifiedBy] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!seal1.trim()) {
      toast.error("Primary seal number is required");
      return;
    }
    setSubmitting(true);
    try {
      await fetchWithTimeout("/api/sgtx/execution/seals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          containerId,
          sealNumber1: seal1,
          sealNumber2: seal2 || null,
          verifiedBy: verifiedBy || null,
        }),
      });
      toast.success("Seals recorded");
      setSeal1(""); setSeal2(""); setVerifiedBy("");
      onSubmitted();
    } catch (e) {
      toast.error("Seal recording failed", { description: (e as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.03] p-3 space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-amber-700">
        <Lock className="w-3.5 h-3.5" /> Record Container Seals
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-[0.65rem] text-muted-foreground">Primary Seal #1 *</Label>
          <Input value={seal1} onChange={(e) => setSeal1(e.target.value)} placeholder="e.g. MAS-1234567" />
        </div>
        <div className="space-y-1">
          <Label className="text-[0.65rem] text-muted-foreground">Secondary Seal #2</Label>
          <Input value={seal2} onChange={(e) => setSeal2(e.target.value)} placeholder="optional (customs)" />
        </div>
        <div className="space-y-1">
          <Label className="text-[0.65rem] text-muted-foreground">Verified By</Label>
          <Input value={verifiedBy} onChange={(e) => setVerifiedBy(e.target.value)} placeholder="GTID or name" />
        </div>
      </div>
      <Button size="sm" onClick={submit} disabled={submitting} className="bg-amber-600 text-white hover:bg-amber-700">
        {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Lock className="w-3.5 h-3.5 mr-1.5" />}
        Record Seals
      </Button>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Container row (expandable)
// -----------------------------------------------------------------------------

function ContainerRow({
  container,
  ustn,
  vgm,
  dg,
  onRefresh,
}: {
  container: TradeContainerRow;
  ustn: string;
  vgm: VgmRow | null;
  dg: DgRow | null;
  onRefresh: () => void;
}): ReactElement {
  const [expanded, setExpanded] = useState(false);
  const [activeForm, setActiveForm] = useState<"none" | "vgm" | "dg" | "seal">("none");
  const verdict = useMemo(() => deriveVerdict(container), [container]);

  return (
    <Card className="overflow-hidden">
      {/* Row header (always visible) */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex flex-wrap items-center gap-3 p-3 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          <Package className="w-4 h-4 text-gold" />
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">
              Container #{container.sequence}
              {container.containerSize ? <span className="text-muted-foreground font-normal ml-1.5">· {container.containerSize}</span> : null}
            </p>
            <p className="text-[0.65rem] text-muted-foreground truncate">
              {container.originCountry} → {container.destCountry} · {container.port}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {vgmBadge(container)}
          {dgBadge(container)}
          {sealBadge(container)}
          {verdict.canLoad ? (
            <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">
              <CheckCircle2 className="w-3 h-3" /> CAN LOAD
            </Badge>
          ) : (
            <Badge className="bg-rose-500/15 text-rose-700 border-rose-500/30">
              <XCircle className="w-3 h-3" /> BLOCKED
            </Badge>
          )}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="border-t border-border/50 p-3 space-y-3"
        >
          {/* Verdict + blockers */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="rounded-lg border border-border/50 p-3 bg-muted/20">
              <div className="flex items-center gap-2 mb-2">
                <Scale className="w-3.5 h-3.5 text-gold" />
                <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">Overall Verdict</span>
              </div>
              <p className={`text-lg font-bold ${verdict.canLoad ? "text-emerald-600" : "text-rose-600"}`}>
                {verdict.canLoad ? "Can Load" : "Blocked"}
              </p>
              {verdict.blockers.length === 0 ? (
                <p className="text-[0.65rem] text-emerald-700 mt-1">All mandatory compliance gates passed.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-[0.65rem]">
                  {verdict.blockers.map((b, i) => (
                    <li key={i} className="flex items-start gap-1 text-rose-600">
                      <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* VGM detail */}
            <div className="rounded-lg border border-emerald-500/20 p-3 bg-emerald-500/[0.02]">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">VGM</span>
              </div>
              {container.vgmExempt ? (
                <p className="text-xs text-amber-700">Exempt — shipper's load & count</p>
              ) : vgm ? (
                <div className="space-y-0.5 text-xs">
                  <p><span className="text-muted-foreground">Mass:</span> <span className="font-semibold">{fmtKg(vgm.vgmKg)}</span></p>
                  <p><span className="text-muted-foreground">Method:</span> {vgm.vgmMethod}</p>
                  {vgm.weigherName && <p><span className="text-muted-foreground">Weigher:</span> {vgm.weigherName}</p>}
                  <p><span className="text-muted-foreground">Verified:</span> {fmtDateTime(vgm.verifiedAt)}</p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No VGM submitted.</p>
              )}
              <Button size="sm" variant="outline" className="mt-2 h-7 text-[0.65rem]" onClick={() => setActiveForm(activeForm === "vgm" ? "none" : "vgm")}>
                {activeForm === "vgm" ? "Cancel" : "Submit VGM"}
              </Button>
            </div>

            {/* DG detail */}
            <div className="rounded-lg border border-rose-500/20 p-3 bg-rose-500/[0.02]">
              <div className="flex items-center gap-2 mb-2">
                <Flame className="w-3.5 h-3.5 text-rose-600" />
                <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">Dangerous Goods</span>
              </div>
              {container.isDangerous && dg ? (
                <div className="space-y-0.5 text-xs">
                  <p><span className="text-muted-foreground">Name:</span> {dg.shippingName}</p>
                  <p><span className="text-muted-foreground">Class / UN:</span> {dg.imdgClass} · UN{dg.unNumber}</p>
                  <p><span className="text-muted-foreground">Packing Group:</span> {dg.packingGroup}</p>
                  {dg.flashpointC != null && <p><span className="text-muted-foreground">Flashpoint:</span> {dg.flashpointC}°C</p>}
                  <p><span className="text-muted-foreground">Marine Pollutant:</span> {dg.marinePollutant ? "Yes" : "No"}</p>
                  <p><span className="text-muted-foreground">Emergency:</span> {dg.emergencyContact}</p>
                  <p><span className="text-muted-foreground">Filed:</span> {fmtDateTime(dg.createdAt)}</p>
                </div>
              ) : container.isDangerous ? (
                <p className="text-xs text-amber-700">Flagged DG — no declaration on file.</p>
              ) : (
                <p className="text-xs text-muted-foreground">Not dangerous goods.</p>
              )}
              <Button size="sm" variant="outline" className="mt-2 h-7 text-[0.65rem]" onClick={() => setActiveForm(activeForm === "dg" ? "none" : "dg")}>
                {activeForm === "dg" ? "Cancel" : "File DG"}
              </Button>
            </div>
          </div>

          {/* Seal detail */}
          <div className="rounded-lg border border-amber-500/20 p-3 bg-amber-500/[0.02]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">Seals</span>
              </div>
              <Button size="sm" variant="outline" className="h-7 text-[0.65rem]" onClick={() => setActiveForm(activeForm === "seal" ? "none" : "seal")}>
                {activeForm === "seal" ? "Cancel" : "Record Seals"}
              </Button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div><p className="text-[0.6rem] text-muted-foreground">Seal #1</p><p className="font-mono">{container.sealNumber1 || "—"}</p></div>
              <div><p className="text-[0.6rem] text-muted-foreground">Seal #2</p><p className="font-mono">{container.sealNumber2 || "—"}</p></div>
              <div><p className="text-[0.6rem] text-muted-foreground">Verified At</p><p>{container.sealVerifiedAt ? fmtDateTime(container.sealVerifiedAt) : "—"}</p></div>
              <div><p className="text-[0.6rem] text-muted-foreground">Verified By</p><p>{container.sealVerifiedBy || "—"}</p></div>
            </div>
            {container.sealBrokenAt && (
              <div className="mt-2 rounded-md bg-rose-500/10 border border-rose-500/30 p-2 text-xs text-rose-700">
                <AlertTriangle className="w-3 h-3 inline mr-1" />
                Seal broken at {fmtDateTime(container.sealBrokenAt)}
                {container.sealBreakReason ? ` — ${container.sealBreakReason}` : ""}
              </div>
            )}
          </div>

          {/* Active inline form */}
          {activeForm === "vgm" && <VgmForm containerId={container.id} ustn={ustn} onSubmitted={() => { setActiveForm("none"); onRefresh(); }} />}
          {activeForm === "dg" && <DgForm containerId={container.id} ustn={ustn} onSubmitted={() => { setActiveForm("none"); onRefresh(); }} />}
          {activeForm === "seal" && <SealForm containerId={container.id} onSubmitted={() => { setActiveForm("none"); onRefresh(); }} />}
        </motion.div>
      )}
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Main panel
// -----------------------------------------------------------------------------

export function ContainerCompliancePanel({ tradeId, ustn }: { tradeId?: string; ustn?: string }): ReactElement {
  const [trade, setTrade] = useState<{ id: string; ustn: string; containers: TradeContainerRow[] } | null>(null);
  const [vgms, setVgms] = useState<Record<string, VgmRow>>({});
  const [dgs, setDgs] = useState<Record<string, DgRow>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [segResult, setSegResult] = useState<SegregationResult | null>(null);
  const [segLoading, setSegLoading] = useState(false);

  // Resolve the active USTN. Caller may pass either `ustn` directly or
  // `tradeId` (we then need a trade lookup). For the portal dispatcher
  // we pass the USTN derived from the dashboard's `activeUstn`.
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
      const t = await fetchWithTimeout<{ id: string; ustn: string; containers: TradeContainerRow[] }>(
        `/api/sgtx/trade?ustn=${encodeURIComponent(effectiveUstn)}`,
      );
      const containers = Array.isArray(t.containers) ? t.containers : [];
      setTrade({ id: t.id, ustn: t.ustn, containers });

      // Fetch VGM + DG records in parallel for the whole trade.
      const [vgmResp, dgResp] = await Promise.all([
        fetchWithTimeout<{ verifications: VgmRow[] }>(
          `/api/sgtx/execution/vgm?ustn=${encodeURIComponent(effectiveUstn)}`,
        ).catch(() => ({ verifications: [] as VgmRow[] })),
        fetchWithTimeout<{ declarations: DgRow[] }>(
          `/api/sgtx/execution/dangerous-goods?ustn=${encodeURIComponent(effectiveUstn)}`,
        ).catch(() => ({ declarations: [] as DgRow[] })),
      ]);
      const vgmMap: Record<string, VgmRow> = {};
      for (const v of vgmResp.verifications || []) {
        if (!vgmMap[v.containerId]) vgmMap[v.containerId] = v;
      }
      const dgMap: Record<string, DgRow> = {};
      for (const d of dgResp.declarations || []) {
        if (!dgMap[d.containerId]) dgMap[d.containerId] = d;
      }
      setVgms(vgmMap);
      setDgs(dgMap);
    } catch (e) {
      setError((e as Error).message || "Failed to load trade compliance data");
    } finally {
      setLoading(false);
    }
  }, [effectiveUstn]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Run IMDG segregation check across all DG-flagged containers on this trade.
  const runSegregation = async () => {
    if (!trade) return;
    const dgIds = trade.containers.filter((c) => c.isDangerous).map((c) => c.id);
    if (dgIds.length < 2) {
      toast.info("Fewer than 2 DG containers — segregation check is trivially passing.");
      setSegResult({ compliant: true, conflicts: [], checked: dgIds.length, dangerousCount: dgIds.length });
      return;
    }
    setSegLoading(true);
    try {
      const r = await fetchWithTimeout<SegregationResult>("/api/sgtx/execution/dangerous-goods/segregation-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ containerIds: dgIds }),
      });
      setSegResult(r);
      if (r.compliant) {
        toast.success(`Segregation OK — ${r.checked} DG containers checked`);
      } else {
        toast.warning(`Segregation conflicts detected — ${r.conflicts.length} conflict(s)`);
      }
    } catch (e) {
      toast.error("Segregation check failed", { description: (e as Error).message });
    } finally {
      setSegLoading(false);
    }
  };

  // Aggregate stats for the header row.
  const stats = useMemo(() => {
    const containers = trade?.containers || [];
    const total = containers.length;
    let vgmOk = 0, dgOk = 0, sealsOk = 0, blocked = 0;
    for (const c of containers) {
      const v = deriveVerdict(c);
      if (v.vgmCompliant) vgmOk++;
      if (v.dgCompliant) dgOk++;
      if (v.sealsPresent) sealsOk++;
      if (!v.canLoad) blocked++;
    }
    return { total, vgmOk, dgOk, sealsOk, blocked, canLoad: total - blocked };
  }, [trade]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64"><Skeleton className="h-full w-full" /></div>
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
      <div className="space-y-4">
        <Card className="p-6 text-center">
          <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
          <p className="text-sm font-semibold mb-1">Unable to load compliance data</p>
          <p className="text-xs text-muted-foreground mb-4">{error}</p>
          <Button size="sm" variant="outline" onClick={() => void refresh()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
          </Button>
        </Card>
      </div>
    );
  }

  if (!trade || trade.containers.length === 0) {
    return (
      <Card className="p-6 text-center">
        <Package className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm font-semibold mb-1">No containers on this trade</p>
        <p className="text-xs text-muted-foreground">Containers will appear here once the trade is configured.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-gold" />
            Container Compliance
          </h2>
          <p className="text-xs text-muted-foreground">
            USTN <span className="font-mono">{trade.ustn}</span> · {stats.total} container{stats.total === 1 ? "" : "s"} · VGM + DG + Seals
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void refresh()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
          <Button size="sm" onClick={() => void runSegregation()} disabled={segLoading}>
            {segLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Scale className="w-3.5 h-3.5 mr-1.5" />}
            Segregation Check
          </Button>
        </div>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2 text-[0.65rem] text-muted-foreground uppercase tracking-wider"><ShieldCheck className="w-3 h-3" /> VGM Compliant</div>
          <p className="text-xl font-bold mt-1"><span className="text-emerald-600">{stats.vgmOk}</span><span className="text-muted-foreground text-sm">/{stats.total}</span></p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-[0.65rem] text-muted-foreground uppercase tracking-wider"><Flame className="w-3 h-3" /> DG Compliant</div>
          <p className="text-xl font-bold mt-1"><span className="text-emerald-600">{stats.dgOk}</span><span className="text-muted-foreground text-sm">/{stats.total}</span></p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-[0.65rem] text-muted-foreground uppercase tracking-wider"><Lock className="w-3 h-3" /> Seals Recorded</div>
          <p className="text-xl font-bold mt-1"><span className="text-amber-600">{stats.sealsOk}</span><span className="text-muted-foreground text-sm">/{stats.total}</span></p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-[0.65rem] text-muted-foreground uppercase tracking-wider"><Scale className="w-3 h-3" /> Can Load</div>
          <p className="text-xl font-bold mt-1"><span className={stats.canLoad === stats.total ? "text-emerald-600" : "text-rose-600"}>{stats.canLoad}</span><span className="text-muted-foreground text-sm">/{stats.total}</span></p>
        </Card>
      </div>

      {/* Segregation result banner */}
      {segResult && (
        <Card className={`p-4 border ${segResult.compliant ? "border-emerald-500/30 bg-emerald-500/[0.04]" : "border-rose-500/30 bg-rose-500/[0.04]"}`}>
          <div className="flex items-start gap-3">
            {segResult.compliant ? <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" /> : <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${segResult.compliant ? "text-emerald-700" : "text-rose-700"}`}>
                Segregation {segResult.compliant ? "Compliant" : "Conflicts Detected"}
              </p>
              <p className="text-xs text-muted-foreground">
                Checked {segResult.checked} container(s) · {segResult.dangerousCount} DG-flagged
                {segResult.note ? ` · ${segResult.note}` : ""}
              </p>
              {segResult.conflicts.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs">
                  {segResult.conflicts.map((c, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-rose-700">
                      <XCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      <span>
                        <span className="font-mono">{c.container1.slice(-8)}</span> ↔ <span className="font-mono">{c.container2.slice(-8)}</span>
                        {c.classPair ? ` · ${c.classPair}` : ""}
                        {c.rule ? ` · ${c.rule}` : ""}
                        {c.severity ? ` · ${c.severity}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Container rows */}
      <div className="space-y-2">
        {trade.containers.map((c) => (
          <ContainerRow
            key={c.id}
            container={c}
            ustn={trade.ustn}
            vgm={vgms[c.id] || null}
            dg={dgs[c.id] || null}
            onRefresh={() => void refresh()}
          />
        ))}
      </div>
    </div>
  );
}
