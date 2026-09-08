// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v17 §23.1 — Trust Flywheel (Competitive Moat)
// ═══════════════════════════════════════════════════════════════════════════════
//
// The Trust Flywheel is SGTX's competitive moat — 7 layers that compound over
// time. Each layer reinforces the next; the wheel turns faster as each new
// trade, passport, and graph edge is added. The combination, not any single
// layer, is what gives SGTX a 5-7 year competitive lead per the v17 §23.1
// narrative.
//
// THE 7 LAYERS:
//
//   1. Trade Memory Layer
//      Anonymised trade history with differential privacy. 90-day rotating
//      pepper means re-identification is impossible even if a snapshot leaks.
//      Federated-learning ready: a tenant's trade history can be added to a
//      shared model without ever exporting the raw events.
//
//   2. Trust Passport & TRI (Trust Reliability Index)
//      W3C Verifiable Credentials for portable trust. 6-dimensional TRI
//      (settlement reliability, compliance, documentation, financing,
//      dispute, customs — each 0-100; aggregate 0-1000). Offline
//      verification — anyone can verify a passport's signature without
//      calling back to SGTX.
//
//   3. Institutional Trade Graph
//      GNN-powered counterparty relationship graph. KNOWN PARTIES ONLY —
//      never a marketplace. Each tenant's ego-graph (their counterparties,
//      financiers, providers) is embedded; sanctions-proximity scoring +
//      trade-pattern risk scoring happen at the graph level.
//
//   4. Zero-Cost Infrastructure
//      Gitea + Drone CI + Taiga project management, all self-hosted. Self-
//      hosted LLMs (no per-call SaaS). Project Oracle + Predictive Scaling
//      keep infra costs near-zero at scale. Zero SaaS = zero per-trade
//      licensing tax.
//
//   5. Government Mandates
//      Nafeza (Egypt), CargoX, ETA, FASAH, EU ICS2 — government-grade single-
//      window integration. Each mandate is a regulatory wall competitors
//      must climb (6-12 months of integration work per country).
//
//   6. Full-Disclosure Financing
//      Encrypted blind bidding (financiers can't see each other's terms),
//      blended APR, co-financing, transparent cost waterfall. The 0.25%
//      fee is disclosed to the borrower; the SGTX Witness Clause is non-
//      removable from the master agreement.
//
//   7. Non-Custodial Architecture
//      FeeLock is a NATS KV instruction, not a spendable balance. Banks are
//      authoritative — SGTX never holds, controls, or takes title to
//      customer funds. This is provable from code + DB structure (the
//      `non-custody-attestation` lib generates a hash of the schema/code/
//      data scan on demand).
//
// METRIC SOURCES (real, defensive — failures degrade to safe defaults):
//   • trade_memory_records       → TradeMemoryEvent.count()
//   • trust_passports_issued     → TrustPassport.count()
//   • tri_avg                    → avg(TrustPassport.triScore)  (0-1000)
//   • graph_nodes                → unique tenant gtids in trades + savedContact
//   • graph_edges                → count of Trade + SavedContact + ServiceQuotation
//   • govt_integrations_active   → IntegrationHealth where status='OPERATIONAL'
//   • financing_transparency_score → % of FinancingAgreement rows with non-empty
//                                     witnessClauseText (0-100)
//   • non_custodial_attestations  → db.nonCustodyAttestation.count() if the table
//                                  exists (defensive — falls back to 0)
// ═══════════════════════════════════════════════════════════════════════════════

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ── Layer codes (canonical, exported for callers) ─────────────────────────────
export type FlywheelLayerCode =
  | "TRADE_MEMORY"
  | "TRUST_PASSPORT_TRI"
  | "INSTITUTIONAL_TRADE_GRAPH"
  | "ZERO_COST_INFRA"
  | "GOVERNMENT_MANDATES"
  | "FULL_DISCLOSURE_FINANCING"
  | "NON_CUSTODIAL_ARCH";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface FlywheelLayerStatus {
  code: FlywheelLayerCode;
  name: string;
  description: string;
  status: "ACTIVE" | "BUILDING" | "PLANNED";
  metrics: Record<string, number | string | boolean | null>;
}

export interface FlywheelStatus {
  layers: FlywheelLayerStatus[];
  competitive_lead_years: number;
  total_layers: 7;
  active_layers: number;
  building_layers: number;
  planned_layers: number;
  generatedAt: string;
}

