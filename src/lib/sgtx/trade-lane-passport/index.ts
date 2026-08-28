// @ts-nocheck
/**
 * SGTX Part 103 — Trade Lane Passport Generator
 * ===========================================================================
 *
 * A Trade Lane Passport is a comprehensive, machine-readable description
 * of EVERYTHING required to execute a trade on a specific origin →
 * destination lane for a specific HS code, mode, and incoterm. It is the
 * "single source of truth" that an operator, broker, or financier can
 * consult to know:
 *   • which regulations apply
 *   • which customs procedures must be followed
 *   • which documents are required (and which are optional)
 *   • which licenses / permits / certificates are needed
 *   • what tariff, tax, and duty apply
 *   • what transport options exist (carriers, ports, terminals)
 *   • which providers SGTX has verified for this lane
 *   • which broker to use
 *   • what insurance products apply
 *   • what payment methods / PSPs are supported
 *   • which government connectors are required (FASAH, ACE, CDS, etc.)
 *   • which steps are manual (no API available)
 *   • known risks / blockers / readiness gates
 *
 * NON-MARKETPLACE GUARANTEE (L0):
 *   The passport lists VERIFIED providers (those that have passed the
 *   SGTX provider-validation engine) but does NOT recommend one over
 *   another, does NOT auto-book, and does NOT take a commission. The
 *   operator selects providers manually.
 *
 * Data sources (per §103.4):
 *   • GRiRE             — regulatory data (existing lib)
 *   • Add-On 1 (docs)   — document matrix
 *   • Add-On 2 (tariff) — duty/tax data
 *   • Add-On 3 (FTA)    — preferential rates
 *   • integration catalog — government connectors / carriers / banks / PSPs
 *
 * The passport is generated DETERMINISTICALLY from current data — calling
 * generatePassport() twice with the same inputs within the same minute
 * yields the same output (modulo timestamps).
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ Types ============

export interface TradeLanePassport {
  origin: string;
  destination: string;
  transit: string[];
  hsCode: string;
  mode: string;
  incoterm: string;
  generatedAt: string;
  regulations: any[];
  customs: any;
  documents: any[];
  licenses: any[];
  permits: any[];
  certificates: any[];
  tariff: any;
  tax: any;
  duty: any;
  transport: any;
  providers: any[];
  broker: any;
  insurance: any;
  payments: any;
  governmentConnectors: any[];
  manualSteps: any[];
  risks: any[];
  blockers: any[];
  readiness: any;
}

// ============ §103.5 — Data loaders (all defensive) ============

async function loadGrireData(origin: string, destination: string, hsCode: string): Promise<any> {
  try {
    const mod = await import("@/lib/sgtx/grire");
    const fn = (mod as any)?.getRegulatorySnapshot || (mod as any)?.default?.getRegulatorySnapshot;
    if (fn) return await fn({ origin, destination, hsCode });
    return null;
  } catch (err: any) {
    logger.warn("[trade-lane-passport] GRiRE load failed", { origin, destination, error: err?.message });
    return null;
  }
}

async function loadDocMatrix(origin: string, destination: string, hsCode: string): Promise<any[]> {
  try {
    const mod = await import("@/lib/sgtx/grire/product-corridor-matrix");
    const fn = (mod as any)?.getDocumentsForLane;
    if (fn) return await fn(hsCode, origin, destination) || [];
    return [];
  } catch {
    return [];
  }
}

async function loadFtaData(origin: string, destination: string): Promise<any | null> {
  try {
    const mod = await import("@/lib/sgtx/fta");
    const fn = (mod as any)?.lookupFta;
    if (fn) return await fn(origin, destination);
    return null;
  } catch {
    return null;
  }
}

async function loadTariff(hsCode: string, origin: string, destination: string): Promise<any | null> {
  try {
    const mod = await import("@/lib/sgtx/compliance/tariff-engine");
    const fn = (mod as any)?.calculateDuty;
    if (fn) return await fn({ hsCode, origin, destination, value: 1000 });
    return null;
  } catch {
    return null;
  }
}

async function loadIntegrationCatalog(origin: string, destination: string): Promise<any[]> {
  try {
    const mod = await import("@/lib/sgtx/integration-catalog");
    const fn = (mod as any)?.listIntegrationsForLane || (mod as any)?.listForLane;
    if (fn) return (await fn(origin, destination)) || [];
    // Fallback: query the table directly.
    const rows = await db.integrationCatalog.findMany({ where: { OR: [{ destination }, { origin }] }, take: 50 }).catch(() => []);
    return rows as any[];
  } catch {
    return [];
  }
}

async function loadVerifiedProviders(origin: string, destination: string): Promise<any[]> {
  try {
    const rows = await db.providerValidation.findMany({
      where: { status: "VERIFIED", OR: [{ originCountry: origin }, { destinationCountry: destination }] },
      take: 50,
      select: { id: true, providerName: true, providerType: true, lane: true },
    }).catch(() => []);
    return rows as any[];
  } catch {
    return [];
  }
}

function buildGovernmentConnectors(origin: string, destination: string): any[] {
  try {
    const map: Record<string, string> = {
      EG: "NAFEZA / CARGOX (ACI)", US: "ACE (CBP)", GB: "CDS (HMRC)", EU: "ICS2 / AES",
      SA: "FASAH (ZATCA)", AE: "FASAH (FCA)", CN: "GACC SINGLE WINDOW", TR: "TEK WINDOW",
      IN: "ICEGATE", BR: "PORTOBRAS SISCOMEX", AU: "ICS (ABF)", JP: "NACCS", KR: "UNI-PASS",
    };
    return [
      { country: origin, connector: map[origin] || "UNKNOWN — manual filing required", type: "EXPORT" },
      { country: destination, connector: map[destination] || "UNKNOWN — manual filing required", type: "IMPORT" },
    ];
  } catch {
    return [];
  }
}

function buildManualSteps(connectors: any[]): any[] {
  try {
    return connectors
      .filter((c) => /UNKNOWN|manual/i.test(c.connector))
      .map((c) => ({ country: c.country, step: `Manual customs filing required for ${c.type}` }));
  } catch {
    return [];
  }
}

function buildRisks(origin: string, destination: string, mode: string): any[] {
  try {
    const risks: any[] = [];
    const sanctioned = ["IR", "SY", "KP", "CU", "RU"];
    if (sanctioned.includes(origin)) risks.push({ type: "SANCTIONS", severity: "CRITICAL", detail: `Origin ${origin} is under sanctions.` });
    if (sanctioned.includes(destination)) risks.push({ type: "SANCTIONS", severity: "CRITICAL", detail: `Destination ${destination} is under sanctions.` });
    if (mode === "SEA" && (origin === "EG" || destination === "EG")) risks.push({ type: "RED_SEA", severity: "HIGH", detail: "Red Sea routing risk — confirm carrier surcharges." });
    return risks;
  } catch {
    return [];
  }
}

function buildBlockers(risks: any[]): any[] {
  try {
    return risks.filter((r) => r.severity === "CRITICAL").map((r) => ({ blocker: r.type, detail: r.detail }));
  } catch {
    return [];
  }
}

function buildReadiness(documents: any[], fta: any, connectors: any[]): any {
  try {
    const docScore = documents.length > 0 ? Math.min(1, documents.length / 8) : 0;
    const ftaScore = fta ? 1 : 0;
    const connScore = connectors.filter((c) => !/UNKNOWN/i.test(c.connector)).length / Math.max(1, connectors.length);
    const overall = Math.round(((docScore + ftaScore + connScore) / 3) * 100);
    return { overall, docReadiness: Math.round(docScore * 100), ftaReadiness: Math.round(ftaScore * 100), connectorReadiness: Math.round(connScore * 100) };
  } catch {
    return { overall: 0, docReadiness: 0, ftaReadiness: 0, connectorReadiness: 0 };
  }
}

// ============ Public API ============

export async function generatePassport(
  origin: string,
  destination: string,
  transit: string[],
  hsCode: string,
  mode: string,
  incoterm: string,
): Promise<TradeLanePassport> {
  try {
    const [grire, docs, fta, tariff, integrations, providers] = await Promise.all([
      loadGrireData(origin, destination, hsCode),
      loadDocMatrix(origin, destination, hsCode),
      loadFtaData(origin, destination),
      loadTariff(hsCode, origin, destination),
      loadIntegrationCatalog(origin, destination),
      loadVerifiedProviders(origin, destination),
    ]);

    const governmentConnectors = buildGovernmentConnectors(origin, destination);
    const manualSteps = buildManualSteps(governmentConnectors);
    const risks = buildRisks(origin, destination, mode);
    const blockers = buildBlockers(risks);
    const readiness = buildReadiness(docs, fta, governmentConnectors);

    return {
      origin, destination, transit: transit || [], hsCode, mode, incoterm,
      generatedAt: new Date().toISOString(),
      regulations: grire?.regulations || grire?.requirements || [],
      customs: { procedure: grire?.customsProcedure || "STANDARD", origin, destination },
      documents: docs || [],
      licenses: grire?.licenses || [],
      permits: grire?.permits || [],
      certificates: grire?.certificates || [],
      tariff: tariff?.breakdown || tariff || { mfn: null, applied: null },
      tax: tariff?.tax || null,
      duty: tariff?.duty || null,
      transport: { mode, carriers: integrations.filter((i: any) => /CARRIER|SHIPPING/i.test(i.type || "")) },
      providers,
      broker: { recommended: null, note: "Non-marketplace: SGTX does not recommend brokers. Operator selects from verified list." },
      insurance: { products: integrations.filter((i: any) => /INSURANCE/i.test(i.type || "")) },
      payments: { psps: integrations.filter((i: any) => /PSP|PAYMENT/i.test(i.type || "")), banks: integrations.filter((i: any) => /BANK/i.test(i.type || "")) },
      governmentConnectors,
      manualSteps,
      risks,
      blockers,
      readiness,
    };
  } catch (err: any) {
    logger.error("[trade-lane-passport] generatePassport failed", { origin, destination, error: err?.message });
    return {
      origin, destination, transit: transit || [], hsCode, mode, incoterm,
      generatedAt: new Date().toISOString(),
      regulations: [], customs: {}, documents: [], licenses: [], permits: [], certificates: [],
      tariff: {}, tax: {}, duty: {}, transport: {}, providers: [], broker: {}, insurance: {}, payments: {},
      governmentConnectors: [], manualSteps: [], risks: [{ type: "INTERNAL_ERROR", severity: "HIGH", detail: err?.message }],
      blockers: [], readiness: { overall: 0 },
    };
  }
}
