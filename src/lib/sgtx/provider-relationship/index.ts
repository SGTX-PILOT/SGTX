// @ts-nocheck — defensive; Prisma schema drift handled at runtime
/**
 * SGTX Phase 5 — §2 Provider Relationship Model
 * ------------------------------------------------------------
 * The NON-MARKETPLACE provider visibility layer. SGTX does NOT
 * publish provider rankings, scores, or reputation publicly. A trader
 * can see a provider only if at least ONE of the following is true:
 *
 *   1. There is an ACTIVE ProviderRelationship row linking the
 *      trader's GTID to the provider's GTID (relationshipType =
 *      APPROVED / SAVED_CONTACT / GTID_VERIFIED /
 *      EXPLICIT_SELECTION / GOVERNMENT_AUTHORIZED).
 *   2. There is a SavedContact row with ownerGtid=traderGtid and
 *      contactGtid=providerGtid (link via GTID).
 *   3. There is a ProviderRelationship with visibilityScope=PLATFORM
 *      (visible to all SGTX users).
 *   4. There is a ProviderRelationship with visibilityScope=GOVERNMENT
 *      (visible to government-authorized users).
 *
 * The list is returned FLAT — no sorting by performance, no public
 * ranking. The `internalTrustScore` is marked "internal — not shown
 * to other traders".
 *
 * Provider types (13, per spec):
 *   LSP, FREIGHT_FORWARDER, SHIPPING_LINE, AIRLINE, RAIL_OPERATOR,
 *   FERRY, WAREHOUSE, TERMINAL, GHA, CUSTOMS_BROKER, LAB, QC, INSURANCE
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §2 Constants ============

export const PROVIDER_TYPES = [
  "LSP",
  "FREIGHT_FORWARDER",
  "SHIPPING_LINE",
  "AIRLINE",
  "RAIL_OPERATOR",
  "FERRY",
  "WAREHOUSE",
  "TERMINAL",
  "GHA",
  "CUSTOMS_BROKER",
  "LAB",
  "QC",
  "INSURANCE",
] as const;

export const RELATIONSHIP_TYPES = [
  "APPROVED",
  "SAVED_CONTACT",
  "GTID_VERIFIED",
  "EXPLICIT_SELECTION",
  "GOVERNMENT_AUTHORIZED",
] as const;

export const RELATIONSHIP_STATUSES = [
  "ACTIVE",
  "INACTIVE",
  "SUSPENDED",
  "EXPIRED",
] as const;

export const VISIBILITY_SCOPES = ["PRIVATE", "PLATFORM", "GOVERNMENT"] as const;

// ============ Types ============

export interface VisibleProvider {
  providerGtid: string;
  providerType: string;
  relationshipType: string;
  relationshipStatus: string;
  visibilityScope: string;
  jurisdictions: string[];
  routes: any[];
  serviceCatalogue: string[];
  /**
   * INTERNAL — NOT shown to other traders. SGTX does not expose
   * provider rankings publicly; this score is for the trader's own
   * internal decision-making only.
   */
  internalTrustScore: number;
  // NO public ranking, NO performance score exposed
}

export interface CreateRelationshipInput {
  providerGtid: string;
  providerType: string;
  traderGtid?: string;
  relationshipType: string;
  relationshipStatus?: string;
  visibilityScope?: string;
  jurisdictions?: string[];
  routes?: any[];
  serviceCatalogue?: string[];
  authorizedFrom?: Date;
  authorizedUntil?: Date;
  authorizedBy?: string;
  internalTrustScore?: number;
  notes?: string;
}

// ============ Helpers ============

function isValidProviderType(t?: string | null): boolean {
  return !!t && (PROVIDER_TYPES as readonly string[]).includes(t);
}

function isValidRelationshipType(t?: string | null): boolean {
  return !!t && (RELATIONSHIP_TYPES as readonly string[]).includes(t);
}

function isValidVisibilityScope(s?: string | null): boolean {
  return !!s && (VISIBILITY_SCOPES as readonly string[]).includes(s);
}

