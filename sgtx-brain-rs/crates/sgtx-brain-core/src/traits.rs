// SGTX Brain Core — Trait Definitions (Interfaces First)
// Every module in the Brain OS implements one or more of these traits.
// No business logic. Pure interface definitions.

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use uuid::Uuid;

use crate::types::*;
use crate::BrainError;

// ============ BrainModule — the universal module trait ============
#[async_trait]
pub trait BrainModule: Send + Sync {
    fn descriptor(&self) -> &ModuleDescriptor;

    async fn initialize(&self) -> Result<(), BrainError>;
    async fn shutdown(&self) -> Result<(), BrainError>;
    async fn health_check(&self) -> Result<HealthCheck, BrainError>;

    fn status(&self) -> ModuleStatus;
}

// ============ Event Bus ============
#[async_trait]
pub trait EventBus: Send + Sync {
    async fn publish(&self, event: BrainEvent) -> Result<(), BrainError>;
    async fn subscribe(
        &self,
        event_type: &str,
        handler: Arc<dyn EventHandler>,
    ) -> Result<SubscriptionId, BrainError>;
    async fn unsubscribe(&self, id: SubscriptionId) -> Result<(), BrainError>;
    async fn replay(
        &self,
        from: Option<DateTime<Utc>>,
        types: Option<Vec<String>>,
    ) -> Result<usize, BrainError>;
    fn metrics(&self) -> EventBusMetrics;
}

pub type SubscriptionId = Uuid;

#[async_trait]
pub trait EventHandler: Send + Sync {
    async fn handle(&self, event: &BrainEvent) -> Result<(), BrainError>;
}

#[derive(Debug, Clone)]
pub struct BrainEvent {
    pub id: Uuid,
    pub event_type: String,
    pub aggregate_id: String,
    pub payload: serde_json::Value,
    pub metadata: EventMetadata,
}

