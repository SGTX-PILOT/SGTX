"use client";

// =============================================================================
// SGTX — Worldwide Port Routes Dashboard
// =============================================================================
// Premium dashboard that visualises the worldwide port-routes database built
// by Task 1-A (93 ports × 30 shipping lines × 8 regions) and the Brain AI's
// daily sync + learning subsystem built by Task 1-B.
//
// Sections:
//   A — Header stat cards (total routes, lines, ports, last sync)
//   B — Sticky filter bar (origin/dest/line/region-pair/transit/price/reefer)
//   C — Results table with pagination + View / Record-Actual actions
//   D — Brain AI status panel (sync status, learning stats, manual trigger)
//   E — Region coverage horizontal bar chart
//   F — Top-10 lane price averages table
//
// All data fetching uses `fetch()` with a 15s AbortController timeout. Every
// async surface is wrapped in try/catch. Loading states use shadcn Skeleton.
// Empty + error states have dedicated friendly UI.
// =============================================================================

import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  AlertCircle,
  Anchor,
  ArrowRight,
  Brain,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Container,
  DollarSign,
  Eye,
  Filter,
  Globe,
  Loader2,
  MapPin,
  Play,
  RefreshCw,
  Route as RouteIcon,
  Ship,
  Snowflake,
  TrendingUp,
  X,
  Zap,
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
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtUsd, fmtDateTime, timeAgo } from "@/lib/sgtx/format";

// =============================================================================
// Constants — major ports for the filter dropdowns + region-pair lanes
// =============================================================================

/** Major world container ports offered in the origin/destination filter
 *  dropdowns. Drawn from the 93-port master list maintained in
 *  `worldwide-port-routes.ts`. Users can pick "Any" to leave a side unfiltered. */
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

/** Region-pair trade lanes offered in the region-pair filter dropdown.
 *  Maps the user-facing lane label to a `${originRegion}→${destinationRegion}`
 *  token used for client-side filtering (the API's `region` query param is a
 *  single-value coarse filter that does not currently support pairs). */
const REGION_PAIRS: Array<{ label: string; token: string }> = [
  { label: "Asia → Europe", token: "Asia→Europe" },
  { label: "Asia → North America", token: "Asia→North America" },
  { label: "Europe → US", token: "Europe→North America" },
  { label: "MidEast → Asia", token: "Middle East→Asia" },
  { label: "Africa → Europe", token: "Africa→Europe" },
  { label: "Intra-Asia", token: "Asia→Asia" },
  { label: "Europe → Africa", token: "Europe→Africa" },
  { label: "Latin America → Asia", token: "South America→Asia" },
  { label: "Oceania → Asia", token: "Oceania→Asia" },
  { label: "Intra-Europe", token: "Europe→Europe" },
];

/** The 30 shipping lines covered by the master database. The "All Lines"
 *  sentinel leaves the line filter empty. */
const SHIPPING_LINES: Array<{ code: string; name: string; alliance?: string }> = [
  { code: "MAERSK", name: "Maersk", alliance: "2M" },
  { code: "MSC", name: "MSC", alliance: "2M" },
  { code: "CMA", name: "CMA CGM", alliance: "OCEAN" },
  { code: "COSCO", name: "COSCO", alliance: "OCEAN" },
  { code: "EVERGREEN", name: "Evergreen", alliance: "OCEAN" },
  { code: "OOCL", name: "OOCL", alliance: "OCEAN" },
  { code: "HLAG", name: "Hapag-Lloyd", alliance: "THE" },
  { code: "ONE", name: "ONE", alliance: "THE" },
  { code: "YML", name: "Yang Ming", alliance: "THE" },
  { code: "HMM", name: "HMM", alliance: "THE" },
  { code: "ZIM", name: "ZIM", alliance: "standalone" },
  { code: "WANHAI", name: "Wan Hai", alliance: "standalone" },
  { code: "SITC", name: "SITC", alliance: "standalone" },
  { code: "PIL", name: "Pacific Int'l Line", alliance: "standalone" },
  { code: "IRISL", name: "IRISL", alliance: "standalone" },
];

const PAGE_SIZE = 50;
/** Max batch size fetched from the API in a single round-trip. The Brain
 *  capability caps at 200; we fetch the max so client-side filters have a
 *  large enough candidate pool. */
const FETCH_LIMIT = 200;
const REQUEST_TIMEOUT_MS = 15_000;

// =============================================================================
// API response shapes (typed as narrowly as practical; the Brain orchestrator
// returns a richer envelope that we cast down to these interfaces).
// =============================================================================

/** A single worldwide port-route row returned by the search capability. */
interface RouteRow {
  routeId: string;
  originPort: string;
  originName: string;
  originCountry: string;
  originRegion: string;
  destinationPort: string;
  destinationName: string;
  destinationCountry: string;
  destinationRegion: string;
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
  currency: string;
  priceValidityDays: number;
  confidence: number;
  source: string;
  lastUpdated: string;
}

/** A ranked search-result entry (route + ranking metadata). */
interface RankedRoute {
  route: RouteRow;
  score: number;
  rank: number;
  reasons: string[];
}

/** Shape of the `/routes` API response `result` envelope. */
interface RoutesResult {
  results: RankedRoute[];
  total: number;
  bestPrice40Std?: number;
  fastestTransitDays?: number;
}

/** Shape of the `/stats` API response — `stats` may be null when the Brain
 *  capability is not registered yet (graceful degradation). */