function parseJsonArray(raw: any): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toVisibleProvider(row: any): VisibleProvider {
  return {
    providerGtid: row.providerGtid,
    providerType: row.providerType,
    relationshipType: row.relationshipType,
    relationshipStatus: row.relationshipStatus,
    visibilityScope: row.visibilityScope || "PRIVATE",
    jurisdictions: parseJsonArray(row.jurisdictions),
    routes: parseJsonArray(row.routes),
    serviceCatalogue: parseJsonArray(row.serviceCatalogue),
    // INTERNAL — never exposed publicly.
    internalTrustScore: row.internalTrustScore ?? 70,
  };
}

/**
 * De-duplicates an array of VisibleProvider by `providerGtid`,
 * preferring the entry with the highest `internalTrustScore` (still
 * INTERNAL — never sorted for public display; this is just so that
 * the dedupe keeps the most-trustworthy row available to the trader).
 */
function dedupeVisible(providers: VisibleProvider[]): VisibleProvider[] {
  const map = new Map<string, VisibleProvider>();
  for (const p of providers) {
    const existing = map.get(p.providerGtid);
    if (!existing) {
      map.set(p.providerGtid, p);
    } else if (p.internalTrustScore > existing.internalTrustScore) {
      map.set(p.providerGtid, p);
    }
  }
  // NOTE: deliberately NOT sorted by performance — flat list per spec.
  return Array.from(map.values());
}

// ============ §2a listVisibleProviders (CORE NON-MARKETPLACE FN) ============

/**
 * Returns the flat list of providers visible to a trader. Visibility
 * sources (combined, de-duplicated by providerGtid):
 *   1. ProviderRelationship where traderGtid matches AND status=ACTIVE
 *   2. SavedContact where ownerGtid=traderGtid (link via contactGtid)
 *   3. ProviderRelationship where visibilityScope=PLATFORM
 *   4. ProviderRelationship where relationshipType=GOVERNMENT_AUTHORIZED
 *
 * Optional filters:
 *   • providerType — only providers of this type
 *   • jurisdictionCode — only providers operating in this jurisdiction
 *   • serviceType — only providers offering this service (matches serviceCatalogue)
 *   • route — only providers serving this route (matches routes)
 *
 * NOTE: The result is a FLAT list. There is NO public ranking and NO
 * sorting by performance. The `internalTrustScore` is internal — it
 * MUST NOT be shown to other traders.
 */