#[derive(Debug, Clone)]
pub struct EventMetadata {
    pub source: String,
    pub correlation_id: Option<String>,
    pub causation_id: Option<String>,
    pub timestamp: DateTime<Utc>,
    pub version: String,
    pub tenant_gtid: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct EventBusMetrics {
    pub total_published: u64,
    pub total_delivered: u64,
    pub total_failed: u64,
    pub total_retried: u64,
    pub in_flight: usize,
    pub subscriptions: usize,
}

// ============ Registry — generic trait for all registries ============
#[async_trait]
pub trait Registry<T>: Send + Sync {
    async fn register(&self, item: T) -> Result<(), BrainError>;
    async fn unregister(&self, id: &str) -> Result<(), BrainError>;
    async fn get(&self, id: &str) -> Result<Option<T>, BrainError>;
    async fn list(&self) -> Result<Vec<T>, BrainError>;
    async fn exists(&self, id: &str) -> Result<bool, BrainError>;
}

// ============ Capability Registry ============
#[async_trait]
pub trait CapabilityRegistry: Send + Sync {
    async fn register_capability(&self, name: &str, module_id: &str) -> Result<(), BrainError>;
    async fn resolve(&self, capability: &str) -> Result<Option<ModuleId>, BrainError>;
    async fn list_capabilities(&self) -> Result<Vec<String>, BrainError>;
    async fn list_by_module(&self, module_id: &str) -> Result<Vec<String>, BrainError>;
}

// ============ Model Registry ============
#[async_trait]
pub trait ModelRegistry: Send + Sync {
    async fn register_version(&self, version: ModelVersion) -> Result<(), BrainError>;
    async fn promote(&self, model_id: &str, stage: ModelStage) -> Result<(), BrainError>;
    async fn get_production(&self) -> Result<Option<ModelVersion>, BrainError>;
    async fn list_versions(&self, stage: Option<ModelStage>) -> Result<Vec<ModelVersion>, BrainError>;
    async fn evaluate_promotion(
        &self,
        model_id: &str,
        min_samples: usize,
        threshold: f64,
    ) -> Result<PromotionEvaluation, BrainError>;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelVersion {
    pub id: String,
    pub model_name: String,
    pub version: String,
    pub stage: ModelStage,
    pub deployed_at: Option<DateTime<Utc>>,
    pub metrics: ModelMetrics,
    pub validation_status: ValidationStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ModelStage {
    Candidate,
    Shadow,
    Canary,
    Production,
    Deprecated,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelMetrics {
    pub accuracy: f64,
    pub latency_ms: f64,
    pub cost_per_inference: f64,
    pub sample_size: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ValidationStatus {
    Pending,
    Validated,
    Rejected,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromotionEvaluation {
    pub should_promote: bool,
    pub reason: String,
    pub current_accuracy: f64,
    pub candidate_accuracy: f64,
}

// ============ Memory ============
#[async_trait]
pub trait MemoryStore: Send + Sync {
    async fn store(&self, memory: MemoryEntry) -> Result<(), BrainError>;
    async fn retrieve(&self, id: &str) -> Result<Option<MemoryEntry>, BrainError>;
    async fn search(&self, query: &MemoryQuery) -> Result<Vec<MemoryEntry>, BrainError>;
    async fn expire(&self, before: DateTime<Utc>) -> Result<usize, BrainError>;
    async fn consolidate(&self) -> Result<usize, BrainError>;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryEntry {
    pub id: String,
    pub memory_type: MemoryType,
    pub content: serde_json::Value,
    pub embedding: Option<Vec<f32>>,
    pub metadata: HashMap<String, String>,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub importance: f64,
    pub source: String,
    pub lineage: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum MemoryType {
    Working,
    Semantic,
    Episodic,
    Procedural,
    Organizational,
    Trade,
    LongTerm,
    ShortTerm,
    Conversation,
    Reasoning,
    Learning,
    Knowledge,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryQuery {
    pub memory_types: Vec<MemoryType>,
    pub semantic: Option<String>,
    pub embedding: Option<Vec<f32>>,
    pub top_k: usize,
    pub min_importance: Option<f64>,
    pub filters: HashMap<String, String>,
}

// ============ Knowledge Graph ============
#[async_trait]
pub trait KnowledgeGraph: Send + Sync {
    async fn add_node(&self, node: GraphNode) -> Result<(), BrainError>;
    async fn add_edge(&self, edge: GraphEdge) -> Result<(), BrainError>;
    async fn get_node(&self, id: &str) -> Result<Option<GraphNode>, BrainError>;
    async fn traverse(&self, start: &str, depth: usize) -> Result<GraphTraversal, BrainError>;
    async fn search(&self, query: &GraphQuery) -> Result<Vec<GraphNode>, BrainError>;
    async fn infer(&self, input: &InferenceQuery) -> Result<Vec<InferenceResult>, BrainError>;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphNode {
    pub id: String,
    pub node_type: GraphNodeType,
    pub properties: HashMap<String, serde_json::Value>,
    pub embedding: Option<Vec<f32>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum GraphNodeType {
    Company, Person, Product, Port, Container, Vessel, Country,
    TradeRoute, Bank, Document, Regulation, Government, Warehouse,
    Weather, Currency, Commodity, Event, Risk,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub edge_type: String,
    pub properties: HashMap<String, serde_json::Value>,
    pub weight: f64,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphQuery {
    pub node_types: Vec<GraphNodeType>,
    pub semantic: Option<String>,
    pub embedding: Option<Vec<f32>>,
    pub filters: HashMap<String, serde_json::Value>,
    pub top_k: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphTraversal {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
    pub depth: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InferenceQuery {
    pub start_nodes: Vec<String>,
    pub relation_types: Vec<String>,
    pub max_depth: usize,
    pub min_confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InferenceResult {
    pub node: GraphNode,
    pub confidence: f64,
    pub path: Vec<String>,
    pub evidence: Vec<String>,
}

// ============ Agent OS ============
#[async_trait]
pub trait AgentRuntime: Send + Sync {
    async fn spawn(&self, descriptor: AgentDescriptor) -> Result<AgentId, BrainError>;
    async fn terminate(&self, id: AgentId) -> Result<(), BrainError>;
    async fn send_message(&self, msg: AgentMessage) -> Result<(), BrainError>;
    async fn get_state(&self, id: AgentId) -> Result<AgentState, BrainError>;
    async fn list_agents(&self) -> Result<Vec<AgentDescriptor>, BrainError>;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentDescriptor {
    pub id: AgentId,
    pub name: String,
    pub agent_type: String,
    pub version: String,
    pub capabilities: Vec<String>,
    pub permissions: Vec<String>,
    pub max_concurrent: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMessage {
    pub from: AgentId,
    pub to: AgentId,
    pub message_type: String,
    pub payload: serde_json::Value,
    pub correlation_id: Option<String>,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentState {
    pub id: AgentId,
    pub status: AgentStatus,
    pub current_task: Option<String>,
    pub memory_ref: Option<String>,
    pub last_active: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AgentStatus {
    Idle,
    Running,
    Waiting,
    Failed,
    Terminated,
}

// ============ Storage ============
#[async_trait]
pub trait Storage: Send + Sync {
    async fn put(&self, key: &str, value: &[u8]) -> Result<(), BrainError>;
    async fn get(&self, key: &str) -> Result<Option<Vec<u8>>, BrainError>;
    async fn delete(&self, key: &str) -> Result<(), BrainError>;
    async fn exists(&self, key: &str) -> Result<bool, BrainError>;
}

// ============ Health Manager ============
#[async_trait]
pub trait HealthManager: Send + Sync {
    async fn check(&self, module_id: &str) -> Result<HealthCheck, BrainError>;
    async fn check_all(&self) -> Result<HealthSummary, BrainError>;
    async fn register_check(&self, module_id: &str, check: Arc<dyn HealthChecker>) -> Result<(), BrainError>;
}

#[async_trait]
pub trait HealthChecker: Send + Sync {
    async fn check(&self) -> Result<HealthCheck, BrainError>;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthSummary {
    pub total: usize,
    pub healthy: usize,
    pub degraded: usize,
    pub unhealthy: usize,
    pub checks: Vec<HealthCheck>,
}

// ============ Task Scheduler ============
#[async_trait]
pub trait TaskScheduler: Send + Sync {
    async fn schedule(&self, task: Task) -> Result<Uuid, BrainError>;
    async fn cancel(&self, task_id: Uuid) -> Result<(), BrainError>;
    async fn list_pending(&self) -> Result<Vec<Task>, BrainError>;
    async fn list_running(&self) -> Result<Vec<Task>, BrainError>;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: Uuid,
    pub name: String,
    pub priority: TaskPriority,
    pub scheduled_at: DateTime<Utc>,
    pub timeout_secs: u64,
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub enum TaskPriority {
    Low,
    Normal,
    High,
    Critical,
}

// ============ Configuration Service ============
#[async_trait]
pub trait ConfigurationService: Send + Sync {
    async fn get(&self, key: &str) -> Result<Option<serde_json::Value>, BrainError>;
    async fn set(&self, key: &str, value: serde_json::Value) -> Result<(), BrainError>;
    async fn watch(&self, key: &str) -> Result<ConfigWatch, BrainError>;
}

#[derive(Debug, Clone)]
pub struct ConfigWatch {
    pub key: String,
    pub initial: Option<serde_json::Value>,
}

// ============ Feature Flags ============
#[async_trait]
pub trait FeatureFlags: Send + Sync {
    async fn is_enabled(&self, flag: &str) -> Result<bool, BrainError>;
    async fn enable(&self, flag: &str) -> Result<(), BrainError>;
    async fn disable(&self, flag: &str) -> Result<(), BrainError>;
    async fn list(&self) -> Result<Vec<FeatureFlag>, BrainError>;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureFlag {
    pub name: String,
    pub enabled: bool,
    pub description: String,
    pub updated_at: DateTime<Utc>,
}

// ============ Secrets Manager ============
#[async_trait]
pub trait SecretsManager: Send + Sync {
    async fn get_secret(&self, key: &str) -> Result<Option<String>, BrainError>;
    async fn set_secret(&self, key: &str, value: &str) -> Result<(), BrainError>;
    async fn delete_secret(&self, key: &str) -> Result<(), BrainError>;
    async fn list_keys(&self) -> Result<Vec<String>, BrainError>;
}

// ============ Hot Reload ============
#[async_trait]
pub trait HotReloadManager: Send + Sync {
    async fn reload(&self, module_id: &str) -> Result<(), BrainError>;
    async fn register_reloadable(&self, module_id: &str, reloader: Arc<dyn Reloadable>) -> Result<(), BrainError>;
    async fn list_reloadable(&self) -> Result<Vec<String>, BrainError>;
}

#[async_trait]
pub trait Reloadable: Send + Sync {
    async fn reload(&self) -> Result<(), BrainError>;
}