interface StatsResponse {
  ok: boolean;
  stats?: {
    totalPorts: number;
    totalLines: number;
    totalRoutes: number;
    totalSchedules: number;
    regionCoverage: Record<string, number>;
    avgPriceByLane: Array<{
      lane: string;
      avgPrice40Std: number;
      routeCount: number;
      avgTransitDays: number;
    }>;
    lastFullSyncAt: string;
  } | null;
  statsError?: string | null;
  dailySyncStatus?: {
    lastSyncAt: string | null;
    nextSyncAt: string | null;
    lastDurationMs: number | null;
    lastRoutesCount: number | null;
    lastErrors: string[];
    isRunning: boolean;
  };
  learningStats?: {
    trackedRoutes: number;
    observedOutcomes: number;
    avgPriceErrorPct: number | null;
    avgTransitErrorDays: number | null;
    lastObservationAt: string | null;
  };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Fetch JSON from a URL with a 15s AbortController timeout. Resolves to the
 * parsed JSON body (typed `T`) or throws on network/HTTP/timeout error.
 */
async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg =
        (body as { error?: string })?.error ||
        `Request failed with status ${res.status}`;
      throw new Error(msg);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

/** Format an integer with thousands separators. */
function formatInt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US");
}

/**
 * Compute a sync-health status badge from the last sync timestamp.
 * Returns "Healthy" (<24h), "Stale" (>24h), or "Never" (null).
 */
function syncHealth(
  lastSyncAt: string | null | undefined,
): { label: string; tone: "healthy" | "stale" | "never" } {
  if (!lastSyncAt) return { label: "Never", tone: "never" };
  const ageMs = Date.now() - new Date(lastSyncAt).getTime();
  if (ageMs < 24 * 3600_000) return { label: "Healthy", tone: "healthy" };
  return { label: "Stale", tone: "stale" };
}

/** Tokenise a region-pair token (e.g. "Asia→Europe") into [origin, dest]. */
function parseRegionPair(token: string): [string, string] | null {
  const idx = token.indexOf("→");
  if (idx === -1) return null;
  return [token.slice(0, idx).trim(), token.slice(idx + 1).trim()];
}

// =============================================================================
// Sub-components
// =============================================================================