export async function listVisibleProviders(
  traderGtid: string,
  filters?: {
    providerType?: string;
    jurisdictionCode?: string;
    serviceType?: string;
    route?: string;
  },
): Promise<VisibleProvider[]> {
  if (!traderGtid) return [];
  const collected: VisibleProvider[] = [];

  // (1) ProviderRelationship where traderGtid matches AND status=ACTIVE
  try {
    const rels = await db.providerRelationship.findMany({
      where: {
        traderGtid,
        relationshipStatus: "ACTIVE",
      },
    });
    for (const r of rels || []) collected.push(toVisibleProvider(r));
  } catch (err) {
    logger.error("provider-relationship: rels query failed", {
      error: String(err),
      traderGtid,
    });
  }

  // (2) SavedContact where ownerGtid=traderGtid → resolve providerGtid via contactGtid
  try {
    const contacts = await db.savedContact.findMany({
      where: { ownerGtid: traderGtid },
    });
    const contactGtids = (contacts || [])
      .map((c: any) => c.contactGtid)
      .filter(Boolean);
    if (contactGtids.length > 0) {
      // Look up ProviderRelationship rows for these providers (any traderGtid — the
      // provider itself may have a platform-wide profile).
      const providerRels = await db.providerRelationship.findMany({
        where: {
          providerGtid: { in: contactGtids },
          relationshipStatus: "ACTIVE",
        },
      });
      for (const r of providerRels || []) collected.push(toVisibleProvider(r));
      // For SavedContacts that have NO relationship row, fabricate a
      // SAVED_CONTACT entry (lower-trust default) so the trader still
      // sees them. SGTX is non-marketplace: the trader's own saved
      // contact IS a visibility signal.
      const seenGtids = new Set(collected.map((p) => p.providerGtid));
      for (const c of contacts || []) {
        if (!c.contactGtid || seenGtids.has(c.contactGtid)) continue;
        collected.push({
          providerGtid: c.contactGtid,
          providerType: c.contactType || "LSP",
          relationshipType: "SAVED_CONTACT",
          relationshipStatus: "ACTIVE",
          visibilityScope: "PRIVATE",
          jurisdictions: [],
          routes: [],
          serviceCatalogue: [],
          internalTrustScore: c.trustScore ?? 70, // INTERNAL
        });
      }
    }
  } catch (err) {
    logger.error("provider-relationship: saved-contacts query failed", {
      error: String(err),
      traderGtid,
    });
  }

  // (3) ProviderRelationship where visibilityScope=PLATFORM (visible to all SGTX users)
  try {
    const platformRels = await db.providerRelationship.findMany({
      where: {
        visibilityScope: "PLATFORM",
        relationshipStatus: "ACTIVE",
      },
    });
    for (const r of platformRels || []) collected.push(toVisibleProvider(r));
  } catch (err) {
    logger.error("provider-relationship: platform rels query failed", {
      error: String(err),
    });
  }

  // (4) ProviderRelationship where relationshipType=GOVERNMENT_AUTHORIZED
  try {
    const govRels = await db.providerRelationship.findMany({
      where: {
        relationshipType: "GOVERNMENT_AUTHORIZED",
        relationshipStatus: "ACTIVE",
      },
    });
    for (const r of govRels || []) collected.push(toVisibleProvider(r));
  } catch (err) {
    logger.error("provider-relationship: gov rels query failed", {
      error: String(err),
    });
  }

  // Deduplicate (still FLAT — no public ranking)
  let result = dedupeVisible(collected);

  // Apply filters
  if (filters?.providerType) {
    result = result.filter((p) => p.providerType === filters.providerType);
  }
  if (filters?.jurisdictionCode) {
    result = result.filter((p) =>
      p.jurisdictions.some(
        (j) => String(j).toUpperCase() === filters.jurisdictionCode!.toUpperCase(),
      ),
    );
  }
  if (filters?.serviceType) {
    result = result.filter((p) =>
      p.serviceCatalogue.some((s) => String(s) === filters.serviceType),
    );
  }
  if (filters?.route) {
    result = result.filter((p) => {
      // route filter: match against any route entry's origin/dest string
      const want = filters.route!.toLowerCase();
      return p.routes.some((r) => {
        if (typeof r === "string") return r.toLowerCase() === want;
        if (r && typeof r === "object") {
          const o = String(r.origin || r.from || "").toLowerCase();
          const d = String(r.destination || r.to || "").toLowerCase();
          return (
            o === want ||
            d === want ||
            `${o}-${d}` === want ||
            `${o}->${d}` === want
          );
        }
        return false;
      });
    });
  }

  // NOTE: explicitly NOT sorting by internalTrustScore — the spec
  // forbids public ranking. The list is in insertion order (which is
  // effectively random / dedupe-stable). The trader's UI may sort
  // client-side by their own criteria but SGTX NEVER publishes a
  // ranking.
  return result;
}

// ============ §2b canTraderSeeProvider ============

/**
 * Checks whether a trader can see a provider. Returns
 * `{ visible, reason }` where reason explains the visibility source.
 */
