// @ts-nocheck
/**
 * SGTX Phase 2 — Trade Agreement Registry (§5)
 * ---------------------------------------------------------------------------
 * Bilateral / multilateral / FTA / PTA / customs union / regional / sector
 * agreement registry. Stores parties, effective dates, product coverage,
 * tariff treatment, origin rules summary, quotas, exclusions, certification,
 * cumulation, direct-transport rules.
 *
 * Each agreement is linked to:
 *   • JurisdictionFabric (via TariffRule.jurisdictionId + OriginRule.jurisdictionId)
 *   • RegulatorySource (for source/version/effective-date backing)
 *   • TariffRule[] (preferential tariff lines)
 *   • OriginRule[] (preferential origin rules)
 *
 * Backed by source + version + effective date — required by §7 ADMIN.
 */

import { db } from '@/lib/db'
import { logger } from '@/lib/sgtx/logger'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const AGREEMENT_TYPES = [
  'BILATERAL',
  'MULTILATERAL',
  'FTA',
  'PTA',
  'CUSTOMS_UNION',
  'REGIONAL_AGREEMENT',
  'SECTOR_SPECIFIC',
] as const

export const AGREEMENT_LEGAL_STATUSES = [
  'IN_FORCE',
  'SUPERSEDED',
  'TERMINATED',
  'PROVISIONAL',
] as const

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgreementInput {
  agreementType: string
  name: string
  shortName?: string
  parties: string[] // ISO alpha-2 country codes
  effectiveDate: Date | string
  expiryDate?: Date | string | null
  productCoverage?: {
    covered?: string[]
    excluded?: string[]
  }
  tariffTreatment?: Record<string, unknown>
  originRulesSummary?: string
  quotas?: Array<{
    hsCode: string
    volume: number
    period: string
  }>
  exclusions?: string[]
  certification?: {
    type: string // COO_FORM_A | EUR_MED | SELF_DECLARATION | etc.
    body?: string
  }
  cumulation?: {
    bilateral?: boolean
    diagonal?: boolean
    full?: boolean
    cumulationParties?: string[]
  }
  directTransport?: boolean
  legalStatus?: string
  sourceId?: string
  confidenceScore?: number
}

