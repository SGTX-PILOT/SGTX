// SGTX Infrastructure Status — documents the intended production architecture
// and simulates health checks for each component.
//
// Production stack (per blueprint Parts 9-11):
//   - K3s (lightweight Kubernetes) on bare-metal sovereign nodes
//       Nodes located in Cairo (primary), Dubai (secondary), Frankfurt (tertiary)
//       Each node: 2× AMD EPYC 64-core, 512GB RAM, 8TB NVMe, 100Gbps network
//   - NATS JetStream  — messaging + KV for FeeLock (3-node cluster, RF=3)
//   - PostgreSQL 18   — primary database (pgvector, RLS, pgaudit, logical replication)
//                        Primary in Cairo, sync replica in Dubai, async in Frankfurt
//   - ClickHouse      — analytics, time-series (columnar)
//   - TimescaleDB     — hypertables for audit logs (7-year retention)
//   - Valkey          — Redis-compatible cache (session, rate-limit, feature flags)
//   - OPA             — policy engine (bundles synced from /api/sgtx/opa/policies)
//   - WasmEdge        — constitutional runtime (7 immutable modules)
//   - Cilium          — eBPF networking (L7 policies + service mesh mTLS)
//   - Falco           — runtime security (syscall anomaly detection)
//   - Wazuh           — HIDS (file-integrity + log analysis)
//   - Trivy           — container image CVE scanning
//   - Prometheus + Grafana + Loki + Jaeger — observability stack
//   - SoftHSM (dev) / Thales Luna 7 HSM (production) — root key custody
//   - Sigstore + Rekor — software supply-chain attestation
//
// In this development environment: Next.js 15 + Prisma + SQLite (single-node
// simulation). This module returns the production architecture spec + simulated
// health for each component.
//
// Functions exposed:
//   - getInfrastructureStatus()  → components + deployment mode + sovereign nodes
//   - getArchitectureDiagram()   → textual architecture diagram (ASCII)
//   - getDeploymentManifest()    → pinned versions of each component

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export type InfraComponentStatus =
  | "OPERATIONAL"
  | "DEGRADED"
  | "OUTAGE"
  | "MAINTENANCE";

export type InfraCategory =
  | "ORCHESTRATION"
  | "MESSAGING"
  | "DATABASE"
  | "ANALYTICS"
  | "CACHE"
  | "POLICY"
  | "RUNTIME"
  | "NETWORK"
  | "SECURITY"
  | "OBSERVABILITY"
  | "CRYPTO";

export interface InfraComponent {
  id: string;
  name: string;
  category: InfraCategory;
  version: string;
  status: InfraComponentStatus;
  role: string;
  description: string;
  replicas: number;
  regions: string[];
  cpuUsagePct: number;
  memoryUsagePct: number;
  diskUsagePct: number;
  lastHealthCheckAt: string;
  uptimeHours: number;
  notes: string[];
}

export interface SovereignNode {
  id: string;
  hostname: string;
  region: string;
  country: string;
  role: "primary" | "secondary" | "tertiary" | "witness";
  status: InfraComponentStatus;
  k3sVersion: string;
  cpuCores: number;
  memoryGb: number;
  diskTb: number;
  networkGbps: number;
  latencyToPrimaryMs: number;
  lastHeartbeatAt: string;
}

export interface InfrastructureStatus {
  components: InfraComponent[];
  deploymentMode: "PRODUCTION" | "DEVELOPMENT";
  nodes: SovereignNode[];
  summary: {
    totalComponents: number;
    operational: number;
    degraded: number;
    outage: number;
    maintenance: number;
    totalNodes: number;
    primaryRegion: string;
    deploymentMode: "PRODUCTION" | "DEVELOPMENT";
  };
  checkedAt: string;
}