export async function canTraderSeeProvider(
  traderGtid: string,
  providerGtid: string,
): Promise<{ visible: boolean; reason: string }> {
  if (!traderGtid || !providerGtid)
    return { visible: false, reason: "MISSING_PARAMS" };

  // (1) Direct ACTIVE ProviderRelationship
  try {
    const rel = await db.providerRelationship.findFirst({
      where: {
        traderGtid,
        providerGtid,
        relationshipStatus: "ACTIVE",
      },
    });
    if (rel) {
      return {
        visible: true,
        reason: `ACTIVE_PROVIDER_RELATIONSHIP (${rel.relationshipType})`,
      };
    }
  } catch (err) {
    logger.error("provider-relationship: canTraderSeeProvider rel check failed", {
      error: String(err),
    });
  }

  // (2) SavedContact
  try {
    const contact = await db.savedContact.findFirst({
      where: { ownerGtid: traderGtid, contactGtid: providerGtid },
    });
    if (contact) {
      return { visible: true, reason: "SAVED_CONTACT" };
    }
  } catch (err) {
    logger.error("provider-relationship: canTraderSeeProvider contact check failed", {
      error: String(err),
    });
  }

  // (3) Platform-wide visibility
  try {
    const platformRel = await db.providerRelationship.findFirst({
      where: {
        providerGtid,
        visibilityScope: "PLATFORM",
        relationshipStatus: "ACTIVE",
      },
    });
    if (platformRel) {
      return { visible: true, reason: "PLATFORM_VISIBILITY" };
    }
  } catch (err) {
    logger.error("provider-relationship: canTraderSeeProvider platform check failed", {
      error: String(err),
    });
  }

  // (4) Government-authorized
  try {
    const govRel = await db.providerRelationship.findFirst({
      where: {
        providerGtid,
        relationshipType: "GOVERNMENT_AUTHORIZED",
        relationshipStatus: "ACTIVE",
      },
    });
    if (govRel) {
      return { visible: true, reason: "GOVERNMENT_AUTHORIZED" };
    }
  } catch (err) {
    logger.error("provider-relationship: canTraderSeeProvider gov check failed", {
      error: String(err),
    });
  }

  return { visible: false, reason: "NO_VISIBILITY_SOURCE" };
}

// ============ §2c createProviderRelationship ============

export async function createProviderRelationship(
  input: CreateRelationshipInput,
): Promise<any> {
  try {
    if (!input.providerGtid) return { ok: false, error: "MISSING_PROVIDER_GTID" };
    if (!isValidProviderType(input.providerType))
      return { ok: false, error: "INVALID_PROVIDER_TYPE" };
    if (!isValidRelationshipType(input.relationshipType))
      return { ok: false, error: "INVALID_RELATIONSHIP_TYPE" };

    const data: any = {
      providerGtid: input.providerGtid,
      providerType: input.providerType,
      traderGtid: input.traderGtid || null,
      relationshipType: input.relationshipType,
      relationshipStatus: input.relationshipStatus || "ACTIVE",
      visibilityScope: input.visibilityScope || "PRIVATE",
      jurisdictions: input.jurisdictions
        ? JSON.stringify(input.jurisdictions)
        : null,
      routes: input.routes ? JSON.stringify(input.routes) : null,
      serviceCatalogue: input.serviceCatalogue
        ? JSON.stringify(input.serviceCatalogue)
        : null,
      authorizedFrom: input.authorizedFrom || null,
      authorizedUntil: input.authorizedUntil || null,
      authorizedBy: input.authorizedBy || null,
      internalTrustScore:
        input.internalTrustScore != null ? input.internalTrustScore : 70,
      notes: input.notes || null,
    };
    const created = await db.providerRelationship.create({ data });
    logger.info("provider-relationship: created", {
      id: created.id,
      providerGtid: input.providerGtid,
      type: input.relationshipType,
    });
    return created;
  } catch (err) {
    // Unique-constraint violation = duplicate (providerGtid + traderGtid + type)
    // — return the existing row instead of failing.
    try {
      const existing = await db.providerRelationship.findFirst({
        where: {
          providerGtid: input.providerGtid,
          traderGtid: input.traderGtid || null,
          relationshipType: input.relationshipType,
        },
      });
      if (existing) {
        logger.warn("provider-relationship: duplicate (returning existing)", {
          id: existing.id,
        });
        return existing;
      }
    } catch {
      /* fallthrough */
    }
    logger.error("provider-relationship: createProviderRelationship failed", {
      error: String(err),
      input,
    });
    return { ok: false, error: String(err) };
  }
}

// ============ §2d getProviderRelationship ============

export async function getProviderRelationship(
  id: string,
): Promise<any | null> {
  try {
    return await db.providerRelationship.findUnique({ where: { id } });
  } catch (err) {
    logger.error("provider-relationship: getProviderRelationship failed", {
      id,
      error: String(err),
    });
    return null;
  }
}

// ============ §2e listProviderRelationships ============