/** A single stat card with icon, label, value, and optional sub-label. */
function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  loading,
  accent = "gold",
}: {
  icon: typeof Globe;
  label: string;
  value: string;
  sub?: React.ReactNode;
  loading?: boolean;
  accent?: "gold" | "silver" | "sovereign" | "emerald";
}) {
  const accentColor =
    accent === "gold"
      ? "text-gold"
      : accent === "silver"
        ? "text-silver"
        : accent === "sovereign"
          ? "text-sovereign"
          : "text-emerald-500";
  return (
    <Card className="p-4 relative overflow-hidden border-border/60 bg-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground font-medium">
            {label}
          </p>
          {loading ? (
            <Skeleton className="h-7 w-24 mt-2" />
          ) : (
            <p className="text-2xl font-bold text-card-foreground mt-1 tabular-nums truncate">
              {value}
            </p>
          )}
          {sub && <div className="mt-2 text-xs text-muted-foreground">{sub}</div>}
        </div>
        <div className={`p-2 rounded-lg bg-muted/60 ${accentColor} flex-shrink-0`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </Card>
  );
}

/** Section header — title with optional icon + subtitle. */
function SectionTitle({
  icon: Icon,
  title,
  subtitle,
  right,
}: {
  icon: typeof Globe;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3 mb-3 flex-wrap">
      <div className="flex items-center gap-2 min-w-0">
        <div className="p-1.5 rounded-md bg-muted/60 text-gold flex-shrink-0">
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-card-foreground truncate">
            {title}
          </h2>
          {subtitle && (
            <p className="text-[0.7rem] text-muted-foreground truncate">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {right}
    </div>
  );
}

/** Brain-is-learning animated pulse dot — green when learning is active. */
function LearningPulse({ active }: { active: boolean }) {
  return (
    <span className="relative inline-flex h-2 w-2">
      {active && (
        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
      )}
      <span
        className={`relative inline-flex h-2 w-2 rounded-full ${active ? "bg-emerald-500" : "bg-muted-foreground/50"}`}
      />
    </span>
  );
}

/** Alliance badge with alliance-specific styling. */
function AllianceBadge({ alliance }: { alliance?: string }) {
  if (!alliance || alliance === "standalone") {
    return (
      <Badge variant="outline" className="text-[0.6rem] font-medium border-border/70 text-muted-foreground">
        STANDALONE
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="text-[0.6rem] font-semibold border-gold/40 text-gold bg-gold/5"
    >
      {alliance}
    </Badge>
  );
}

/** Service-type badge (DIRECT vs TRANSSHIPMENT). */
function ServiceTypeBadge({ type }: { type: "DIRECT" | "TRANSSHIPMENT" }) {
  if (type === "DIRECT") {
    return (
      <Badge variant="outline" className="text-[0.6rem] font-medium border-emerald-500/40 text-emerald-600 bg-emerald-500/5">
        DIRECT
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[0.6rem] font-medium border-amber-500/40 text-amber-600 bg-amber-500/5">
      TRANSSHIP
    </Badge>
  );
}

// =============================================================================
// Main component
// =============================================================================

/**
 * WorldwideRoutesDashboard — premium dashboard for the worldwide port-routes
 * database. Renders 4 stat cards, a sticky filter bar, a paginated results
 * table with View/Record-Actual actions, a Brain AI status panel, a region
 * coverage bar chart, and a top-10 lane averages table.
 *
 * Self-contained: all data is fetched from the `/api/sgtx/worldwide-routes/*`
 * routes via `fetch()`. No external data library required.
 */
export function WorldwideRoutesDashboard() {
  // ----- State -----
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // All routes returned by the API (up to FETCH_LIMIT) after client-side
  // filtering. Pagination is computed client-side from this list.
  const [allFilteredRoutes, setAllFilteredRoutes] = useState<RankedRoute[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(true);
  const [routesError, setRoutesError] = useState<string | null>(null);

  // Filters
  const [origin, setOrigin] = useState<string>("");
  const [dest, setDest] = useState<string>("");
  const [line, setLine] = useState<string>("");
  const [regionPair, setRegionPair] = useState<string>("");
  const [maxTransit, setMaxTransit] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [reefer, setReefer] = useState(false);

  // Applied filters (committed on "Search" click)
  const [applied, setApplied] = useState<{
    origin: string;
    dest: string;
    line: string;
    regionPair: string;
    maxTransit: string;
    maxPrice: string;
    reefer: boolean;
  }>({
    origin: "",
    dest: "",
    line: "",
    regionPair: "",
    maxTransit: "",
    maxPrice: "",
    reefer: false,
  });

  const [offset, setOffset] = useState(0);
  const [syncing, setSyncing] = useState(false);

  // Modals
  const [viewRoute, setViewRoute] = useState<RouteRow | null>(null);
  const [learnRoute, setLearnRoute] = useState<RouteRow | null>(null);
  const [learnPrice, setLearnPrice] = useState("");
  const [learnTransit, setLearnTransit] = useState("");
  const [learnSubmitting, setLearnSubmitting] = useState(false);

  // ----- Data fetchers -----
  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    setStatsError(null);
    try {
      const data = await fetchJson<StatsResponse>("/api/sgtx/worldwide-routes/stats");
      setStats(data);
    } catch (e) {
      setStatsError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingStats(false);
    }
  }, []);

  /**
   * Fetch routes from the API. The API's filter params are best-effort — only
   * `origin` maps cleanly to the Brain capability's expected input shape
   * (the capability expects `destination`/`shippingLine` but the API forwards
   * `dest`/`line`). To guarantee correct filtering regardless of the
   * server-side mapping, we fetch a large batch (FETCH_LIMIT=200) with the
   * `origin` filter applied server-side, then apply ALL other filters
   * (dest/line/region-pair/transit/price/reefer) client-side. Pagination is
   * also client-side (PAGE_SIZE=50) so "Next/Prev" actually advances.
   */
  const fetchRoutes = useCallback(async () => {
    setLoadingRoutes(true);
    setRoutesError(null);
    try {
      const params = new URLSearchParams();
      // Fetch the max batch so client-side filters have enough candidates.
      params.set("limit", String(FETCH_LIMIT));
      params.set("offset", "0");
      // `origin` is the only filter that reliably maps to the capability's
      // expected input shape — send it server-side to narrow the candidate set.
      if (applied.origin) params.set("origin", applied.origin);
      // Also forward the other filters (best-effort — currently ignored
      // server-side, but harmless and future-proof if the API is fixed).
      if (applied.dest) params.set("dest", applied.dest);
      if (applied.line) params.set("line", applied.line);
      if (applied.regionPair) params.set("region", applied.regionPair);
      if (applied.maxTransit) params.set("maxTransit", applied.maxTransit);
      if (applied.maxPrice) params.set("maxPrice", applied.maxPrice);
      if (applied.reefer) params.set("reefer", "true");

      const data = await fetchJson<{
        ok: boolean;
        result?: RoutesResult;
        error?: string;
      }>(`/api/sgtx/worldwide-routes/routes?${params.toString()}`);

      let results: RankedRoute[] = data.result?.results ?? [];

      // ----- Client-side filters (the source of truth for what's shown) -----
      if (applied.dest) {
        results = results.filter((r) => r.route.destinationPort === applied.dest);
      }
      if (applied.line) {
        results = results.filter((r) => r.route.shippingLine === applied.line);
      }
      if (applied.regionPair) {
        const pair = parseRegionPair(applied.regionPair);
        if (pair) {
          const [o, d] = pair;
          results = results.filter(
            (r) => r.route.originRegion === o && r.route.destinationRegion === d,
          );
        }
      }
      if (applied.maxTransit) {
        const n = Number(applied.maxTransit);
        if (Number.isFinite(n)) {
          results = results.filter((r) => r.route.transitDays <= n);
        }
      }
      if (applied.maxPrice) {
        const n = Number(applied.maxPrice);
        if (Number.isFinite(n)) {
          results = results.filter((r) => r.route.price40Std <= n);
        }
      }
      if (applied.reefer) {
        results = results.filter((r) => r.route.price40Reefer > 0);
      }

      setAllFilteredRoutes(results);
    } catch (e) {
      setRoutesError(e instanceof Error ? e.message : String(e));
      setAllFilteredRoutes([]);
    } finally {
      setLoadingRoutes(false);
    }
  }, [applied]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  // Refetch routes only when the applied filters change (NOT on every page
  // change — pagination is client-side via useMemo below).
  useEffect(() => {
    void fetchRoutes();
  }, [fetchRoutes]);

  // ----- Client-side pagination -----
  const routes = useMemo(
    () => allFilteredRoutes.slice(offset, offset + PAGE_SIZE),
    [allFilteredRoutes, offset],
  );
  const routesTotal = allFilteredRoutes.length;

  // ----- Actions -----
  const handleSearch = () => {
    setApplied({
      origin,
      dest,
      line,
      regionPair,
      maxTransit,
      maxPrice,
      reefer,
    });
    setOffset(0);
  };

  const handleReset = () => {
    setOrigin("");
    setDest("");
    setLine("");
    setRegionPair("");
    setMaxTransit("");
    setMaxPrice("");
    setReefer(false);
    setApplied({
      origin: "",
      dest: "",
      line: "",
      regionPair: "",
      maxTransit: "",
      maxPrice: "",
      reefer: false,
    });
    setOffset(0);
  };

  const handleRefreshAll = () => {
    void fetchStats();
    void fetchRoutes();
  };

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const res = await fetchJson<{ ok: boolean; error?: string }>(
        "/api/sgtx/worldwide-routes/cron",
        { method: "POST" },
      );
      if (!res.ok) throw new Error(res.error || "Sync failed");
      toast.success("Manual sync completed", {
        description: "Worldwide routes refreshed. Re-fetching stats…",
      });
      // Refetch stats + routes after a successful sync.
      void fetchStats();
      void fetchRoutes();
    } catch (e) {
      toast.error("Manual sync failed", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSyncing(false);
    }
  };

  const openLearn = (route: RouteRow) => {
    setLearnRoute(route);
    setLearnPrice(String(route.price40Std));
    setLearnTransit(String(route.transitDays));
  };

  const submitLearn = async () => {
    if (!learnRoute) return;
    const price = Number(learnPrice);
    const transit = Number(learnTransit);
    if (!Number.isFinite(price) || price < 0) {
      toast.error("Actual price must be a positive number.");
      return;
    }
    if (!Number.isFinite(transit) || transit < 0) {
      toast.error("Actual transit days must be a positive number.");
      return;
    }
    setLearnSubmitting(true);
    try {
      const res = await fetchJson<{ ok: boolean; error?: string }>(
        "/api/sgtx/worldwide-routes/learn",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            routeId: learnRoute.routeId,
            actualPriceUsd: price,
            actualTransitDays: transit,
          }),
        },
      );
      if (!res.ok) throw new Error(res.error || "Submit failed");
      toast.success("Observation recorded", {
        description: `Brain learner updated for ${learnRoute.routeId}.`,
      });
      setLearnRoute(null);
      // Refresh learning stats.
      void fetchStats();
    } catch (e) {
      toast.error("Failed to record observation", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLearnSubmitting(false);
    }
  };

  // ----- Derived data -----
  const statsData = stats?.stats ?? null;
  const dailySync = stats?.dailySyncStatus;
  const learningStats = stats?.learningStats;
  const health = syncHealth(dailySync?.lastSyncAt);
  const brainLearning = (learningStats?.observedOutcomes ?? 0) > 0;

  const regionEntries = useMemo(() => {
    if (!statsData?.regionCoverage) return [];
    return Object.entries(statsData.regionCoverage)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);
  }, [statsData]);

  const regionMax = regionEntries.length
    ? Math.max(...regionEntries.map(([, v]) => v))
    : 1;

  const topLanes = useMemo(() => {
    if (!statsData?.avgPriceByLane) return [];
    return statsData.avgPriceByLane.slice(0, 10);
  }, [statsData]);

  const pagination = {
    from: routesTotal > 0 ? offset + 1 : 0,
    to: offset + routes.length,
    total: routesTotal,
    hasPrev: offset > 0,
    hasNext: offset + PAGE_SIZE < routesTotal,
  };

  // ----- Render -----
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="space-y-5"
    >
      {/* ===== Header bar ===== */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-lg bg-gold/10 text-gold border border-gold/20 flex-shrink-0">
            <Globe className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-card-foreground tracking-tight">
              Worldwide Port Routes
            </h1>
            <p className="text-xs text-muted-foreground">
              All shipping lines · live prices · transit times · Brain-synced
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {brainLearning && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 mr-1">
              <LearningPulse active={brainLearning} />
              <span className="font-medium">Brain is learning</span>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshAll}
            disabled={loadingStats || loadingRoutes}
            className="h-8"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 mr-1.5 ${loadingStats || loadingRoutes ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* ===== Section A — Header stats ===== */}
      {statsError ? (
        <Card className="p-4 border-destructive/40 bg-destructive/5">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-destructive">
                Failed to load stats
              </p>
              <p className="text-xs text-muted-foreground mt-1 break-words">
                {statsError}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchStats()}
              className="h-7"
            >
              Retry
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            icon={RouteIcon}
            label="Total Routes"
            value={formatInt(statsData?.totalRoutes)}
            loading={loadingStats}
            sub={
              <span className="flex items-center gap-1">
                <Activity className="w-3 h-3" />
                {formatInt(statsData?.totalSchedules)} schedules/wk
              </span>
            }
            accent="gold"
          />
          <StatCard
            icon={Ship}
            label="Shipping Lines"
            value={formatInt(statsData?.totalLines)}
            loading={loadingStats}
            sub={
              <span className="flex items-center gap-1">
                <Container className="w-3 h-3" />
                2M · OCEAN · THE · standalone
              </span>
            }
            accent="silver"
          />
          <StatCard
            icon={Anchor}
            label="Ports Covered"
            value={formatInt(statsData?.totalPorts)}
            loading={loadingStats}
            sub={
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                8 global regions
              </span>
            }
            accent="sovereign"
          />
          <StatCard
            icon={Clock}
            label="Last Daily Sync"
            value={dailySync?.lastSyncAt ? timeAgo(dailySync.lastSyncAt) : "Never"}
            loading={loadingStats}
            sub={
              <span className="flex items-center gap-1.5">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    health.tone === "healthy"
                      ? "bg-emerald-500"
                      : health.tone === "stale"
                        ? "bg-amber-500"
                        : "bg-destructive"
                  }`}
                />
                <Badge
                  variant="outline"
                  className={`text-[0.55rem] px-1.5 py-0 ${
                    health.tone === "healthy"
                      ? "border-emerald-500/40 text-emerald-600 bg-emerald-500/5"
                      : health.tone === "stale"
                        ? "border-amber-500/40 text-amber-600 bg-amber-500/5"
                        : "border-destructive/40 text-destructive bg-destructive/5"
                  }`}
                >
                  {health.label}
                </Badge>
                {dailySync?.isRunning && (
                  <span className="text-emerald-600 flex items-center gap-0.5">
                    <Loader2 className="w-3 h-3 animate-spin" /> syncing
                  </span>
                )}
              </span>
            }
            accent="emerald"
          />
        </div>
      )}

      {/* ===== Section B — Filter bar ===== */}
      <Card className="p-4 border-border/60 bg-card sticky top-2 z-30 backdrop-blur-sm shadow-sm">
        <SectionTitle
          icon={Filter}
          title="Filter Routes"
          subtitle="Origin · destination · line · lane · transit · price · reefer"
          right={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleReset} className="h-8">
                <X className="w-3.5 h-3.5 mr-1.5" />
                Reset
              </Button>
              <Button
                size="sm"
                onClick={handleSearch}
                disabled={loadingRoutes}
                className="h-8 bg-gold text-gold-foreground hover:bg-gold-deep"
              >
                {loadingRoutes ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Filter className="w-3.5 h-3.5 mr-1.5" />
                )}
                Search
              </Button>
            </div>
          }
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-1">
          <div className="space-y-1.5">
            <Label className="text-[0.7rem] text-muted-foreground flex items-center gap-1">
              <MapPin className="w-3 h-3" /> Origin Port
            </Label>
            <Select value={origin} onValueChange={setOrigin}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Any origin" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {MAJOR_PORTS.map((p) => (
                  <SelectItem key={p.code} value={p.code}>
                    <span className="font-mono text-[0.7rem] text-muted-foreground mr-2">
                      {p.code}
                    </span>
                    {p.name}
                    <span className="text-muted-foreground ml-1">· {p.country}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[0.7rem] text-muted-foreground flex items-center gap-1">
              <MapPin className="w-3 h-3" /> Destination Port
            </Label>
            <Select value={dest} onValueChange={setDest}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Any destination" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {MAJOR_PORTS.map((p) => (
                  <SelectItem key={p.code} value={p.code}>
                    <span className="font-mono text-[0.7rem] text-muted-foreground mr-2">
                      {p.code}
                    </span>
                    {p.name}
                    <span className="text-muted-foreground ml-1">· {p.country}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[0.7rem] text-muted-foreground flex items-center gap-1">
              <Ship className="w-3 h-3" /> Shipping Line
            </Label>
            <Select value={line} onValueChange={setLine}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All Lines" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {SHIPPING_LINES.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    {l.name}
                    {l.alliance && l.alliance !== "standalone" && (
                      <span className="text-[0.65rem] text-gold ml-1.5">
                        · {l.alliance}
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[0.7rem] text-muted-foreground flex items-center gap-1">
              <Globe className="w-3 h-3" /> Region Pair
            </Label>
            <Select value={regionPair} onValueChange={setRegionPair}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All Lanes" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {REGION_PAIRS.map((r) => (
                  <SelectItem key={r.token} value={r.token}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[0.7rem] text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" /> Max Transit (days)
            </Label>
            <Input
              type="number"
              min={0}
              placeholder="e.g. 30"
              value={maxTransit}
              onChange={(e) => setMaxTransit(e.target.value)}
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[0.7rem] text-muted-foreground flex items-center gap-1">
              <DollarSign className="w-3 h-3" /> Max Price 40&apos; USD
            </Label>
            <Input
              type="number"
              min={0}
              placeholder="e.g. 5000"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              className="h-9"
            />
          </div>

          <div className="space-y-1.5 flex flex-col justify-end">
            <Label className="text-[0.7rem] text-muted-foreground flex items-center gap-1">
              <Snowflake className="w-3 h-3" /> Reefer Required
            </Label>
            <div className="flex items-center gap-2 h-9 px-1">
              <Switch
                checked={reefer}
                onCheckedChange={setReefer}
                aria-label="Reefer required"
              />
              <span className="text-xs text-muted-foreground">
                {reefer ? "Only reefer-capable" : "Any"}
              </span>
            </div>
          </div>

          <div className="space-y-1.5 flex items-end">
            <div className="text-[0.65rem] text-muted-foreground leading-tight border border-border/50 rounded-md px-2 py-1.5 bg-muted/30 w-full">
              <span className="font-medium text-foreground/80">Tip:</span> pick
              origin + destination for the most relevant direct-lane matches.
              Region pair filters apply client-side.
            </div>
          </div>
        </div>
      </Card>

      {/* ===== Main grid: results table (left) + Brain panel (right) ===== */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* ===== Section C — Results table ===== */}
        <div className="xl:col-span-2 space-y-3">
          <Card className="border-border/60 bg-card">
            <div className="p-4 pb-2 flex items-center justify-between gap-3 flex-wrap">
              <SectionTitle
                icon={Container}
                title="Route Results"
                subtitle={
                  loadingRoutes
                    ? "Searching…"
                    : `Showing ${pagination.from}–${pagination.to} of ${formatInt(pagination.total)} routes`
                }
              />
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7"
                  disabled={!pagination.hasPrev || loadingRoutes}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7"
                  disabled={!pagination.hasNext || loadingRoutes}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {routesError ? (
              <div className="p-4">
                <Card className="p-4 border-destructive/40 bg-destructive/5">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-destructive">
                        Failed to load routes
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 break-words">
                        {routesError}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void fetchRoutes()}
                      className="h-7"
                    >
                      Retry
                    </Button>
                  </div>
                </Card>
              </div>
            ) : loadingRoutes ? (
              <div className="p-4 space-y-2">
                {[...Array(8)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : routes.length === 0 ? (
              <div className="p-8 flex flex-col items-center text-center gap-2">
                <div className="p-3 rounded-full bg-muted/60 text-muted-foreground">
                  <Container className="w-6 h-6" />
                </div>
                <p className="text-sm font-medium text-card-foreground">
                  No routes match your filters
                </p>
                <p className="text-xs text-muted-foreground max-w-md">
                  Try widening the search — clear the origin/destination, raise
                  the price/transit caps, or switch the region pair to “All
                  Lanes”.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReset}
                  className="h-8 mt-2"
                >
                  Reset filters
                </Button>
              </div>
            ) : (
              <div className="max-h-[600px] overflow-y-auto scroll-gold">
                <Table>
                  <TableHeader className="sticky top-0 bg-card z-10">
                    <TableRow className="border-border/60 hover:bg-transparent">
                      <TableHead className="text-[0.65rem] uppercase tracking-wider text-muted-foreground font-semibold">
                        Route
                      </TableHead>
                      <TableHead className="text-[0.65rem] uppercase tracking-wider text-muted-foreground font-semibold">
                        Line
                      </TableHead>
                      <TableHead className="text-[0.65rem] uppercase tracking-wider text-muted-foreground font-semibold">
                        Service
                      </TableHead>
                      <TableHead className="text-[0.65rem] uppercase tracking-wider text-muted-foreground font-semibold text-right">
                        Transit
                      </TableHead>
                      <TableHead className="text-[0.65rem] uppercase tracking-wider text-muted-foreground font-semibold text-right">
                        Freq
                      </TableHead>
                      <TableHead className="text-[0.65rem] uppercase tracking-wider text-muted-foreground font-semibold text-right">
                        40&apos; Std
                      </TableHead>
                      <TableHead className="text-[0.65rem] uppercase tracking-wider text-muted-foreground font-semibold text-right">
                        40&apos; Reefer
                      </TableHead>
                      <TableHead className="text-[0.65rem] uppercase tracking-wider text-muted-foreground font-semibold">
                        Type
                      </TableHead>
                      <TableHead className="text-[0.65rem] uppercase tracking-wider text-muted-foreground font-semibold">
                        Status
                      </TableHead>
                      <TableHead className="text-[0.65rem] uppercase tracking-wider text-muted-foreground font-semibold text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {routes.map((rr) => {
                      const r = rr.route;
                      return (
                        <TableRow
                          key={r.routeId}
                          className="border-border/40 hover:bg-muted/30 transition-colors"
                        >
                          <TableCell className="py-2">
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <div className="flex items-center gap-1 text-xs font-medium text-card-foreground">
                                <span className="font-mono text-[0.7rem] text-gold">
                                  {r.originPort}
                                </span>
                                <ArrowRight className="w-3 h-3 text-muted-foreground" />
                                <span className="font-mono text-[0.7rem] text-gold">
                                  {r.destinationPort}
                                </span>
                              </div>
                              <div className="text-[0.65rem] text-muted-foreground truncate max-w-[200px]">
                                {r.originName} → {r.destinationName}
                              </div>
                              {r.transshipmentPort && (
                                <div className="text-[0.6rem] text-amber-600">
                                  via {r.transshipmentPort}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="py-2">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs font-medium text-card-foreground">
                                {r.shippingLineName}
                              </span>
                              <AllianceBadge alliance={r.alliance} />
                            </div>
                          </TableCell>
                          <TableCell className="py-2">
                            <span className="font-mono text-xs text-card-foreground">
                              {r.service}
                            </span>
                          </TableCell>
                          <TableCell className="py-2 text-right">
                            <span className="text-xs font-medium text-card-foreground tabular-nums">
                              {r.transitDays}d
                            </span>
                          </TableCell>
                          <TableCell className="py-2 text-right">
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {r.frequencyPerWeek}/wk
                            </span>
                          </TableCell>
                          <TableCell className="py-2 text-right">
                            <span className="text-xs font-semibold text-card-foreground tabular-nums">
                              {fmtUsd(r.price40Std)}
                            </span>
                          </TableCell>
                          <TableCell className="py-2 text-right">
                            {r.price40Reefer > 0 ? (
                              <span className="text-xs font-medium text-card-foreground tabular-nums flex items-center justify-end gap-0.5">
                                <Snowflake className="w-3 h-3 text-cyan-600" />
                                {fmtUsd(r.price40Reefer)}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="py-2">
                            <ServiceTypeBadge type={r.serviceType} />
                          </TableCell>
                          <TableCell className="py-2">
                            <Badge
                              variant="outline"
                              className="text-[0.6rem] font-medium border-emerald-500/40 text-emerald-600 bg-emerald-500/5"
                            >
                              AVAILABLE
                            </Badge>
                          </TableCell>
                          <TableCell className="py-2">
                            <div className="flex items-center gap-1 justify-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[0.7rem]"
                                onClick={() => setViewRoute(r)}
                              >
                                <Eye className="w-3 h-3 mr-1" />
                                View
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[0.7rem]"
                                onClick={() => openLearn(r)}
                              >
                                <Brain className="w-3 h-3 mr-1" />
                                Record Actual
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Pagination footer */}
            {!loadingRoutes && !routesError && routes.length > 0 && (
              <div className="px-4 py-3 border-t border-border/40 flex items-center justify-between gap-3 flex-wrap">
                <p className="text-[0.7rem] text-muted-foreground">
                  Showing {pagination.from}–{pagination.to} of{" "}
                  {formatInt(pagination.total)} routes · {PAGE_SIZE} per page
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7"
                    disabled={!pagination.hasPrev}
                    onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  >
                    <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                    Prev
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7"
                    disabled={!pagination.hasNext}
                    onClick={() => setOffset(offset + PAGE_SIZE)}
                  >
                    Next
                    <ChevronRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* ===== Section E — Region coverage chart ===== */}
          <Card className="p-4 border-border/60 bg-card">
            <SectionTitle
              icon={Globe}
              title="Region Coverage"
              subtitle="Route touch-points per region (origin + destination counted)"
            />
            {loadingStats || !statsData ? (
              <div className="space-y-2">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            ) : regionEntries.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                No region coverage data available.
              </p>
            ) : (
              <div className="space-y-2">
                {regionEntries.map(([region, count]) => (
                  <div key={region} className="flex items-center gap-3">
                    <div className="w-28 text-xs text-card-foreground font-medium truncate flex-shrink-0">
                      {region}
                    </div>
                    <div className="flex-1 h-5 bg-muted/40 rounded overflow-hidden relative">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(count / regionMax) * 100}%` }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                        className="h-full bg-gradient-to-r from-gold/70 to-gold-deep/80 rounded"
                      />
                      <span className="absolute inset-0 flex items-center px-2 text-[0.65rem] font-semibold text-card-foreground tabular-nums">
                        {formatInt(count)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* ===== Right column: Brain AI panel + lane averages ===== */}
        <div className="space-y-5">
          {/* ===== Section D — Brain AI status panel ===== */}
          <Card className="p-4 border-border/60 bg-card">
            <SectionTitle
              icon={Brain}
              title="Brain AI Status"
              subtitle="Daily sync + learning loop"
              right={
                <div className="flex items-center gap-1.5 text-[0.7rem]">
                  <LearningPulse active={brainLearning} />
                  <span
                    className={
                      brainLearning
                        ? "text-emerald-600 font-medium"
                        : "text-muted-foreground"
                    }
                  >
                    {brainLearning ? "Learning" : "Idle"}
                  </span>
                </div>
              }
            />

            {loadingStats || !dailySync ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : (
              <>
                {/* Daily sync block */}
                <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-card-foreground">
                      <RefreshCw
                        className={`w-3.5 h-3.5 text-gold ${dailySync.isRunning ? "animate-spin" : ""}`}
                      />
                      Daily Sync
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[0.6rem] ${
                        health.tone === "healthy"
                          ? "border-emerald-500/40 text-emerald-600 bg-emerald-500/5"
                          : health.tone === "stale"
                            ? "border-amber-500/40 text-amber-600 bg-amber-500/5"
                            : "border-destructive/40 text-destructive bg-destructive/5"
                      }`}
                    >
                      {health.label}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[0.7rem]">
                    <div>
                      <p className="text-muted-foreground">Last sync</p>
                      <p className="text-card-foreground font-medium">
                        {dailySync.lastSyncAt
                          ? fmtDateTime(dailySync.lastSyncAt)
                          : "Never"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Next sync</p>
                      <p className="text-card-foreground font-medium">
                        {dailySync.nextSyncAt
                          ? fmtDateTime(dailySync.nextSyncAt)
                          : "Pending"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Duration</p>
                      <p className="text-card-foreground font-medium tabular-nums">
                        {dailySync.lastDurationMs != null
                          ? `${(dailySync.lastDurationMs / 1000).toFixed(1)}s`
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Routes synced</p>
                      <p className="text-card-foreground font-medium tabular-nums">
                        {formatInt(dailySync.lastRoutesCount)}
                      </p>
                    </div>
                  </div>
                  {dailySync.lastErrors && dailySync.lastErrors.length > 0 && (
                    <div className="text-[0.65rem] text-amber-600 flex items-start gap-1 mt-1">
                      <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      <span className="break-words">
                        {dailySync.lastErrors.length} error(s) in last sync —
                        see server logs.
                      </span>
                    </div>
                  )}
                </div>

                {/* Learning stats block */}
                <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2 mt-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-card-foreground">
                    <TrendingUp className="w-3.5 h-3.5 text-gold" />
                    Learning Stats
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[0.7rem]">
                    <div>
                      <p className="text-muted-foreground">Tracked routes</p>
                      <p className="text-card-foreground font-medium tabular-nums">
                        {formatInt(learningStats?.trackedRoutes)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Observed outcomes</p>
                      <p className="text-card-foreground font-medium tabular-nums">
                        {formatInt(learningStats?.observedOutcomes)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Avg price error</p>
                      <p className="text-card-foreground font-medium tabular-nums">
                        {learningStats?.avgPriceErrorPct != null
                          ? `${(learningStats.avgPriceErrorPct * 100).toFixed(1)}%`
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Avg transit error</p>
                      <p className="text-card-foreground font-medium tabular-nums">
                        {learningStats?.avgTransitErrorDays != null
                          ? `${learningStats.avgTransitErrorDays.toFixed(1)}d`
                          : "—"}
                      </p>
                    </div>
                  </div>
                  <div className="text-[0.65rem] text-muted-foreground">
                    <Calendar className="w-3 h-3 inline mr-1" />
                    Last observation:{" "}
                    {learningStats?.lastObservationAt
                      ? timeAgo(learningStats.lastObservationAt)
                      : "none yet"}
                  </div>
                </div>

                {/* Manual sync trigger */}
                <Button
                  className="w-full mt-3 h-9 bg-gold text-gold-foreground hover:bg-gold-deep"
                  onClick={handleManualSync}
                  disabled={syncing || dailySync.isRunning}
                >
                  {syncing || dailySync.isRunning ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Syncing…
                    </>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5 mr-1.5" />
                      Trigger Manual Sync
                    </>
                  )}
                </Button>
              </>
            )}
          </Card>

          {/* ===== Section F — Lane price averages ===== */}
          <Card className="p-4 border-border/60 bg-card">
            <SectionTitle
              icon={TrendingUp}
              title="Lane Price Averages"
              subtitle="Top 10 trade lanes by route count"
            />
            {loadingStats || !statsData ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : topLanes.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                No lane averages available.
              </p>
            ) : (
              <div className="space-y-1.5">
                <div className="grid grid-cols-12 gap-2 text-[0.6rem] uppercase tracking-wider text-muted-foreground font-semibold px-1">
                  <div className="col-span-5">Lane</div>
                  <div className="col-span-2 text-right">Routes</div>
                  <div className="col-span-3 text-right">Avg 40&apos;</div>
                  <div className="col-span-2 text-right">Transit</div>
                </div>
                {topLanes.map((lane) => (
                  <div
                    key={lane.lane}
                    className="grid grid-cols-12 gap-2 items-center px-1 py-1.5 rounded hover:bg-muted/30 text-xs"
                  >
                    <div className="col-span-5 text-card-foreground font-medium truncate">
                      {lane.lane}
                    </div>
                    <div className="col-span-2 text-right text-muted-foreground tabular-nums">
                      {formatInt(lane.routeCount)}
                    </div>
                    <div className="col-span-3 text-right text-card-foreground font-semibold tabular-nums">
                      {fmtUsd(lane.avgPrice40Std)}
                    </div>
                    <div className="col-span-2 text-right text-muted-foreground tabular-nums">
                      {lane.avgTransitDays}d
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* ===== View Route Detail Dialog ===== */}
      <Dialog
        open={!!viewRoute}
        onOpenChange={(o) => !o && setViewRoute(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <RouteIcon className="w-4 h-4 text-gold" />
              Route Detail
            </DialogTitle>
            <DialogDescription>
              Full rate-card detail for this shipping lane.
            </DialogDescription>
          </DialogHeader>
          {viewRoute && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                  <p className="text-[0.65rem] text-muted-foreground uppercase tracking-wider">
                    Origin
                  </p>
                  <p className="text-sm font-semibold text-card-foreground">
                    {viewRoute.originName}
                  </p>
                  <p className="text-[0.7rem] font-mono text-gold">
                    {viewRoute.originPort} · {viewRoute.originCountry} ·{" "}
                    {viewRoute.originRegion}
                  </p>
                </div>
                <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                  <p className="text-[0.65rem] text-muted-foreground uppercase tracking-wider">
                    Destination
                  </p>
                  <p className="text-sm font-semibold text-card-foreground">
                    {viewRoute.destinationName}
                  </p>
                  <p className="text-[0.7rem] font-mono text-gold">
                    {viewRoute.destinationPort} · {viewRoute.destinationCountry}{" "}
                    · {viewRoute.destinationRegion}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <p className="text-[0.65rem] text-muted-foreground">Shipping line</p>
                  <p className="text-xs font-medium text-card-foreground">
                    {viewRoute.shippingLineName}
                  </p>
                  <AllianceBadge alliance={viewRoute.alliance} />
                </div>
                <div>
                  <p className="text-[0.65rem] text-muted-foreground">Service</p>
                  <p className="text-xs font-medium text-card-foreground font-mono">
                    {viewRoute.service}
                  </p>
                </div>
                <div>
                  <p className="text-[0.65rem] text-muted-foreground">Transit</p>
                  <p className="text-xs font-medium text-card-foreground tabular-nums">
                    {viewRoute.transitDays} days
                  </p>
                </div>
                <div>
                  <p className="text-[0.65rem] text-muted-foreground">Frequency</p>
                  <p className="text-xs font-medium text-card-foreground tabular-nums">
                    {viewRoute.frequencyPerWeek}× / week
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                <p className="text-[0.65rem] text-muted-foreground uppercase tracking-wider mb-2">
                  Container Pricing (USD)
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <div>
                    <p className="text-[0.6rem] text-muted-foreground">20&apos; Std</p>
                    <p className="text-sm font-semibold tabular-nums">
                      {fmtUsd(viewRoute.price20Std)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[0.6rem] text-muted-foreground">40&apos; Std</p>
                    <p className="text-sm font-semibold text-gold tabular-nums">
                      {fmtUsd(viewRoute.price40Std)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[0.6rem] text-muted-foreground">40&apos; HC</p>
                    <p className="text-sm font-semibold tabular-nums">
                      {fmtUsd(viewRoute.price40Hc)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[0.6rem] text-muted-foreground">20&apos; Reefer</p>
                    <p className="text-sm font-semibold tabular-nums">
                      {viewRoute.price20Reefer > 0
                        ? fmtUsd(viewRoute.price20Reefer)
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[0.6rem] text-muted-foreground">40&apos; Reefer</p>
                    <p className="text-sm font-semibold tabular-nums">
                      {viewRoute.price40Reefer > 0
                        ? fmtUsd(viewRoute.price40Reefer)
                        : "—"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[0.7rem]">
                <div>
                  <p className="text-muted-foreground">Service type</p>
                  <ServiceTypeBadge type={viewRoute.serviceType} />
                </div>
                {viewRoute.transshipmentPort && (
                  <div>
                    <p className="text-muted-foreground">Transhipment via</p>
                    <p className="font-mono text-card-foreground">
                      {viewRoute.transshipmentPort}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground">Confidence</p>
                  <div className="flex items-center gap-2">
                    <Progress
                      value={Math.round(viewRoute.confidence * 100)}
                      className="h-1.5 w-16"
                    />
                    <span className="tabular-nums">
                      {Math.round(viewRoute.confidence * 100)}%
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-muted-foreground">Source</p>
                  <p className="text-card-foreground">
                    {viewRoute.source === "database" ? "Database" : "AI estimate"}
                  </p>
                </div>
              </div>

              <div className="text-[0.65rem] text-muted-foreground border-t border-border/40 pt-2 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Last updated {timeAgo(viewRoute.lastUpdated)} · valid for{" "}
                {viewRoute.priceValidityDays} days
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => viewRoute && openLearn(viewRoute)}
            >
              <Brain className="w-3.5 h-3.5 mr-1.5" />
              Record Actual
            </Button>
            <Button
              size="sm"
              onClick={() => setViewRoute(null)}
              className="bg-gold text-gold-foreground hover:bg-gold-deep"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Record Actual Dialog ===== */}
      <Dialog
        open={!!learnRoute}
        onOpenChange={(o) => {
          if (!o) setLearnRoute(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Brain className="w-4 h-4 text-gold" />
              Record Actual Outcome
            </DialogTitle>
            <DialogDescription>
              Feed an observed price + transit back to the Brain learner so it
              can adjust its predictions over time.
            </DialogDescription>
          </DialogHeader>
          {learnRoute && (
            <div className="space-y-3">
              <div className="rounded-md bg-muted/30 p-2 border border-border/50">
                <p className="text-[0.7rem] text-muted-foreground">Route</p>
                <p className="text-xs font-mono text-card-foreground">
                  {learnRoute.routeId}
                </p>
                <p className="text-[0.7rem] text-muted-foreground mt-1">
                  Predicted: 40&apos; Std {fmtUsd(learnRoute.price40Std)} ·{" "}
                  {learnRoute.transitDays}d transit
                </p>
              </div>
              <div className="space-y-2">
                <div>
                  <Label className="text-[0.7rem] text-muted-foreground flex items-center gap-1">
                    <DollarSign className="w-3 h-3" />
                    Actual 40&apos; Std Price (USD)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    value={learnPrice}
                    onChange={(e) => setLearnPrice(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div>
                  <Label className="text-[0.7rem] text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Actual Transit (days)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    value={learnTransit}
                    onChange={(e) => setLearnTransit(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLearnRoute(null)}
              disabled={learnSubmitting}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={submitLearn}
              disabled={learnSubmitting}
              className="bg-gold text-gold-foreground hover:bg-gold-deep"
            >
              {learnSubmitting ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
              )}
              Record Observation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* End of dashboard — scrollbar styling handled via global `.scroll-gold` class. */}
    </motion.div>
  );
}
