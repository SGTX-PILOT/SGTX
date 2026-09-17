// SGTX Brain Core — Shared types for the entire Brain OS
// Every crate depends on this. No business logic. Pure type definitions.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

// ============ Identifiers ============
pub type BrainId = Uuid;
pub type ModuleId = String;
pub type AgentId = Uuid;
pub type SessionId = Uuid;
pub type CorrelationId = String;
pub type TraceId = String;
pub type SpanId = String;

// ============ Authority Levels (Blueprint Part 1.4) ============
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum AuthorityLevel {
    A0, // Pure computation (no AI)
    A1, // Advisory (text generation, summaries)
    A2, // Document extraction (HS codes, product forms)
    A3, // Structured decisions (risk scoring, pricing)
    A4, // Orchestrated actions (requires Governor validation)
    A5, // FORBIDDEN — autonomous execution (constitutionally blocked)
}

// ============ Constitutional ============
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ConstitutionalVerdict {
    Allow,
    Conditional,
    Deny,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConstitutionalCondition {
    pub condition_id: String,
    pub label: String,
    pub status: ConditionStatus,
    pub action_url: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ConditionStatus {
    Met,
    Unmet,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConstitutionalDecision {
    pub decision_id: String,
    pub verdict: ConstitutionalVerdict,
    pub conditions: Vec<ConstitutionalCondition>,
    pub rationale: String,
    pub loom_hash: String,
    pub signature: String,
    pub module_versions: HashMap<String, String>,
    pub ai_confidence: Option<f64>,
    pub created_at: DateTime<Utc>,
}

// ============ Module Lifecycle ============
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ModuleStatus {
    Registered,
    Initializing,
    Active,
    Degraded,
    Failed,
    ShuttingDown,
    Shutdown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ModuleType {
    Capability,
    Adapter,
    Learning,
    Observability,
    Infrastructure,
    Registry,
    Manager,
    Agent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModuleDescriptor {
    pub id: ModuleId,
    pub name: String,
    pub version: String,
    pub module_type: ModuleType,
    pub authority: AuthorityLevel,
    pub description: String,
    pub capabilities: Vec<String>,
    pub subscriptions: Vec<String>,
    pub dependencies: Vec<ModuleId>,
}

// ============ Health ============
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum HealthStatus {
    Healthy,
    Degraded,
    Unhealthy,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthCheck {
    pub status: HealthStatus,
    pub latency_ms: f64,
    pub details: Option<serde_json::Value>,
    pub checked_at: DateTime<Utc>,
}

// ============ Metrics ============
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MetricType {
    Counter,
    Gauge,
    Histogram,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Metric {
    pub name: String,
    pub value: f64,
    pub labels: HashMap<String, String>,
    pub metric_type: MetricType,
    pub timestamp: DateTime<Utc>,
}

// ============ Configuration ============
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrainConfig {
    pub kernel: KernelConfig,
    pub event_bus: EventBusConfig,
    pub storage: StorageConfig,
    pub observability: ObservabilityConfig,
    pub agents: AgentConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KernelConfig {
    pub instance_id: String,
    pub max_concurrent_tasks: usize,
    pub shutdown_timeout_secs: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventBusConfig {
    pub transport: String, // "memory" | "nats"
    pub nats_url: Option<String>,
    pub max_in_flight: usize,
    pub retry_attempts: u32,
    pub retry_delay_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageConfig {
    pub postgres_url: String,
    pub redis_url: String,
    pub clickhouse_url: Option<String>,
    pub max_connections: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObservabilityConfig {
    pub metrics_port: u16,
    pub otel_endpoint: Option<String>,
    pub log_level: String,
    pub log_format: String, // "json" | "pretty"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub max_concurrent_agents: usize,
    pub agent_timeout_secs: u64,
    pub sandbox_enabled: bool,
}

impl Default for BrainConfig {
    fn default() -> Self {
        Self {
            kernel: KernelConfig {
                instance_id: Uuid::new_v4().to_string(),
                max_concurrent_tasks: 1000,
                shutdown_timeout_secs: 30,
            },
            event_bus: EventBusConfig {
                transport: "memory".into(),
                nats_url: None,
                max_in_flight: 5000,
                retry_attempts: 3,
                retry_delay_ms: 100,
            },
            storage: StorageConfig {
                postgres_url: "postgres://sgtx:sgtx@localhost:5432/sgtx_brain".into(),
                redis_url: "redis://localhost:6379".into(),
                clickhouse_url: None,
                max_connections: 50,
            },
            observability: ObservabilityConfig {
                metrics_port: 9090,
                otel_endpoint: None,
                log_level: "info".into(),
                log_format: "json".into(),
            },
            agents: AgentConfig {
                max_concurrent_agents: 500,
                agent_timeout_secs: 300,
                sandbox_enabled: true,
            },
        }
    }
}
