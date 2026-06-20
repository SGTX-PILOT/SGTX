// SGTX Part 11.1 — GNN Risk Engine stub
// Blueprint Part 11.1 requires a Graph Neural Network (GNN) for sanctions-proximity and
// trade-graph risk scoring. The production GNN runs in a Rust microservice; this TypeScript
// stub simulates the documented API contract so the rest of the platform can call it.
//
// Simulation rules (documented in Part 11.1):
//   - If either tenant has `sanctionsCleared=false`  → proximity=1 (close), score=95 (high risk)
//   - Otherwise                                       → proximity=4 (far),   score=20 (low risk)

import { db } from "@/lib/db";

export interface GnnRiskAssessment {
  sanctionsProximity: number; // 1 (closest) .. 6 (farthest)
  graphRiskScore: number; // 0..100
  recommendation: string;
}

export interface TradeGraphScore {
  nodeCount: number;
  edgeCount: number;
  avgTrust: number;
}

/**
 * Assess counterparty risk using the GNN sanctions-proximity model.
 *
 * This stub loads both tenants from the database, inspects the `sanctionsCleared`
 * flag, and returns a simulated risk score. The production implementation would
 * delegate to the Rust GNN microservice over gRPC.
 */
export async function assessGnnRisk(
  tenantGtid: string,
  counterpartyGtid: string,
): Promise<GnnRiskAssessment> {
  const [tenant, counterparty] = await Promise.all([
    db.tenant.findUnique({ where: { gtid: tenantGtid } }),
    db.tenant.findUnique({ where: { gtid: counterpartyGtid } }),
  ]);

  const tenantSanctioned = tenant ? !tenant.sanctionsCleared : false;
  const counterpartySanctioned = counterparty ? !counterparty.sanctionsCleared : false;

  if (tenantSanctioned || counterpartySanctioned) {
    return {
      sanctionsProximity: 1,
      graphRiskScore: 95,
      recommendation:
        "REJECT — counterparty is within 1 hop of a sanctioned entity. Block trade and escalate to compliance.",
    };
  }

  return {
    sanctionsProximity: 4,
    graphRiskScore: 20,
    recommendation:
      "ALLOW — counterparty is at safe distance from any sanctioned entity (proximity 4+). Proceed with standard checks.",
  };
}

/**
 * Compute a basic trade-graph score for a tenant.
 *
 * The production GNN would embed the tenant's ego-graph (contacts, trades, financiers).
 * This stub uses SavedContact + Trade counts as a proxy: more edges and higher average
 * trust ⇒ healthier graph.
 */
export async function getTradeGraphScore(
  tenantGtid: string,
): Promise<TradeGraphScore> {
  const [contacts, tradesAsBuyer, tradesAsSeller] = await Promise.all([
    db.savedContact.findMany({ where: { ownerGtid: tenantGtid } }),
    db.trade.findMany({ where: { buyerGtid: tenantGtid } }),
    db.trade.findMany({ where: { sellerGtid: tenantGtid } }),
  ]);

  const nodeCount = contacts.length + 1; // contacts + self
  const edgeCount = tradesAsBuyer.length + tradesAsSeller.length;

  const trustValues = [
    ...contacts.map((c) => c.healthScore),
    ...tradesAsBuyer.map((t) => t.healthScore),
    ...tradesAsSeller.map((t) => t.healthScore),
  ].filter((v) => typeof v === "number" && !Number.isNaN(v));

  const avgTrust =
    trustValues.length > 0
      ? Math.round(
          trustValues.reduce((sum, v) => sum + v, 0) / trustValues.length,
        )
      : 0;

  return { nodeCount, edgeCount, avgTrust };
}
