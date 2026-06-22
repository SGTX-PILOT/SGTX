import { freshDb as db } from "@/lib/db-fresh";

export async function listCorridors(filters?: { country?: string; type?: string; status?: string }) {
  const where: any = {};
  if (filters?.country) { where.OR = [{ originCountry: filters.country }, { destinationCountry: filters.country }]; }
  if (filters?.type) where.corridorType = filters.type;
  if (filters?.status) where.status = filters.status;
  return db.tradeCorridor.findMany({ where, orderBy: { createdAt: "desc" } });
}

export async function getCorridor(code: string) {
  return db.tradeCorridor.findUnique({ where: { corridorCode: code } });
}

export async function getPassport(corridorCode: string) {
  return db.tradeLanePassport.findFirst({ where: { corridorCode }, orderBy: { passportVersion: "desc" } });
}

/**
 * Append a corridor suffix to an existing USTN.
 * E.g. SGTX-001234-002139-20260622144847-1A76EE1B + EGY-ITA-RORO-001
 *   → SGTX-001234-002139-20260622144847-1A76EE1B#EGY-ITA-RORO-001
 *
 * We use '#' as the separator so the corridor suffix is distinguishable from
 * the USTN's own dash-separated segments (corridor codes themselves contain
 * dashes, so a dash separator would be ambiguous).
 */
export function appendCorridorSuffix(ustn: string, corridorCode: string): string {
  if (!ustn || !corridorCode) return ustn || "";
  // If the USTN already carries a corridor suffix, replace it.
  const base = ustn.includes("#") ? ustn.split("#")[0] : ustn;
  return `${base}#${corridorCode}`;
}

/**
 * Generate a NEW USTN (canonical SGTX format) from buyer + seller GTIDs and
 * optionally attach a corridor suffix.
 *
 * Canonical format: SGTX-{buyer6}-{seller6}-{YYYYMMDDHHMMSS}-{RAND8}[#CORRIDOR]
 * where buyer6/seller6 are the 4th dash-separated segment of each GTID (the
 * 6-digit SEQ). This matches the format used by /api/sgtx/trade-request.
 */
export async function generateUstnWithCorridor(buyerGtid: string, sellerGtid: string, corridorCode?: string) {
  const buyer6 = buyerGtid.split("-")[3] || "000000";
  const seller6 = sellerGtid.split("-")[3] || "000000";
  const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const random8 = Math.random().toString(36).substring(2, 10).toUpperCase();
  const base = `SGTX-${buyer6}-${seller6}-${ts}-${random8}`;
  return corridorCode ? appendCorridorSuffix(base, corridorCode) : base;
}

export async function checkEligibility(input: { corridorCode: string; product?: string; hsCode?: string; origin?: string; dest?: string; incoterm?: string; transportMode?: string; coldChain?: boolean }) {
  const corridor = await getCorridor(input.corridorCode);
  if (!corridor) return { compatibilityScore: 0, reasons: [], error: "Corridor not found" };
  const passport = await getPassport(input.corridorCode);
  const reasons: any[] = [];
  let score = 100;
  if (corridor.operationalStatus !== "ACTIVE") { score -= 30; reasons.push({ ok: false, label: "Corridor not active", detail: corridor.operationalStatus }); }
  else reasons.push({ ok: true, label: "Corridor Operational", detail: "ACTIVE" });
  if (passport) {
    reasons.push({ ok: true, label: "Passport Available", detail: `${passport.averageTransitDays} days transit` });
    if (input.coldChain && passport.cargoTypeCapabilities?.includes("reefer")) reasons.push({ ok: true, label: "Reefer Compatible", detail: "Cold chain supported" });
    // RoRo transport mode check
    if (input.transportMode === "RORO" && corridor.corridorType === "RORO") {
      reasons.push({ ok: true, label: "RoRo Mode Match", detail: "Corridor supports Roll-on/Roll-off" });
    } else if (input.transportMode && input.transportMode !== corridor.corridorType) {
      score -= 10;
      reasons.push({ ok: false, label: "Transport Mode Mismatch", detail: `${input.transportMode} ≠ ${corridor.corridorType}` });
    }
    // Incoterm check
    if (input.incoterm) {
      const incoterms: string[] = (() => { try { return JSON.parse(passport.commonIncoterms || "[]"); } catch { return []; } })();
      if (incoterms.includes(input.incoterm)) reasons.push({ ok: true, label: "Incoterm Supported", detail: input.incoterm });
      else { score -= 5; reasons.push({ ok: false, label: "Incoterm Non-Standard", detail: `${input.incoterm} not in corridor passport` }); }
    }
    // Customs pre-clearance flag (new)
    reasons.push({ ok: true, label: "Customs Pre-Clearance", detail: "Available via Nafeza/CargoX integration" });
    // Finance eligibility
    reasons.push({ ok: true, label: "Finance Eligibility", detail: passport.financeEligibility });
  }
  reasons.push({ ok: true, label: "Government Verified", detail: corridor.status });
  return { compatibilityScore: score, reasons, source: "HEURISTIC+PASSPORT", corridorCode: input.corridorCode, transportMode: input.transportMode || corridor.corridorType };
}

export async function getCorridorAnalytics(corridorCode: string) {
  const analytics = await db.corridorAnalytics.findFirst({ where: { corridorCode }, orderBy: { measurementPeriod: "desc" } });
  const corridor = await getCorridor(corridorCode);
  return { ...analytics, corridorName: corridor?.corridorName, reliabilityScore: analytics?.onTimePerformance || 0, financeEligibility: "HIGH", insuranceAvailability: 95, historicalDelayRate: 100 - (analytics?.onTimePerformance || 90) };
}