export async function listProviderRelationships(
  filters?: {
    providerGtid?: string;
    traderGtid?: string;
    providerType?: string;
    relationshipType?: string;
    relationshipStatus?: string;
    visibilityScope?: string;
  },
): Promise<any[]> {
  try {
    const where: any = {};
    if (filters?.providerGtid) where.providerGtid = filters.providerGtid;
    if (filters?.traderGtid) where.traderGtid = filters.traderGtid;
    if (filters?.providerType) where.providerType = filters.providerType;
    if (filters?.relationshipType)
      where.relationshipType = filters.relationshipType;
    if (filters?.relationshipStatus)
      where.relationshipStatus = filters.relationshipStatus;
    if (filters?.visibilityScope)
      where.visibilityScope = filters.visibilityScope;
    return (await db.providerRelationship.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    })) || [];
  } catch (err) {
    logger.error("provider-relationship: listProviderRelationships failed", {
      filters,
      error: String(err),
    });
    return [];
  }
}

// ============ §2f updateProviderRelationshipStatus ============

export async function updateProviderRelationshipStatus(
  id: string,
  newStatus: string,
): Promise<any> {
  try {
    if (!(RELATIONSHIP_STATUSES as readonly string[]).includes(newStatus)) {
      return { ok: false, error: "INVALID_STATUS" };
    }
    return await db.providerRelationship.update({
      where: { id },
      data: { relationshipStatus: newStatus },
    });
  } catch (err) {
    logger.error("provider-relationship: updateStatus failed", {
      id,
      error: String(err),
    });
    return { ok: false, error: String(err) };
  }
}

// ============ §2g approveProvider ============

/**
 * Platform-wide approval — creates a ProviderRelationship with
 * visibilityScope=PLATFORM (visible to all SGTX users). Used by
 * SGTX admins / governance to bless a provider.
 */
export async function approveProvider(
  providerGtid: string,
  providerType: string,
  authorizedBy: string,
  scope?: {
    jurisdictions?: string[];
    routes?: any[];
    serviceCatalogue?: string[];
  },
): Promise<any> {
  if (!isValidProviderType(providerType))
    return { ok: false, error: "INVALID_PROVIDER_TYPE" };
  try {
    // Idempotent: if there's already a PLATFORM APPROVED relationship,
    // update it; otherwise create one.
    const existing = await db.providerRelationship.findFirst({
      where: {
        providerGtid,
        visibilityScope: "PLATFORM",
        relationshipType: "APPROVED",
      },
    });
    const data: any = {
      providerGtid,
      providerType,
      relationshipType: "APPROVED",
      relationshipStatus: "ACTIVE",
      visibilityScope: "PLATFORM",
      traderGtid: null, // null = platform-wide
      authorizedBy,
      authorizedFrom: new Date(),
      jurisdictions: scope?.jurisdictions
        ? JSON.stringify(scope.jurisdictions)
        : null,
      routes: scope?.routes ? JSON.stringify(scope.routes) : null,
      serviceCatalogue: scope?.serviceCatalogue
        ? JSON.stringify(scope.serviceCatalogue)
        : null,
    };
    if (existing) {
      return await db.providerRelationship.update({
        where: { id: existing.id },
        data,
      });
    }
    return await db.providerRelationship.create({ data });
  } catch (err) {
    logger.error("provider-relationship: approveProvider failed", {
      providerGtid,
      error: String(err),
    });
    return { ok: false, error: String(err) };
  }
}

// ============ §2h isProviderAuthorizedForRoute ============

/**
 * Checks if the provider has an ACTIVE relationship AND a route
 * authorization matching the given origin/destination. Route match is
 * loose: the route entry's origin/destination strings (case-insensitive
 * trimmed) must contain OR equal the requested origin/destination.
 */