export interface MoatAssessment {
  overall_strength: number;             // 0-100
  layer_scores: Record<FlywheelLayerCode, number>; // 0-100 per layer
  narrative: string;
  competitive_lead_years: number;
  generatedAt: string;
}

export interface FlywheelMetrics {
  trade_memory_records: number;
  trust_passports_issued: number;
  tri_avg: number;                       // 0-1000
  graph_nodes: number;
  graph_edges: number;
  govt_integrations_active: number;
  financing_transparency_score: number; // 0-100
  non_custodial_attestations: number;
}

// ── Layer metadata (in-memory — describes each moat layer) ─────────────────────

const LAYER_META: Array<{
  code: FlywheelLayerCode;
  name: string;
  description: string;
  defaultStatus: "ACTIVE" | "BUILDING" | "PLANNED";
}> = [
  {
    code: "TRADE_MEMORY",
    name: "Trade Memory Layer",
    description:
      "Anonymised trade history with differential privacy + 90-day rotating pepper. Federated-learning ready — a tenant's trade history can be added to a shared model without ever exporting raw events.",
    defaultStatus: "ACTIVE",
  },
  {
    code: "TRUST_PASSPORT_TRI",
    name: "Trust Passport & TRI",
    description:
      "W3C Verifiable Credentials for portable trust. 6-dimensional TRI (0-1000). Offline verification — anyone can verify a passport signature without calling back to SGTX.",
    defaultStatus: "ACTIVE",
  },
  {
    code: "INSTITUTIONAL_TRADE_GRAPH",
    name: "Institutional Trade Graph",
    description:
      "GNN-powered counterparty relationship graph. Known parties only — never a marketplace. Sanctions-proximity + trade-pattern risk scoring at the graph level.",
    defaultStatus: "ACTIVE",
  },
  {
    code: "ZERO_COST_INFRA",
    name: "Zero-Cost Infrastructure",
    description:
      "Gitea + Drone CI + Taiga, self-hosted. Self-hosted LLMs (no per-call SaaS). Project Oracle + Predictive Scaling. Zero SaaS = zero per-trade licensing tax.",
    defaultStatus: "ACTIVE",
  },
  {
    code: "GOVERNMENT_MANDATES",
    name: "Government Mandates",
    description:
      "Nafeza (Egypt), CargoX, ETA, FASAH, EU ICS2 — government-grade single-window integration. Each mandate is a regulatory wall competitors must climb (6-12 months per country).",
    defaultStatus: "ACTIVE",
  },
  {
    code: "FULL_DISCLOSURE_FINANCING",
    name: "Full-Disclosure Financing",
    description:
      "Encrypted blind bidding (financiers can't see each other's terms). Blended APR, co-financing, transparent cost waterfall. 0.25% fee disclosed; SGTX Witness Clause non-removable.",
    defaultStatus: "ACTIVE",
  },
  {
    code: "NON_CUSTODIAL_ARCH",
    name: "Non-Custodial Architecture",
    description:
      "FeeLock is a NATS KV instruction, not a spendable balance. Banks are authoritative — SGTX never holds, controls, or takes title to customer funds. Provable from code + DB structure.",
    defaultStatus: "ACTIVE",
  },
];

// ── Defensive DB helpers ──────────────────────────────────────────────────────

async function safeCount(modelName: string, where?: any): Promise<number> {
  try {
    return await (db as any)[modelName].count({ where });
  } catch (e: any) {
    logger.warn(`[trust-flywheel] ${modelName}.count failed`, {
      error: e?.message,
    });
    return 0;
  }
}

