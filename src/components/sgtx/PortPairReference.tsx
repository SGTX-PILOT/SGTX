"use client";

// =============================================================================
// SGTX — Port-Pair Reference (Buyer / Seller indicative lookup)
// =============================================================================
// A focused reference tool for traders (buyers + sellers) to look up the
// **average transit time**, **available shipping lines**, **indicative price
// range**, and **sailing frequency** for any port pair — until they receive a
// binding confirmation from a shipping line or freight forwarder.
//
// This is NOT a booking tool. Every screen carries a prominent "INDICATIVE
// REFERENCE" disclaimer. The data is sourced from the SGTX Brain AI worldwide
// routes database (learning-corrected, daily-synced).
//
// Sections:
//   1 — Lookup bar (origin port + destination port + Get Reference button)
//   2 — Lane summary cards (avg transit, price range, lines servicing, frequency)
//   3 — Per-line comparison table (cheapest → most expensive, with service type)
//   4 — Reference disclaimer banner (always visible when a reference is shown)
//
// All fetches go to GET /api/sgtx/port-pair-reference?origin=XX&dest=YY with a
// 15s AbortController timeout. Loading / empty / error states are friendly.
// =============================================================================

import { motion } from "framer-motion";
import { useCallback, useEffect, useState, type ReactElement } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  AlertTriangle,
  Anchor,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  Container,
  DollarSign,
  Gauge,
  Info,
  Loader2,
  MapPin,
  RefreshCw,
  Route as RouteIcon,
  Search,
  Ship,
  Snowflake,
  TrendingUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { fmtUsd } from "@/lib/sgtx/format";

// =============================================================================
// Types — mirrors the PortPairReference interface from the Brain orchestrator
// =============================================================================

/** A single shipping line's offering on the lane. */
interface PortPairReferenceLine {
  shippingLine: string;
  shippingLineName: string;
  alliance?: string;
  service: string;
  transitDays: number;
  frequencyPerWeek: number;
  serviceType: "DIRECT" | "TRANSSHIPMENT";
  transshipmentPort?: string;
  price20Std: number;
  price40Std: number;
  price40Hc: number;
  price20Reefer: number;
  price40Reefer: number;
  reeferCapable: boolean;
  confidence: number;
  source: "database" | "ai-estimated";
  lastUpdated: string;
}

/** Aggregated reference summary for a port pair. */
interface PortPairReference {
  originPort: string;
  originName: string;
  originCountry: string;
  originRegion: string;
  destinationPort: string;
  destinationName: string;
  destinationCountry: string;
  destinationRegion: string;
  lane: string;
  laneRegionPair: string;
  linesServicingCount: number;
  avgTransitDays: number;
  minTransitDays: number;
  maxTransitDays: number;
  avgFrequencyPerWeek: number;
  totalSailingsPerWeek: number;
  minPrice40Std: number;
  maxPrice40Std: number;
  avgPrice40Std: number;
  minPrice40Reefer: number;
  maxPrice40Reefer: number;
  avgPrice40Reefer: number;
  reeferCapableLineCount: number;
  hasDirect: boolean;
  hasTransshipment: boolean;
  directCount: number;
  transshipmentCount: number;
  lines: PortPairReferenceLine[];
  overallConfidence: number;
  lastUpdated: string;
  dataFreshnessHours: number;
  disclaimer: string;
}

// =============================================================================
// Constants — port list (mirrors the WorldwideRoutesDashboard list for parity)
// =============================================================================

interface PortOption {
  code: string;
  name: string;
  country: string;
}