export interface AgreementSummary {
  id: string
  agreementType: string
  name: string
  shortName?: string
  parties: string[]
  effectiveDate: string
  expiryDate?: string | null
  legalStatus: string
  directTransport: boolean
  tariffRuleCount: number
  originRuleCount: number
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Create or update a trade agreement. Lookup by (shortName || name) to detect
 * duplicates. Returns the persisted agreement.
 */
export async function upsertTradeAgreement(
  input: AgreementInput
): Promise<any> {
  try {
    const lookupKey = input.shortName || input.name
    const existing = await db.tradeAgreement.findFirst({
      where: {
        OR: [{ shortName: lookupKey }, { name: input.name }],
      },
    })

    const data = {
      agreementType: input.agreementType,
      name: input.name,
      shortName: input.shortName || null,
      parties: JSON.stringify(input.parties),
      effectiveDate: new Date(input.effectiveDate),
      expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
      productCoverage: input.productCoverage
        ? JSON.stringify(input.productCoverage)
        : null,
      tariffTreatment: input.tariffTreatment
        ? JSON.stringify(input.tariffTreatment)
        : null,
      originRulesSummary: input.originRulesSummary || null,
      quotas: input.quotas ? JSON.stringify(input.quotas) : null,
      exclusions: input.exclusions ? JSON.stringify(input.exclusions) : null,
      certification: input.certification
        ? JSON.stringify(input.certification)
        : null,
      cumulation: input.cumulation ? JSON.stringify(input.cumulation) : null,
      directTransport: input.directTransport ?? true,
      legalStatus: input.legalStatus || 'IN_FORCE',
      sourceId: input.sourceId || null,
      confidenceScore: input.confidenceScore ?? null,
    }

    if (existing) {
      return await db.tradeAgreement.update({
        where: { id: existing.id },
        data,
      })
    }
    return await db.tradeAgreement.create({ data })
  } catch (e) {
    logger.error({ err: e?.message || String(e), input }, 'upsertTradeAgreement failed')
    throw e
  }
}

/**
 * Get a single trade agreement by id, including its TariffRule and OriginRule
 * children.
 */
export async function getTradeAgreement(id: string): Promise<any | null> {
  try {
    return await db.tradeAgreement.findUnique({
      where: { id },
      include: {
        tariffRules: { where: { legalStatus: 'IN_FORCE' } },
        originRules: { where: { legalStatus: 'IN_FORCE' } },
      },
    })
  } catch (e) {
    logger.error({ err: e?.message || String(e), id }, 'getTradeAgreement failed')
    return null
  }
}

/**
 * Get a trade agreement by its shortName (e.g. "USMCA").
 */
export async function getTradeAgreementByShortName(
  shortName: string
): Promise<any | null> {
  try {
    return await db.tradeAgreement.findFirst({
      where: { shortName, legalStatus: 'IN_FORCE' },
    })
  } catch (e) {
    logger.error(
      { err: e?.message || String(e), shortName },
      'getTradeAgreementByShortName failed'
    )
    return null
  }
}

/**
 * List trade agreements with optional filters. Returns the raw agreement rows
 * (use `summarizeAgreements` for a lightweight summary list).
 */
export async function listTradeAgreements(filters?: {
  agreementType?: string
  legalStatus?: string
  party?: string
  effectiveOnly?: boolean
  includeRules?: boolean
}): Promise<any[]> {
  try {
    const where: any = {}
    if (filters?.agreementType) where.agreementType = filters.agreementType
    if (filters?.legalStatus) where.legalStatus = filters.legalStatus
    if (filters?.party) {
      // JSON contains — libsql supports json_like for simple substring match
      where.parties = { contains: `"${filters.party}"` }
    }
    if (filters?.effectiveOnly) {
      const now = new Date()
      where.AND = [
        { effectiveDate: { lte: now } },
        {
          OR: [{ expiryDate: null }, { expiryDate: { gt: now } }],
        },
      ]
    }
    return await db.tradeAgreement.findMany({
      where,
      include: filters?.includeRules
        ? {
            tariffRules: { where: { legalStatus: 'IN_FORCE' } },
            originRules: { where: { legalStatus: 'IN_FORCE' } },
          }
        : undefined,
      orderBy: { effectiveDate: 'desc' },
    })
  } catch (e) {
    logger.error({ err: e?.message || String(e), filters }, 'listTradeAgreements failed')
    return []
  }
}

/**
 * Returns a lightweight summary list (no nested rule arrays).
 */
export async function summarizeAgreements(filters?: {
  agreementType?: string
  legalStatus?: string
  party?: string
}): Promise<AgreementSummary[]> {
  try {
    const rows = await listTradeAgreements(filters)
    return rows.map((a: any) => ({
      id: a.id,
      agreementType: a.agreementType,
      name: a.name,
      shortName: a.shortName || undefined,
      parties: safeParse(a.parties, []),
      effectiveDate: a.effectiveDate?.toISOString() || '',
      expiryDate: a.expiryDate?.toISOString() || null,
      legalStatus: a.legalStatus,
      directTransport: a.directTransport,
      tariffRuleCount: 0,
      originRuleCount: 0,
    }))
  } catch (e) {
    logger.error({ err: e?.message || String(e) }, 'summarizeAgreements failed')
    return []
  }
}

/**
 * Is the agreement currently effective (effectiveDate <= now < expiryDate)?
 */
export function isAgreementEffective(agreement: any, at = new Date()): boolean {
  if (!agreement) return false
  if (agreement.legalStatus && agreement.legalStatus !== 'IN_FORCE') return false
  const eff = agreement.effectiveDate ? new Date(agreement.effectiveDate) : null
  if (eff && eff > at) return false
  const exp = agreement.expiryDate ? new Date(agreement.expiryDate) : null
  if (exp && exp <= at) return false
  return true
}

/**
 * Is `countryCode` a party to the agreement?
 */
export function isPartyTo(agreement: any, countryCode: string): boolean {
  const parties = safeParse(agreement?.parties, [])
  return parties.includes(countryCode)
}

/**
 * Get all active agreements that include both `originCountry` and
 * `destinationCountry` as parties. Useful for preferential eligibility lookups.
 */
export async function getActiveAgreementsBetween(
  originCountry: string,
  destinationCountry: string
): Promise<any[]> {
  try {
    const all = await listTradeAgreements({ legalStatus: 'IN_FORCE', effectiveOnly: true })
    return all.filter((a: any) => {
      const parties = safeParse(a.parties, [])
      return parties.includes(originCountry) && parties.includes(destinationCountry)
    })
  } catch (e) {
    logger.error(
      { err: e?.message || String(e), originCountry, destinationCountry },
      'getActiveAgreementsBetween failed'
    )
    return []
  }
}

/**
 * Delete a trade agreement (soft — set legalStatus = TERMINATED). Hard delete
 * only when `hard=true`.
 */
export async function deleteTradeAgreement(
  id: string,
  hard = false
): Promise<boolean> {
  try {
    if (hard) {
      await db.tradeAgreement.delete({ where: { id } })
    } else {
      await db.tradeAgreement.update({
        where: { id },
        data: { legalStatus: 'TERMINATED' },
      })
    }
    return true
  } catch (e) {
    logger.error({ err: e?.message || String(e), id, hard }, 'deleteTradeAgreement failed')
    return false
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeParse<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string') return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}