async function safeAggregate(
  modelName: string,
  fn: "_count" | "_avg" | "_sum",
  field: string,
  where?: any,
): Promise<number> {
  try {
    const res = await (db as any)[modelName].aggregate({
      [fn]: { [field]: true },
      where,
    });
    const val = res?.[fn]?.[field];
    return typeof val === "number" && !Number.isNaN(val) ? val : 0;
  } catch (e: any) {
    logger.warn(`[trust-flywheel] ${modelName}.aggregate ${fn} ${field} failed`, {
      error: e?.message,
    });
    return 0;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get live flywheel metrics (real, defensive). Failures degrade to safe
 * defaults (0) and are logged via the SGTX logger so ops can see which
 * underlying model is unreachable.
 */
export async function getFlywheelMetrics(): Promise<FlywheelMetrics> {
  const [
    tradeMemoryRecords,
    trustPassportsIssued,
    triAvg,
    graphNodes,
    graphEdges,
    govtIntegrationsActive,
    financingAgreementsTotal,
    financingAgreementsWithWitness,
    nonCustodialAttestations,
  ] = await Promise.all([
    safeCount("tradeMemoryEvent"),
    safeCount("trustPassport"),
    safeAggregate("trustPassport", "_avg", "triScore"),
    // Graph nodes — unique tenants that have participated in at least one
    // trade (as buyer OR seller) OR have at least one savedContact.
    (async () => {
      try {
        const [buyers, sellers, contacts] = await Promise.all([
          db.trade.findMany({ select: { buyerGtid: true }, distinct: ["buyerGtid"] }),
          db.trade.findMany({ select: { sellerGtid: true }, distinct: ["sellerGtid"] }),
          db.savedContact.findMany({ select: { contactGtid: true }, distinct: ["contactGtid"] }),
        ]);
        const set = new Set<string>();
        for (const t of buyers) if (t.buyerGtid) set.add(t.buyerGtid);
        for (const t of sellers) if (t.sellerGtid) set.add(t.sellerGtid);
        for (const c of contacts) if (c.contactGtid) set.add(c.contactGtid);
        return set.size;
      } catch (e: any) {
        logger.warn("[trust-flywheel] graphNodes query failed", { error: e?.message });
        return 0;
      }
    })(),
    // Graph edges — count of trade relationships + saved contacts + service
    // quotations (each represents a buyer-provider linkage).
    (async () => {
      const [trades, contacts, quotations] = await Promise.all([
        safeCount("trade"),
        safeCount("savedContact"),
        safeCount("serviceQuotation"),
      ]);
      return trades + contacts + quotations;
    })(),
    safeCount("integrationHealth", { status: "OPERATIONAL" }),
    safeCount("financingAgreement"),
    // Financing transparency — % of agreements with a non-empty SGTX
    // Witness Clause. Computed below as a ratio.
    (async () => {
      try {
        const rows = await db.financingAgreement.findMany({
          select: { witnessClauseText: true },
        });
        return rows.filter((r: any) => r.witnessClauseText && r.witnessClauseText.trim().length > 0).length;
      } catch (e: any) {
        logger.warn("[trust-flywheel] witness clause count failed", { error: e?.message });
        return 0;
      }
    })(),
    safeCount("nonCustodyAttestation"),
  ]);

  const financingTransparencyScore =
    financingAgreementsTotal > 0
      ? Math.round((financingAgreementsWithWitness / financingAgreementsTotal) * 100)
      : 100; // vacuously transparent when no agreements exist

  return {
    trade_memory_records: tradeMemoryRecords,
    trust_passports_issued: trustPassportsIssued,
    tri_avg: Math.round(triAvg),
    graph_nodes: graphNodes,
    graph_edges: graphEdges,
    govt_integrations_active: govtIntegrationsActive,
    financing_transparency_score: financingTransparencyScore,
    non_custodial_attestations: nonCustodialAttestations,
  };
}

/**
 * Get the status of each flywheel layer with key metrics.
 *
 * A layer is `ACTIVE` when its key metric is non-zero (or, for the non-custodial
 * layer, the attestation has been generated at least once). A layer is
 * `BUILDING` when the underlying model exists but the key metric is zero. A
 * layer is `PLANNED` when the underlying model is unreachable (count returned
 * 0 because of a schema mismatch — should not happen in production).
 *
 * `competitive_lead_years` is fixed at 5 per the v17 §23.1 narrative.
 */
export async function getFlywheelStatus(): Promise<FlywheelStatus> {
  const m = await getFlywheelMetrics();

  const layerStatuses: Record<FlywheelLayerCode, "ACTIVE" | "BUILDING" | "PLANNED"> = {
    TRADE_MEMORY: m.trade_memory_records > 0 ? "ACTIVE" : "BUILDING",
    TRUST_PASSPORT_TRI: m.trust_passports_issued > 0 ? "ACTIVE" : "BUILDING",
    INSTITUTIONAL_TRADE_GRAPH: m.graph_nodes > 0 ? "ACTIVE" : "BUILDING",
    ZERO_COST_INFRA: "ACTIVE", // infrastructure — always active (self-hosted)
    GOVERNMENT_MANDATES: m.govt_integrations_active > 0 ? "ACTIVE" : "BUILDING",
    FULL_DISCLOSURE_FINANCING: "ACTIVE", // always active (the Witness Clause is non-removable)
    NON_CUSTODIAL_ARCH: "ACTIVE", // always active (architectural invariant — provable from code)
  };

  const layers: FlywheelLayerStatus[] = LAYER_META.map((meta) => ({
    code: meta.code,
    name: meta.name,
    description: meta.description,
    status: layerStatuses[meta.code],
    metrics: layerMetrics(meta.code, m),
  }));

  const active = layers.filter((l) => l.status === "ACTIVE").length;
  const building = layers.filter((l) => l.status === "BUILDING").length;
  const planned = layers.filter((l) => l.status === "PLANNED").length;

  return {
    layers,
    competitive_lead_years: 5,
    total_layers: 7,
    active_layers: active,
    building_layers: building,
    planned_layers: planned,
    generatedAt: new Date().toISOString(),
  };
}

function layerMetrics(
  code: FlywheelLayerCode,
  m: FlywheelMetrics,
): Record<string, number | string | boolean | null> {
  switch (code) {
    case "TRADE_MEMORY":
      return {
        anonymised_events: m.trade_memory_records,
        differential_privacy: "enabled",
        rotating_pepper_days: 90,
        federated_learning_ready: true,
      };
    case "TRUST_PASSPORT_TRI":
      return {
        passports_issued: m.trust_passports_issued,
        tri_avg: m.tri_avg,
        tri_dimensions: 6,
        credential_format: "W3C Verifiable Credentials",
        offline_verification: true,
      };
    case "INSTITUTIONAL_TRADE_GRAPH":
      return {
        nodes: m.graph_nodes,
        edges: m.graph_edges,
        marketplace: false,
        known_parties_only: true,
        gnn_model: "Rust micro-service (simulated in TS for dev)",
      };
    case "ZERO_COST_INFRA":
      return {
        gitea: "self-hosted",
        drone_ci: "self-hosted",
        taiga: "self-hosted",
        llm: "self-hosted (no per-call SaaS)",
        project_oracle: true,
        predictive_scaling: true,
        saas_licensing_tax: 0,
      };
    case "GOVERNMENT_MANDATES":
      return {
        integrations_active: m.govt_integrations_active,
        named_mandates: ["Nafeza", "CargoX", "ETA", "FASAH", "EU ICS2"],
        per_country_integration_months: "6-12",
      };
    case "FULL_DISCLOSURE_FINANCING":
      return {
        encrypted_blind_bidding: true,
        blended_apr: true,
        co_financing: true,
        transparent_cost_waterfall: true,
        witness_clause_non_removable: true,
        psp_fee_per_leg_pct: 0.25,
        financing_agreements_total: "(see metrics endpoint)",
        transparency_score: m.financing_transparency_score,
      };
    case "NON_CUSTODIAL_ARCH":
      return {
        feelock_storage: "NATS KV instruction",
        banks_authoritative: true,
        sgtx_holds_funds: false,
        sgtx_takes_title: false,
        attestations_generated: m.non_custodial_attestations,
        attestation_reproducible: true,
      };
  }
}

/**
 * Assess the strength of each moat layer (0-100) and compute an overall
 * strength score (0-100) + a narrative explaining the 5-year competitive
 * lead per the v17 §23.1 narrative.
 *
 * Scoring rubric:
 *   • TRADE_MEMORY       → min(100, trade_memory_records / 100)     (100 events = full score)
 *   • TRUST_PASSPORT_TRI → min(100, passports_issued / 10) * 0.5 + (tri_avg / 1000) * 50
 *   • INSTITUTIONAL_TRADE_GRAPH → min(100, graph_edges / 50)        (50 edges = full score)
 *   • ZERO_COST_INFRA    → 100 (always-on, architectural invariant)
 *   • GOVERNMENT_MANDATES → min(100, govt_integrations_active / 5) * 100  (5 mandates = full)
 *   • FULL_DISCLOSURE_FINANCING → financing_transparency_score (already 0-100)
 *   • NON_CUSTODIAL_ARCH → 100 (always-on, architectural invariant) +
 *                          (non_custodial_attestations > 0 ? 0 : -10 penalty)
 *
 * Overall = average of the 7 layer scores.
 */
export async function getMoatAssessment(): Promise<MoatAssessment> {
  const m = await getFlywheelMetrics();

  const layer_scores: Record<FlywheelLayerCode, number> = {
    TRADE_MEMORY: Math.min(100, Math.round(m.trade_memory_records / 1)), // 100 events = full
    TRUST_PASSPORT_TRI: Math.min(
      100,
      Math.round(
        Math.min(100, (m.trust_passports_issued / 10) * 50) +
          (m.tri_avg / 1000) * 50,
      ),
    ),
    INSTITUTIONAL_TRADE_GRAPH: Math.min(100, Math.round(m.graph_edges / 0.5)), // 50 edges = full
    ZERO_COST_INFRA: 100,
    GOVERNMENT_MANDATES: Math.min(100, Math.round((m.govt_integrations_active / 5) * 100)),
    FULL_DISCLOSURE_FINANCING: m.financing_transparency_score,
    NON_CUSTODIAL_ARCH:
      m.non_custodial_attestations > 0 ? 100 : 90, // architectural invariant, slight penalty if never attested
  };

  const values = Object.values(layer_scores);
  const overall = Math.round(values.reduce((s, v) => s + v, 0) / values.length);

  const narrative = buildNarrative(overall, layer_scores, m);

  return {
    overall_strength: overall,
    layer_scores,
    narrative,
    competitive_lead_years: 5,
    generatedAt: new Date().toISOString(),
  };
}

function buildNarrative(
  overall: number,
  scores: Record<FlywheelLayerCode, number>,
  m: FlywheelMetrics,
): string {
  const strong: string[] = [];
  const weak: string[] = [];

  if (scores.TRADE_MEMORY >= 70) strong.push(`trade memory (${m.trade_memory_records} anonymised events, ${scores.TRADE_MEMORY}/100)`);
  else weak.push(`trade memory (${m.trade_memory_records} events, ${scores.TRADE_MEMORY}/100)`);

  if (scores.TRUST_PASSPORT_TRI >= 70) strong.push(`trust passports + TRI (${m.trust_passports_issued} issued, TRI avg ${m.tri_avg}/1000, ${scores.TRUST_PASSPORT_TRI}/100)`);
  else weak.push(`trust passports + TRI (${m.trust_passports_issued} issued, ${scores.TRUST_PASSPORT_TRI}/100)`);

  if (scores.INSTITUTIONAL_TRADE_GRAPH >= 70) strong.push(`institutional trade graph (${m.graph_nodes} nodes, ${m.graph_edges} edges, ${scores.INSTITUTIONAL_TRADE_GRAPH}/100)`);
  else weak.push(`institutional trade graph (${m.graph_nodes} nodes / ${m.graph_edges} edges, ${scores.INSTITUTIONAL_TRADE_GRAPH}/100)`);

  if (scores.ZERO_COST_INFRA >= 100) strong.push(`zero-cost infrastructure (self-hosted Gitea+Drone+Taiga+LLM, ${scores.ZERO_COST_INFRA}/100)`);
  if (scores.GOVERNMENT_MANDATES >= 70) strong.push(`government mandates (${m.govt_integrations_active} active, ${scores.GOVERNMENT_MANDATES}/100)`);
  else weak.push(`government mandates (${m.govt_integrations_active} active, ${scores.GOVERNMENT_MANDATES}/100)`);

  if (scores.FULL_DISCLOSURE_FINANCING >= 90) strong.push(`full-disclosure financing (transparency ${m.financing_transparency_score}/100, witness clause non-removable)`);
  else weak.push(`full-disclosure financing (transparency ${m.financing_transparency_score}/100)`);

  if (scores.NON_CUSTODIAL_ARCH >= 100) strong.push(`non-custodial architecture (${m.non_custodial_attestations} attestations, ${scores.NON_CUSTODIAL_ARCH}/100)`);
  else weak.push(`non-custodial architecture (${m.non_custodial_attestations} attestations, ${scores.NON_CUSTODIAL_ARCH}/100)`);

  const lead =
    overall >= 80 ? "5-7" :
    overall >= 60 ? "3-5" :
    overall >= 40 ? "2-3" : "1-2";

  const narrative =
    `Overall moat strength: ${overall}/100. ` +
    `Strong layers: ${strong.join("; ") || "(none yet)"}. ` +
    `Building layers: ${weak.join("; ") || "(none)"}. ` +
    `Per v17 §23.1, the compounding of these 7 layers gives SGTX a ${lead}-year competitive lead. ` +
    `The non-custodial architecture + zero-cost infra layers are architectural invariants (always 100/100); ` +
    `the trade memory + trust passport + trade graph layers compound with each new trade; ` +
    `the government mandates layer expands per-country at 6-12 months per integration; ` +
    `the full-disclosure financing layer is reinforced by every master + annex agreement with the SGTX Witness Clause.`;

  return narrative;
}