export interface DeploymentManifest {
  k3sVersion: string;
  natsVersion: string;
  postgresqlVersion: string;
  clickhouseVersion: string;
  timescaleDbVersion: string;
  valkeyVersion: string;
  opaVersion: string;
  wasmedgeVersion: string;
  ciliumVersion: string;
  falcoVersion: string;
  wazuhVersion: string;
  trivyVersion: string;
  prometheusVersion: string;
  grafanaVersion: string;
  lokiVersion: string;
  jaegerVersion: string;
  hsmType: "SoftHSM" | "Thales Luna 7";
  hsmFipsLevel: number;
  nextjsVersion: string;
  prismaVersion: string;
  database: "PostgreSQL 18" | "SQLite";
  schemaVersion: string;
  buildCommit: string;
  buildDate: string;
  generatedAt: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Component catalog
// ──────────────────────────────────────────────────────────────────────────

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function buildComponents(): InfraComponent[] {
  const now = Date.now();
  const components: Array<Partial<InfraComponent> & { id: string; name: string; category: InfraCategory; version: string; role: string; description: string }> = [
    {
      id: "INFRA-K3S",
      name: "K3s (Lightweight Kubernetes)",
      category: "ORCHESTRATION",
      version: "v1.31.0+k3s1",
      role: "Container orchestration",
      description:
        "Lightweight Kubernetes distribution running on bare-metal sovereign nodes. K3s replaces full k8s with a single-binary deployment — 512MB RAM overhead vs 4GB for full k8s.",
      notes: [
        "3 control-plane nodes (Cairo primary, Dubai secondary, Frankfurt tertiary)",
        "etcd cluster RF=3 across sovereign regions",
        "PodSecurityPolicy: restricted (no privileged pods)",
        "Auto-scaling: 2-10 worker nodes per region",
      ],
    },
    {
      id: "INFRA-NATS",
      name: "NATS JetStream",
      category: "MESSAGING",
      version: "v2.10.20",
      role: "Messaging + KV (FeeLock)",
      description:
        "At-least-once messaging + durable key-value storage. FeeLock KV lives here with strong consistency (RF=3, ack-required). Replaces Kafka for low-latency (~1ms) trade events.",
      notes: [
        "3-node cluster (Cairo, Dubai, Frankfurt) — RF=3, quorum=2",
        "Streams: sgtx.trade.events, sgtx.gov.adapter.calls, sgtx.psp.events",
        "KV buckets: fee-lock, idempotency-keys, session-state, feature-flags",
        "Consumer lag alerting via Prometheus exporter",
      ],
    },
    {
      id: "INFRA-POSTGRES",
      name: "PostgreSQL 18",
      category: "DATABASE",
      version: "v18.0",
      role: "Primary relational database",
      description:
        "Authoritative state for trades, tenants, disputes, incidents, configuration. Row-Level Security per tenant, pgvector for embeddings, pgaudit for SELECT/INSERT/UPDATE/DELETE logging, logical replication to ClickHouse + TimescaleDB.",
      notes: [
        "Primary: Cairo. Sync replica: Dubai. Async replica: Frankfurt.",
        "Extensions: pgvector (0.7+), pgaudit, pg_stat_statements, pg_partman",
        "RLS enabled on all tenant-scoped tables (50+ policies)",
        "Daily base backup + WAL archive (PITR) — 30-day retention",
        "Encrypted at rest (AES-256-GCM via LUKS)",
      ],
    },
    {
      id: "INFRA-CLICKHOUSE",
      name: "ClickHouse",
      category: "ANALYTICS",
      version: "v24.8",
      role: "Columnar analytics + time-series",
      description:
        "Real-time OLAP for trade analytics, TCN corridor analytics, AI inference logs. Sub-second queries over billions of rows. Replicated via Keeper (ZooKeeper-compatible).",
      notes: [
        "Shard + replica topology (3 shards × 2 replicas = 6 nodes)",
        "Tables: trade_events, ai_inference_log, corridor_analytics, governor_decisions",
        "Materialized views aggregate raw events every 1 minute",
        "TTL: raw=30d, aggregated=2y",
      ],
    },
    {
      id: "INFRA-TIMESCALE",
      name: "TimescaleDB",
      category: "ANALYTICS",
      version: "v2.14",
      role: "Audit log hypertables",
      description:
        "PostgreSQL extension for time-series. Stores audit logs (Governor decisions, PSP webhooks, government adapter calls, incidents) on 7-year retention per PDPL Art. 32.",
      notes: [
        "Hypertables: governor_audit, psp_audit, gov_adapter_audit, security_audit",
        "Chunk interval: 1 day",
        "Compression: enabled after 7 days (90% reduction)",
        "Continuous aggregates: hourly + daily rollups",
      ],
    },
    {
      id: "INFRA-VALKEY",
      name: "Valkey (Redis-compatible)",
      category: "CACHE",
      version: "v7.2.5",
      role: "Cache + session + rate-limit",
      description:
        "In-memory key-value cache. Holds: session JWTs (5min TTL), rate-limit counters, feature-flag overrides, hot trade data. Replaces Redis after license change.",
      notes: [
        "3-node cluster with sharding (8192 hash slots)",
        "Persistence: AOF every-second + RDB every hour",
        "Max memory: 16GB per node, LRU eviction",
        "Used by: rate-limit middleware, session store, OPA bundle cache",
      ],
    },
    {
      id: "INFRA-OPA",
      name: "Open Policy Agent",
      category: "POLICY",
      version: "v1.0.0",
      role: "Policy engine (Rego)",
      description:
        "Evaluates Rego policies for every API request. 8 authoritative policies: permissions, fee, financing, distressed, multiship, logistics, broker, reserve (see /core/governor/policies/).",
      notes: [
        "Bundle synced from /api/sgtx/opa/policies every 60s",
        "Decision logs streamed to Loki",
        "Hot-reload via Bundle API (no restart needed)",
        "Cache: 5min TTL per policy+input hash",
      ],
    },
    {
      id: "INFRA-WASMEDGE",
      name: "WasmEdge Runtime",
      category: "RUNTIME",
      version: "v0.14.1",
      role: "Constitutional WASM execution",
      description:
        "Sandboxed WASM runtime for 7 constitutional modules (constitutional_rules, jurisdiction_matrix, incoterms_engine, fee_gate, distressed_country_gate, dual_mode_gate, reserve_rules). Hot-reloadable via NATS subject `constitutional.modules.update`.",
      notes: [
        "Sandbox: no host I/O, no network, no filesystem",
        "Pre-compiled AOT mode for 2× faster execution",
        "Each Governor decision calls 3-7 modules in sequence",
        "Memory limit: 32MB per module instance",
      ],
    },
    {
      id: "INFRA-CILIUM",
      name: "Cilium (eBPF)",
      category: "NETWORK",
      version: "v1.16.4",
      role: "L7 networking + service mesh",
      description:
        "eBPF-based networking with L7 (HTTP/gRPC) visibility. Provides zero-trust east-west mTLS, per-pod identity, network policies, and DDoS mitigation without sidecar overhead.",
      notes: [
        "Service mesh: mTLS between all internal services (no sidecars)",
        "L7 policies: per-endpoint HTTP allow-list",
        "Hubble: real-time flow visibility (L4 + L7)",
        "Rate limiting: per-source-IP + per-tenant at L7",
      ],
    },
    {
      id: "INFRA-FALCO",
      name: "Falco",
      category: "SECURITY",
      version: "v0.39.1",
      role: "Runtime security (syscall anomaly)",
      description:
        "eBPF-based runtime security. Detects anomalous syscalls (e.g. shell execution in non-shell container, file reads outside allowed paths, unexpected network connections).",
      notes: [
        "Default rules + 15 SGTX-specific rules",
        "Alerts routed to Loki + Alertmanager + Slack #security-alerts",
        "No runtime overhead (eBPF kernel-side filtering)",
        "Tunable: per-namespace syscall baseline",
      ],
    },
    {
      id: "INFRA-WAZUH",
      name: "Wazuh (HIDS)",
      category: "SECURITY",
      version: "v4.8",
      role: "Host IDS + file integrity",
      description:
        "File-integrity monitoring (FIM) on /etc, /opt/sgtx, /var/lib/postgresql. Log analysis for SSH bruteforce, sudo abuse, rootkits. SOC 2 compliance evidence.",
      notes: [
        "Agents on every sovereign node",
        "FIM baseline: SHA256 of every file in monitored paths",
        "Active response: IP ban after 5 SSH failures",
        "Manager in Frankfurt (sovereign EU region for SOC evidence)",
      ],
    },
    {
      id: "INFRA-TRIVY",
      name: "Trivy",
      category: "SECURITY",
      version: "v0.55.2",
      role: "Container image + IaC scanning",
      description:
        "Scans every container image in CI before deploy. CVE database synced hourly. Blocks deploy if CRITICAL CVE with available fix is found.",
      notes: [
        "CI gate: builds fail on CRITICAL CVE",
        "Runtime re-scan: nightly against running images",
        "IaC scan: Terraform + Kubernetes manifests",
        "Secret scanning: detects hardcoded API keys / passwords",
      ],
    },
    {
      id: "INFRA-PROMETHEUS",
      name: "Prometheus",
      category: "OBSERVABILITY",
      version: "v2.54.1",
      role: "Metrics scraper + TSDB",
      description:
        "Scrapes metrics from all services every 15s. 30-day retention. Remote-write to long-term storage (Thanos) for 1-year retention. Alertmanager for alert routing.",
      notes: [
        "Federation: 1 Prometheus per region, federated to central",
        "Recording rules: pre-compute common queries (every 5min)",
        "Alerting rules: 47 rules across 8 services",
        "Remote-write to Thanos (S3-compatible, 1y retention)",
      ],
    },
    {
      id: "INFRA-GRAFANA",
      name: "Grafana",
      category: "OBSERVABILITY",
      version: "v11.2.0",
      role: "Dashboards + alerting UI",
      description:
        "12 dashboards: Governor, FeeLock, Release API, Workflow, Inbox, AI, Payment, Gov Adapters, SLA, Security, HSM, Sovereignty. SSO via OIDC to Identity Service.",
      notes: [
        "12 dashboards (1 per service) + 4 executive dashboards",
        "Alerting: integrated with Alertmanager (unified view)",
        "Public status page: read-only embeddable panels",
        "Datasources: Prometheus, Loki, ClickHouse, PostgreSQL",
      ],
    },
    {
      id: "INFRA-LOKI",
      name: "Loki",
      category: "OBSERVABILITY",
      version: "v3.2.1",
      role: "Log aggregation",
      description:
        "Horizontally-scalable log aggregation. 30-day retention. Integrates with Grafana for log-query + alerting. PII redaction in pipeline before ingest.",
      notes: [
        "PII redaction: regex-based, applied at Promtail",
        "Index: 1 hour granularity (low-cardinality labels only)",
        "Storage: S3-compatible object store",
        "Alerts: 23 rules (error spikes, security events)",
      ],
    },
    {
      id: "INFRA-JAEGER",
      name: "Jaeger",
      category: "OBSERVABILITY",
      version: "v1.60",
      role: "Distributed tracing (OpenTelemetry)",
      description:
        "End-to-end trace for every API request. 1% sampling in production, 100% for errors. Spans for DB, NATS, OPA, WASM, external adapters.",
      notes: [
        "OpenTelemetry Collector in front of Jaeger",
        "Sampling: 1% baseline, 100% on errors + P0 USTNs",
        "Storage: Elasticsearch (7-day retention)",
        "Trace context propagated via W3C Trace Context headers",
      ],
    },
    {
      id: "INFRA-SOFTHSM",
      name: "SoftHSM (dev) / Thales Luna 7 (prod)",
      category: "CRYPTO",
      version: "SoftHSM v2.6.1",
      role: "Root key custody",
      description:
        "HSM holding root signing keys (Governor Ed25519, WASM signing, reserve proof Dilithium3). Production: Thales Luna 7 with FIPS 140-2 Level 3. Dev: SoftHSM (software emulation).",
      notes: [
        "10 active keys across 5 HSM slots",
        "3-of-5 custody quorum for any signing operation",
        "5 custodians across 3 jurisdictions (Cairo, Dubai, Frankfurt)",
        "Annual third-party custody audit (Big Four)",
        "Non-exportable keys — keys never leave the HSM boundary",
      ],
    },
    {
      id: "INFRA-SIGSTORE",
      name: "Sigstore + Rekor",
      category: "CRYPTO",
      version: "v1.13.0",
      role: "Software supply-chain attestation",
      description:
        "Signs every container image + WASM module at build time. Rekor transparency log is append-only, publicly auditable. Verify at deploy time.",
      notes: [
        "Cosign signs OCI artifacts with platform Ed25519 key",
        "Rekor: append-only transparency log (Merkle tree)",
        "Deployment gate: refuses unsigned images",
        "Annual transparency log audit (independent verifier)",
      ],
    },
  ];

  return components.map((c, i) => {
    const r = pseudoRandom(i * 17 + 1);
    let status: InfraComponentStatus;
    if (r < 0.05) status = "DEGRADED";
    else if (r < 0.08) status = "MAINTENANCE";
    else status = "OPERATIONAL";

    return {
      id: c.id,
      name: c.name,
      category: c.category,
      version: c.version,
      status,
      role: c.role,
      description: c.description,
      replicas: c.category === "DATABASE" || c.category === "MESSAGING" ? 3 : c.category === "OBSERVABILITY" ? 2 : 1,
      regions: c.category === "DATABASE" || c.category === "MESSAGING" || c.category === "ORCHESTRATION"
        ? ["cairo", "dubai", "frankfurt"]
        : ["cairo"],
      cpuUsagePct: Math.round(20 + r * 60),
      memoryUsagePct: Math.round(30 + r * 50),
      diskUsagePct: Math.round(15 + pseudoRandom(i * 17 + 2) * 65),
      lastHealthCheckAt: new Date(now - Math.floor(r * 60_000)).toISOString(),
      uptimeHours: Math.floor(100 + r * 2000),
      notes: c.notes ?? [],
    } as InfraComponent;
  });
}

function buildSovereignNodes(): SovereignNode[] {
  const now = Date.now();
  return [
    {
      id: "NODE-CAIRO-01",
      hostname: "sgtx-cairo-01.sovereign.sgtx.io",
      region: "cairo",
      country: "EG",
      role: "primary",
      status: "OPERATIONAL",
      k3sVersion: "v1.31.0+k3s1",
      cpuCores: 128,
      memoryGb: 512,
      diskTb: 8,
      networkGbps: 100,
      latencyToPrimaryMs: 0,
      lastHeartbeatAt: new Date(now - 5_000).toISOString(),
    },
    {
      id: "NODE-CAIRO-02",
      hostname: "sgtx-cairo-02.sovereign.sgtx.io",
      region: "cairo",
      country: "EG",
      role: "primary",
      status: "OPERATIONAL",
      k3sVersion: "v1.31.0+k3s1",
      cpuCores: 128,
      memoryGb: 512,
      diskTb: 8,
      networkGbps: 100,
      latencyToPrimaryMs: 2,
      lastHeartbeatAt: new Date(now - 4_000).toISOString(),
    },
    {
      id: "NODE-DUBAI-01",
      hostname: "sgtx-dubai-01.sovereign.sgtx.io",
      region: "dubai",
      country: "AE",
      role: "secondary",
      status: "OPERATIONAL",
      k3sVersion: "v1.31.0+k3s1",
      cpuCores: 128,
      memoryGb: 512,
      diskTb: 8,
      networkGbps: 100,
      latencyToPrimaryMs: 12,
      lastHeartbeatAt: new Date(now - 6_000).toISOString(),
    },
    {
      id: "NODE-FRANKFURT-01",
      hostname: "sgtx-frankfurt-01.sovereign.sgtx.io",
      region: "frankfurt",
      country: "DE",
      role: "tertiary",
      status: "OPERATIONAL",
      k3sVersion: "v1.31.0+k3s1",
      cpuCores: 128,
      memoryGb: 512,
      diskTb: 8,
      networkGbps: 100,
      latencyToPrimaryMs: 38,
      lastHeartbeatAt: new Date(now - 5_000).toISOString(),
    },
    {
      id: "NODE-FRANKFURT-02",
      hostname: "sgtx-frankfurt-02.sovereign.sgtx.io",
      region: "frankfurt",
      country: "DE",
      role: "witness",
      status: "OPERATIONAL",
      k3sVersion: "v1.31.0+k3s1",
      cpuCores: 64,
      memoryGb: 256,
      diskTb: 4,
      networkGbps: 40,
      latencyToPrimaryMs: 39,
      lastHeartbeatAt: new Date(now - 7_000).toISOString(),
    },
  ];
}

// ──────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────

export function getInfrastructureStatus(): InfrastructureStatus {
  const components = buildComponents();
  const nodes = buildSovereignNodes();

  const operational = components.filter((c) => c.status === "OPERATIONAL").length;
  const degraded = components.filter((c) => c.status === "DEGRADED").length;
  const outage = components.filter((c) => c.status === "OUTAGE").length;
  const maintenance = components.filter((c) => c.status === "MAINTENANCE").length;

  // In this dev environment we're in DEVELOPMENT mode — but we report the
  // production architecture spec from the components catalog. Consumers can
  // use `deploymentMode` to decide whether to render the simulated health
  // numbers (dev) or wire up to live Prometheus (prod).
  const deploymentMode: "PRODUCTION" | "DEVELOPMENT" =
    process.env.NODE_ENV === "production" ? "PRODUCTION" : "DEVELOPMENT";

  return {
    components,
    deploymentMode,
    nodes,
    summary: {
      totalComponents: components.length,
      operational,
      degraded,
      outage,
      maintenance,
      totalNodes: nodes.length,
      primaryRegion: "cairo",
      deploymentMode,
    },
    checkedAt: new Date().toISOString(),
  };
}

export function getArchitectureDiagram(): string {
  return [
    "┌──────────────────────────────────────────────────────────────────────────────────────┐",
    "│                          SGTX SOVEREIGN TRADE OPERATING SYSTEM                       │",
    "│                          Production Architecture (Blueprint v11.1)                   │",
    "└──────────────────────────────────────────────────────────────────────────────────────┘",
    "",
    "    ┌─────────────────────── SOVEREIGN REGIONS ───────────────────────┐",
    "    │                                                                │",
    "    │   CAIRO (EG) ── primary    DUBAI (AE) ── secondary             │",
    "    │       │                       │                                │",
    "    │       └─────── sync rep ──────┘                                │",
    "    │                       │                                        │",
    "    │                       └──── async rep ── FRANKFURT (DE) ── tert │",
    "    │                                                                │",
    "    └────────────────────────────────────────────────────────────────┘",
    "",
    "                            ┌──────────────────┐",
    "                            │   Cloudflare     │  ← Anycast, WAF, DDoS",
    "                            │   (Internet→DMZ) │",
    "                            └────────┬─────────┘",
    "                                     │",
    "                            ┌────────▼─────────┐",
    "                            │   Cilium (eBPF)  │  ← L7 + mTLS mesh",
    "                            │  zero-trust mesh │",
    "                            └────────┬─────────┘",
    "                                     │",
    "    ┌────────────────────────────────┼────────────────────────────────┐",
    "    │                                │                                │",
    "    ▼                                ▼                                ▼",
    "┌─────────┐                    ┌─────────┐                      ┌──────────┐",
    "│ Next.js │                    │Governor │                      │ Payment  │",
    "│ Portals │                    │ Service │                      │   Orch.  │",
    "│ (10)    │                    │         │                      │          │",
    "└────┬────┘                    └────┬────┘                      └────┬─────┘",
    "     │                              │                                │",
    "     │     ┌────────────────────────┼────────────────────────┐       │",
    "     │     │                        │                        │       │",
    "     │     ▼                        ▼                        ▼       │",
    "     │  ┌──────┐               ┌─────────┐              ┌─────────┐  │",
    "     │  │ OPA  │◄──────────────│WasmEdge │              │ FeeLock │  │",
    "     │  │Rego  │  policy eval  │  7 WASM │              │   KV    │──┘",
    "     │  │ (8)  │               │ modules │              │ (NATS)  │",
    "     │  └──────┘               └────┬────┘              └────┬────┘",
    "     │                              │                        │",
    "     │                              │ Loom-anchor            │",
    "     │                              ▼                        │",
    "     │                        ┌──────────┐                   │",
    "     │                        │   HSM    │                   │",
    "     │                        │ SoftHSM/ │                   │",
    "     │                        │   Luna   │                   │",
    "     │                        └──────────┘                   │",
    "     │                                                       │",
    "     ▼                                                       ▼",
    "┌──────────────────────────────────────────────────────────────────┐",
    "│                       PostgreSQL 18 (primary)                    │",
    "│  RLS · pgvector · pgaudit · logical replication                  │",
    "└────┬─────────────────────┬───────────────────────┬──────────────┘",
    "     │                     │                       │",
    "     ▼                     ▼                       ▼",
    "┌──────────┐         ┌──────────┐            ┌──────────┐",
    "│ ClickHse │         │ Timescale│            │  Valkey  │",
    "│ analytics│         │ audit    │            │  cache   │",
    "└──────────┘         └──────────┘            └──────────┘",
    "",
    "    ┌──────────────────── GOVERNMENT ADAPTERS ────────────────────┐",
    "    │  Nafeza (Customs)  ·  CargoX (B/L)  ·  ETA (e-Invoice)      │",
    "    │  CBE (Settlement)  ·  Egypt Trust CA (mTLS)                  │",
    "    │  Each: mTLS + idempotency + queue + retry + rate-limit       │",
    "    └─────────────────────────────────────────────────────────────┘",
    "",
    "    ┌──────────────────── OBSERVABILITY STACK ────────────────────┐",
    "    │  Prometheus  →  Grafana  (12 dashboards)                    │",
    "    │  Loki        →  log aggregation (30d, PII redacted)          │",
    "    │  Jaeger      →  distributed tracing (OpenTelemetry)          │",
    "    │  Alertmanager→  PagerDuty / OpsGenie / Slack                 │",
    "    └─────────────────────────────────────────────────────────────┘",
    "",
    "    ┌──────────────────── SECURITY STACK ─────────────────────────┐",
    "    │  Cilium (eBPF) · Falco (runtime) · Wazuh (HIDS)              │",
    "    │  Trivy (image CVE) · Sigstore + Rekor (supply chain)         │",
    "    │  HSM (FIPS 140-2 L3) · Loom (append-only audit chain)        │",
    "    └─────────────────────────────────────────────────────────────┘",
    "",
    "    DEV ENVIRONMENT: Next.js 15 + Prisma + SQLite (single-node)",
    "    This module returns the production architecture spec + simulated",
    "    health for each component. Use `deploymentMode` to detect dev.",
    "",
  ].join("\n");
}

export function getDeploymentManifest(): DeploymentManifest {
  return {
    k3sVersion: "v1.31.0+k3s1",
    natsVersion: "v2.10.20",
    postgresqlVersion: "v18.0",
    clickhouseVersion: "v24.8",
    timescaleDbVersion: "v2.14",
    valkeyVersion: "v7.2.5",
    opaVersion: "v1.0.0",
    wasmedgeVersion: "v0.14.1",
    ciliumVersion: "v1.16.4",
    falcoVersion: "v0.39.1",
    wazuhVersion: "v4.8",
    trivyVersion: "v0.55.2",
    prometheusVersion: "v2.54.1",
    grafanaVersion: "v11.2.0",
    lokiVersion: "v3.2.1",
    jaegerVersion: "v1.60",
    hsmType: process.env.NODE_ENV === "production" ? "Thales Luna 7" : "SoftHSM",
    hsmFipsLevel: 3,
    nextjsVersion: "v15.0.0",
    prismaVersion: "v6.11.1",
    database: process.env.NODE_ENV === "production" ? "PostgreSQL 18" : "SQLite",
    schemaVersion: "v11.1.0-blueprint",
    buildCommit: "abcdef0",
    buildDate: new Date().toISOString(),
    generatedAt: new Date().toISOString(),
  };
}
