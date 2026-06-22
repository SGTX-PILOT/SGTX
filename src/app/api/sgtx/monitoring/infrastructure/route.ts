import { NextResponse } from "next/server";
import {
  getInfrastructureStatus,
  getArchitectureDiagram,
  getDeploymentManifest,
} from "@/lib/sgtx/monitoring/infrastructure";

// GET /api/sgtx/monitoring/infrastructure — infrastructure status + architecture
//
// Blueprint Parts 9-11 — documents the intended production architecture
// (K3s, NATS, PostgreSQL 18, ClickHouse, Valkey, OPA, WasmEdge, Cilium, Falco,
// Wazuh, Trivy, Prometheus, Grafana, Loki, Jaeger, HSM, Sigstore) and returns
// simulated health for each component.
//
// Returns:
//   - components: 18 InfraComponent[] (per-component health)
//   - deploymentMode: "PRODUCTION" | "DEVELOPMENT"
//   - nodes: 5 SovereignNode[] (Cairo ×2, Dubai ×1, Frankfurt ×2)
//   - summary: counts + primary region
//   - architectureDiagram: ASCII diagram (string)
//   - deploymentManifest: pinned versions of every component
export async function GET() {
  try {
    const status = getInfrastructureStatus();
    const diagram = getArchitectureDiagram();
    const manifest = getDeploymentManifest();

    return NextResponse.json({
      ok: true,
      mode: "SIMULATION",
      ...status,
      architectureDiagram: diagram,
      deploymentManifest: manifest,
    });
  } catch (e: any) {
    console.error("[monitoring/infrastructure GET] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to fetch infrastructure status" },
      { status: 500 },
    );
  }
}