const MAJOR_PORTS: PortOption[] = [
  { code: "EGALX", name: "Alexandria", country: "EG" },
  { code: "EGDMT", name: "Damietta", country: "EG" },
  { code: "EGSGF", name: "Ain Sokhna", country: "EG" },
  { code: "EGPSD", name: "Port Said", country: "EG" },
  { code: "DEHAM", name: "Hamburg", country: "DE" },
  { code: "DEBRV", name: "Bremerhaven", country: "DE" },
  { code: "NLRTM", name: "Rotterdam", country: "NL" },
  { code: "BEANR", name: "Antwerp", country: "BE" },
  { code: "GBFXT", name: "Felixstowe", country: "GB" },
  { code: "FRLEH", name: "Le Havre", country: "FR" },
  { code: "ESBCN", name: "Barcelona", country: "ES" },
  { code: "ESALG", name: "Algeciras", country: "ES" },
  { code: "ITGOA", name: "Genoa", country: "IT" },
  { code: "GRPIR", name: "Piraeus", country: "GR" },
  { code: "TRIST", name: "Istanbul (Ambarli)", country: "TR" },
  { code: "AEJEA", name: "Jebel Ali", country: "AE" },
  { code: "SAJED", name: "Jeddah", country: "SA" },
  { code: "SADMM", name: "Dammam", country: "SA" },
  { code: "OMSLL", name: "Salalah", country: "OM" },
  { code: "CNSHA", name: "Shanghai", country: "CN" },
  { code: "CNNGO", name: "Ningbo-Zhoushan", country: "CN" },
  { code: "CNSZN", name: "Shenzhen", country: "CN" },
  { code: "CNQIN", name: "Qingdao", country: "CN" },
  { code: "CNGZG", name: "Guangzhou", country: "CN" },
  { code: "HKHKG", name: "Hong Kong", country: "HK" },
  { code: "SGSIN", name: "Singapore", country: "SG" },
  { code: "KRPUS", name: "Busan", country: "KR" },
  { code: "JPTYO", name: "Tokyo", country: "JP" },
  { code: "INMUN", name: "Mumbai (Nhava Sheva)", country: "IN" },
  { code: "INMAA", name: "Chennai", country: "IN" },
  { code: "USLAX", name: "Los Angeles", country: "US" },
  { code: "USLGB", name: "Long Beach", country: "US" },
  { code: "USNYC", name: "New York / NJ", country: "US" },
  { code: "USSAV", name: "Savannah", country: "US" },
  { code: "USOAK", name: "Oakland", country: "US" },
  { code: "BRITJ", name: "Itajaí", country: "BR" },
  { code: "BRSSZ", name: "Santos", country: "BR" },
  { code: "AUMEL", name: "Melbourne", country: "AU" },
  { code: "AUSYD", name: "Sydney", country: "AU" },
  { code: "ZADUR", name: "Durban", country: "ZA" },
  { code: "NGAPP", name: "Apapa (Lagos)", country: "NG" },
  { code: "MAPTM", name: "Tanger Med", country: "MA" },
];

// =============================================================================
// Helpers
// =============================================================================

/** Format a USD amount with thousands separators. Returns "—" for 0/empty. */
function fmtMoney(n: number): string {
  if (!n || n <= 0) return "—";
  return fmtUsd(n);
}

/** Format a number of days as "14d". */
function fmtDays(n: number): string {
  if (!n && n !== 0) return "—";
  return `${n}d`;
}

/** Format a per-week frequency as "2/wk". */
function fmtFreq(n: number): string {
  if (!n) return "—";
  return `${n}/wk`;
}