export async function isProviderAuthorizedForRoute(
  providerGtid: string,
  originLocation: string,
  destinationLocation: string,
): Promise<boolean> {
  if (!providerGtid || !originLocation || !destinationLocation) return false;
  try {
    const rels = await db.providerRelationship.findMany({
      where: {
        providerGtid,
        relationshipStatus: "ACTIVE",
      },
    });
    if (!rels || rels.length === 0) return false;
    const o = originLocation.trim().toLowerCase();
    const d = destinationLocation.trim().toLowerCase();
    for (const r of rels) {
      const routes = parseJsonArray(r.routes);
      if (routes.length === 0) continue; // no route restriction — skip
      for (const route of routes) {
        if (typeof route === "string") {
          const s = route.toLowerCase();
          if (s.includes(o) && s.includes(d)) return true;
        } else if (route && typeof route === "object") {
          const ro = String(route.origin || route.from || "").trim().toLowerCase();
          const rd = String(route.destination || route.to || "").trim().toLowerCase();
          if (!ro && !rd) continue;
          const oMatch = !ro || ro === o || ro.includes(o) || o.includes(ro);
          const dMatch = !rd || rd === d || rd.includes(d) || d.includes(rd);
          if (oMatch && dMatch) return true;
        }
      }
    }
    return false;
  } catch (err) {
    logger.error("provider-relationship: isProviderAuthorizedForRoute failed", {
      providerGtid,
      error: String(err),
    });
    return false;
  }
}

// ============ §2i isProviderAuthorizedForCommodity ============

/**
 * Checks commodity authorization against the relationship's
 * serviceCatalogue. The serviceCatalogue may contain HS6 codes or
 * commodity category names. A loose match is performed.
 *
 * NOTE: In a future task, this may delegate to the ProviderValidation
 * lib (§6) which has dedicated COMMODITY_AUTHORIZATION rows. For now
 * we use the serviceCatalogue on the relationship itself.
 */
export async function isProviderAuthorizedForCommodity(
  providerGtid: string,
  hs6: string,
): Promise<boolean> {
  if (!providerGtid || !hs6) return false;
  try {
    const rels = await db.providerRelationship.findMany({
      where: {
        providerGtid,
        relationshipStatus: "ACTIVE",
      },
    });
    if (!rels || rels.length === 0) return false;
    const needle = String(hs6).trim().toLowerCase();
    for (const r of rels) {
      const cat = parseJsonArray(r.serviceCatalogue);
      if (cat.length === 0) continue;
      for (const entry of cat) {
        const s = String(entry).trim().toLowerCase();
        if (s === needle) return true;
        // prefix match (e.g. "0301" authorizes HS6 "030123")
        if (needle.startsWith(s) || s.startsWith(needle)) return true;
      }
    }
    return false;
  } catch (err) {
    logger.error("provider-relationship: isProviderAuthorizedForCommodity failed", {
      providerGtid,
      error: String(err),
    });
    return false;
  }
}

// ============ §2j getProviderInternalTrustScore ============

/**
 * Returns the provider's INTERNAL trust score (0..100). Computed as
 * the MAX `internalTrustScore` across all ACTIVE ProviderRelationship
 * rows for the provider (since trust may differ per trader; the
 * highest represents the most-trusted relationship).
 *
 * INTERNAL — NEVER exposed publicly. SGTX is non-marketplace: this
 * score is for the trader's own decision-making only. It must NOT
 * be returned by any public-API endpoint.
 */
export async function getProviderInternalTrustScore(
  providerGtid: string,
): Promise<number> {
  if (!providerGtid) return 0;
  try {
    const rels = await db.providerRelationship.findMany({
      where: {
        providerGtid,
        relationshipStatus: "ACTIVE",
      },
      select: { internalTrustScore: true },
    });
    if (!rels || rels.length === 0) return 0;
    return Math.max(...rels.map((r: any) => r.internalTrustScore || 0));
  } catch (err) {
    logger.error("provider-relationship: getProviderInternalTrustScore failed", {
      providerGtid,
      error: String(err),
    });
    return 0;
  }
}

// ============ Convenience export ============

export const ProviderRelationshipEngine = {
  PROVIDER_TYPES,
  RELATIONSHIP_TYPES,
  RELATIONSHIP_STATUSES,
  VISIBILITY_SCOPES,
  listVisibleProviders,
  canTraderSeeProvider,
  createProviderRelationship,
  getProviderRelationship,
  listProviderRelationships,
  updateProviderRelationshipStatus,
  approveProvider,
  isProviderAuthorizedForRoute,
  isProviderAuthorizedForCommodity,
  getProviderInternalTrustScore,
};