/** Alliance badge color. */
function allianceBadgeClass(alliance?: string): string {
  switch (alliance) {
    case "2M": return "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400";
    case "OCEAN": return "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400";
    case "THE": return "bg-purple-500/10 text-purple-700 border-purple-500/30 dark:text-purple-400";
    case "IGA": return "bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-400";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

/** Confidence as a label + color. */
function confidenceBadge(confidence: number): { label: string; className: string } {
  if (confidence >= 0.85) return { label: "High", className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400" };
  if (confidence >= 0.7) return { label: "Good", className: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400" };
  return { label: "Est.", className: "bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-400" };
}

// =============================================================================
// Main component
// =============================================================================

/**
 * PortPairReference — a buyer/seller-facing indicative reference tool for
 * looking up average transit times and available services for a port pair.
 *
 * Renders a lookup bar, a lane-summary card grid, a per-line comparison
 * table, and a persistent disclaimer banner. All data comes from the Brain
 * AI worldwide routes database (learning-corrected, daily-synced).
 */
export function PortPairReference(): ReactElement {
  const [origin, setOrigin] = useState<string>("EGALX");
  const [dest, setDest] = useState<string>("DEHAM");
  const [reference, setReference] = useState<PortPairReference | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState<boolean>(false);

  /** Fetch the reference for the current origin/dest. */
  const fetchReference = useCallback(async (o: string, d: string): Promise<void> => {
    if (!o || !d) {
      toast.error("Please select both an origin and a destination port.");
      return;
    }
    if (o === d) {
      toast.error("Origin and destination must be different ports.");
      return;
    }
    setLoading(true);
    setError(null);
    setHasSearched(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(
        `/api/sgtx/port-pair-reference?origin=${encodeURIComponent(o)}&dest=${encodeURIComponent(d)}`,
        { signal: controller.signal },
      );
      clearTimeout(timeout);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Request failed (${res.status})`);
      }
      const body = await res.json();
      setReference(body.reference || null);
      if (!body.reference) {
        toast.info(`No routes found for ${o} → ${d}. Try a different port pair.`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setReference(null);
      toast.error(`Reference lookup failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-load the default EGALX → DEHAM reference on first mount so the screen
  // is never empty.
  useEffect(() => {
    void fetchReference("EGALX", "DEHAM");
  }, [fetchReference]);

  /** Swap origin and destination. */
  const handleSwap = useCallback((): void => {
    setOrigin(dest);
    setDest(origin);
  }, [origin, dest]);

  /** Trigger a reference lookup. */
  const handleSearch = useCallback((): void => {
    void fetchReference(origin, dest);
  }, [fetchReference, origin, dest]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <RouteIcon className="h-5 w-5 text-amber-600" />
          <h1 className="text-2xl font-bold tracking-tight">Port-Pair Reference</h1>
          <Badge variant="outline" className="ml-2 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400">
            INDICATIVE
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Average transit time &amp; available services for any port pair — a planning reference until your shipping line or freight forwarder confirms.
        </p>
      </div>

      {/* Disclaimer banner — always visible */}
      <Card className="border-amber-500/30 bg-amber-500/5 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-amber-900 dark:text-amber-200">
              Reference only — not a quote
            </p>
            <p className="text-amber-800/90 dark:text-amber-300/80">
              All transit times and prices below are indicative averages from the SGTX Brain AI worldwide routes database.
              They are a planning reference. Confirm actual transit, pricing, and space availability with the shipping line
              or your freight forwarder before contracting.
            </p>
          </div>
        </div>
      </Card>

      {/* Lookup bar */}
      <Card className="p-5">
        <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="origin-port" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <MapPin className="mr-1 inline h-3.5 w-3.5" />
              Origin port
            </Label>
            <Select value={origin} onValueChange={setOrigin}>
              <SelectTrigger id="origin-port">
                <SelectValue placeholder="Select origin" />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {MAJOR_PORTS.map((p) => (
                  <SelectItem key={p.code} value={p.code}>
                    {p.code} · {p.name} ({p.country})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={handleSwap}
            className="mb-1 md:mb-0"
            aria-label="Swap origin and destination"
            title="Swap origin and destination"
          >
            <ArrowRight className="h-4 w-4" />
          </Button>

          <div className="space-y-2">
            <Label htmlFor="dest-port" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Anchor className="mr-1 inline h-3.5 w-3.5" />
              Destination port
            </Label>
            <Select value={dest} onValueChange={setDest}>
              <SelectTrigger id="dest-port">
                <SelectValue placeholder="Select destination" />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {MAJOR_PORTS.map((p) => (
                  <SelectItem key={p.code} value={p.code}>
                    {p.code} · {p.name} ({p.country})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleSearch}
            disabled={loading || !origin || !dest || origin === dest}
            className="md:mb-0"
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            Get Reference
          </Button>
        </div>
      </Card>

      {/* Body — loading / error / empty / results */}
      {loading && <ReferenceSkeleton />}

      {!loading && error && (
        <Card className="border-rose-500/30 bg-rose-500/5 p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
            <div className="space-y-2">
              <p className="font-semibold text-rose-900 dark:text-rose-200">Could not load reference</p>
              <p className="text-sm text-rose-800/90 dark:text-rose-300/80">{error}</p>
              <Button variant="outline" size="sm" onClick={handleSearch} className="mt-2">
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          </div>
        </Card>
      )}

      {!loading && !error && !reference && hasSearched && (
        <Card className="p-8 text-center">
          <Info className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-medium">No routes found for this port pair</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The SGTX Brain AI database doesn&apos;t currently cover <code className="font-mono">{origin}</code> → <code className="font-mono">{dest}</code>.
            Try a different port pair, or check back after the next daily sync.
          </p>
        </Card>
      )}

      {!loading && !error && reference && (
        <ReferenceResult reference={reference} onRefresh={handleSearch} refreshing={loading} />
      )}
    </motion.div>
  );
}

// =============================================================================
// Result component — lane summary + per-line table + disclaimer
// =============================================================================

/**
 * Renders the full reference result: lane header, summary stat cards, per-line
 * comparison table, and the per-reference disclaimer footer.
 */
function ReferenceResult({
  reference,
  onRefresh,
  refreshing,
}: {
  reference: PortPairReference;
  onRefresh: () => void;
  refreshing: boolean;
}): ReactElement {
  const conf = confidenceBadge(reference.overallConfidence);

  return (
    <div className="space-y-6">
      {/* Lane header */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Ship className="h-4 w-4" />
              <span>{reference.laneRegionPair}</span>
            </div>
            <h2 className="text-xl font-bold tracking-tight">
              {reference.originName} ({reference.originPort}) <ArrowRight className="inline h-4 w-4 text-amber-600" /> {reference.destinationName} ({reference.destinationPort})
            </h2>
            <p className="text-xs text-muted-foreground">
              {reference.originName}, {reference.originCountry} → {reference.destinationName}, {reference.destinationCountry}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={conf.className}>
              <Gauge className="mr-1 h-3 w-3" />
              {conf.label} confidence
            </Badge>
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      {/* Summary stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Avg transit */}
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Avg transit</span>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-2 text-3xl font-bold">{fmtDays(reference.avgTransitDays)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Range: {fmtDays(reference.minTransitDays)} – {fmtDays(reference.maxTransitDays)}
          </p>
        </Card>

        {/* Price range 40'Std */}
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">40&apos; Std price</span>
            <DollarSign className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-3xl font-bold">{fmtMoney(reference.avgPrice40Std)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Range: {fmtMoney(reference.minPrice40Std)} – {fmtMoney(reference.maxPrice40Std)}
          </p>
        </Card>

        {/* Lines servicing */}
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lines servicing</span>
            <Container className="h-4 w-4 text-purple-600" />
          </div>
          <p className="mt-2 text-3xl font-bold">{reference.linesServicingCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {reference.directCount} direct · {reference.transshipmentCount} transship
          </p>
        </Card>

        {/* Sailings per week */}
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sailings / week</span>
            <Calendar className="h-4 w-4 text-blue-600" />
          </div>
          <p className="mt-2 text-3xl font-bold">{reference.totalSailingsPerWeek}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Avg {fmtFreq(reference.avgFrequencyPerWeek)} per line
          </p>
        </Card>
      </div>

      {/* Reefer + service-type info row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Snowflake className="h-4 w-4 text-sky-600" />
            <span className="text-sm font-medium">Reefer capability</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {reference.reeferCapableLineCount} of {reference.linesServicingCount} lines reefer-capable.
            {reference.reeferCapableLineCount > 0 && (
              <> Avg 40&apos; reefer: <span className="font-semibold text-foreground">{fmtMoney(reference.avgPrice40Reefer)}</span> (range {fmtMoney(reference.minPrice40Reefer)}–{fmtMoney(reference.maxPrice40Reefer)}).</>
            )}
          </p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <RouteIcon className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-medium">Service types</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {reference.hasDirect && <Badge variant="outline" className="mr-2 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">DIRECT ({reference.directCount})</Badge>}
            {reference.hasTransshipment && <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400">TRANSSHIPMENT ({reference.transshipmentCount})</Badge>}
            {!reference.hasDirect && !reference.hasTransshipment && "—"}
          </p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-purple-600" />
            <span className="text-sm font-medium">Data freshness</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Updated {reference.dataFreshnessHours > 24 ? `${Math.round(reference.dataFreshnessHours / 24)}d ago` : `${reference.dataFreshnessHours}h ago`} ·
            {" "}{reference.lines.filter(l => l.source === "database").length} DB-sourced / {reference.lines.filter(l => l.source === "ai-estimated").length} AI-estimated
          </p>
        </Card>
      </div>

      {/* Per-line comparison table */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Available shipping lines</h3>
            <p className="text-xs text-muted-foreground">Sorted by 40&apos; Std price (cheapest first). All prices are indicative USD per container.</p>
          </div>
        </div>
        <div className="max-h-[600px] overflow-y-auto rounded-md border border-border/60 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-amber-500/30 [&::-webkit-scrollbar-track]:bg-transparent">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead className="min-w-[180px]">SHIPPING LINE</TableHead>
                <TableHead>SERVICE</TableHead>
                <TableHead className="text-center">TRANSIT</TableHead>
                <TableHead className="text-center">FREQ</TableHead>
                <TableHead className="text-center">TYPE</TableHead>
                <TableHead className="text-right">20&apos; STD</TableHead>
                <TableHead className="text-right">40&apos; STD</TableHead>
                <TableHead className="text-right">40&apos; HC</TableHead>
                <TableHead className="text-right">40&apos; REEFER</TableHead>
                <TableHead className="text-center">CONF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reference.lines.map((line) => {
                const lc = confidenceBadge(line.confidence);
                return (
                  <TableRow key={`${line.shippingLine}-${line.service}`}>
                    <TableCell>
                      <div className="font-medium">{line.shippingLineName}</div>
                      {line.alliance && (
                        <Badge variant="outline" className={`mt-1 ${allianceBadgeClass(line.alliance)}`}>
                          {line.alliance}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{line.service}</TableCell>
                    <TableCell className="text-center font-medium">{fmtDays(line.transitDays)}</TableCell>
                    <TableCell className="text-center text-muted-foreground">{fmtFreq(line.frequencyPerWeek)}</TableCell>
                    <TableCell className="text-center">
                      {line.serviceType === "DIRECT" ? (
                        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">DIRECT</Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400" title={line.transshipmentPort ? `Via ${line.transshipmentPort}` : undefined}>
                          TRANSSHIP
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(line.price20Std)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{fmtMoney(line.price40Std)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{fmtMoney(line.price40Hc)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {line.reeferCapable && line.price40Reefer > 0 ? (
                        <span className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-400">
                          <Snowflake className="h-3 w-3" />
                          {fmtMoney(line.price40Reefer)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={lc.className}>{lc.label}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Per-reference disclaimer footer */}
      <Card className="border-amber-500/30 bg-amber-500/5 p-4">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">
              How to use this reference
            </p>
            <p className="text-sm text-amber-800/90 dark:text-amber-300/80">
              {reference.disclaimer}
            </p>
            <p className="text-xs text-amber-700/80 dark:text-amber-400/70">
              Next steps: contact the shipping line directly or your freight forwarder with the lane + desired ETD to receive a binding quote and space confirmation. The SGTX LSP portal can connect you with verified forwarders.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

// =============================================================================
// Skeleton
// =============================================================================

/** Loading skeleton for the reference result. */
function ReferenceSkeleton(): ReactElement {
  return (
    <div className="space-y-6">
      <Card className="p-5">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="mt-3 h-8 w-3/4" />
        <Skeleton className="mt-2 h-4 w-1/2" />
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="p-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-9 w-20" />
            <Skeleton className="mt-2 h-3 w-32" />
          </Card>
        ))}
      </div>
      <Card className="p-5">
        <Skeleton className="h-6 w-48" />
        <div className="mt-4 space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </Card>
    </div>
  );
}
