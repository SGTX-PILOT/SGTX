//! SGTX Brain Registries — the 12 registry implementations.
//!
//! Each registry is a thin wrapper around a [`DashMap`] and implements the
//! generic [`Registry<T>`] trait from [`sgtx_brain_core`]. Two registries
//! additionally implement registry-specific traits from core:
//! - [`CapabilityRegistryImpl`] implements [`CapabilityRegistry`].
//! - [`ModelRegistryImpl`] implements [`ModelRegistry`].
//!
//! All registries are `Send + Sync`, `#[instrument]`-annotated, and use
//! proper `BrainResult<T>` error handling.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use sgtx_brain_core::{
    AgentDescriptor, BrainError, BrainResult, CapabilityRegistry, ModelMetrics, ModelRegistry,
    ModelStage, ModelVersion, PromotionEvaluation, Registry, ValidationStatus,
};
use tracing::instrument;
use uuid::Uuid;

// ===========================================================================
// 1. Capability Registry
// ===========================================================================

/// Entry stored by [`CapabilityRegistryImpl`].
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CapabilityEntry {
    pub name: String,
    pub module_id: String,
}


/// `capability name → module ID` registry.
pub struct CapabilityRegistryImpl {
    capabilities: DashMap<String, String>,
    by_module: DashMap<String, Vec<String>>,
}

impl CapabilityRegistryImpl {
    pub fn new() -> Self {
        Self {
            capabilities: DashMap::new(),
            by_module: DashMap::new(),
        }
    }
}

impl Default for CapabilityRegistryImpl {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Registry<CapabilityEntry> for CapabilityRegistryImpl {
    #[instrument(skip(self, item))]
    async fn register(&self, item: CapabilityEntry) -> Result<(), BrainError> {
        self.capabilities
            .insert(item.name.clone(), item.module_id.clone());
        self.by_module
            .entry(item.module_id.clone())
            .or_default()
            .push(item.name.clone());
        Ok(())
    }

    #[instrument(skip(self))]
    async fn unregister(&self, id: &str) -> Result<(), BrainError> {
        if let Some((_, module_id)) = self.capabilities.remove(id) {
            if let Some(mut entry) = self.by_module.get_mut(&module_id) {
                entry.retain(|n| n != id);
            }
        }
        Ok(())
    }

    async fn get(&self, id: &str) -> Result<Option<CapabilityEntry>, BrainError> {
        Ok(self
            .capabilities
            .get(id)
            .map(|m| CapabilityEntry {
                name: id.to_string(),
                module_id: m.clone(),
            }))
    }

    async fn list(&self) -> Result<Vec<CapabilityEntry>, BrainError> {
        Ok(self
            .capabilities
            .iter()
            .map(|e| CapabilityEntry {
                name: e.key().clone(),
                module_id: e.value().clone(),
            })
            .collect())
    }

    async fn exists(&self, id: &str) -> Result<bool, BrainError> {
        Ok(self.capabilities.contains_key(id))
    }
}

#[async_trait]
impl CapabilityRegistry for CapabilityRegistryImpl {
    #[instrument(skip(self))]
    async fn register_capability(&self, name: &str, module_id: &str) -> Result<(), BrainError> {
        self.capabilities.insert(name.to_string(), module_id.to_string());
        self.by_module
            .entry(module_id.to_string())
            .or_default()
            .push(name.to_string());
        Ok(())
    }

    async fn resolve(&self, capability: &str) -> Result<Option<String>, BrainError> {
        Ok(self.capabilities.get(capability).map(|m| m.clone()))
    }

    async fn list_capabilities(&self) -> Result<Vec<String>, BrainError> {
        Ok(self.capabilities.iter().map(|e| e.key().clone()).collect())
    }

    async fn list_by_module(&self, module_id: &str) -> Result<Vec<String>, BrainError> {
        Ok(self
            .by_module
            .get(module_id)
            .map(|e| e.clone())
            .unwrap_or_default())
    }
}

// ===========================================================================
// 2. Model Registry
// ===========================================================================


/// `model_id → ModelVersion` registry with lifecycle
/// (candidate → shadow → canary → production → deprecated).
pub struct ModelRegistryImpl {
    versions: DashMap<String, ModelVersion>,
}

impl ModelRegistryImpl {
    pub fn new() -> Self {
        Self {
            versions: DashMap::new(),
        }
    }

    /// Returns the current production version (if any).
    fn production_internal(&self) -> Option<ModelVersion> {
        self.versions
            .iter()
            .filter(|e| e.value().stage == ModelStage::Production)
            .max_by_key(|e| e.value().deployed_at.unwrap_or_else(Utc::now))
            .map(|e| e.value().clone())
    }
}

impl Default for ModelRegistryImpl {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Registry<ModelVersion> for ModelRegistryImpl {
    #[instrument(skip(self, item))]
    async fn register(&self, item: ModelVersion) -> Result<(), BrainError> {
        self.versions.insert(item.id.clone(), item);
        Ok(())
    }

    #[instrument(skip(self))]
    async fn unregister(&self, id: &str) -> Result<(), BrainError> {
        self.versions.remove(id);
        Ok(())
    }

    async fn get(&self, id: &str) -> Result<Option<ModelVersion>, BrainError> {
        Ok(self.versions.get(id).map(|e| e.clone()))
    }

    async fn list(&self) -> Result<Vec<ModelVersion>, BrainError> {
        Ok(self.versions.iter().map(|e| e.value().clone()).collect())
    }

    async fn exists(&self, id: &str) -> Result<bool, BrainError> {
        Ok(self.versions.contains_key(id))
    }
}

#[async_trait]
impl ModelRegistry for ModelRegistryImpl {
    #[instrument(skip(self, version))]
    async fn register_version(&self, version: ModelVersion) -> Result<(), BrainError> {
        self.versions.insert(version.id.clone(), version);
        Ok(())
    }

    #[instrument(skip(self))]
    async fn promote(&self, model_id: &str, stage: ModelStage) -> Result<(), BrainError> {
        let mut entry = self
            .versions
            .get_mut(model_id)
            .ok_or_else(|| BrainError::Internal(format!("model {model_id} not found")))?;
        entry.stage = stage;
        if stage == ModelStage::Production {
            entry.deployed_at = Some(Utc::now());
        }
        Ok(())
    }

    async fn get_production(&self) -> Result<Option<ModelVersion>, BrainError> {
        Ok(self.production_internal())
    }

    async fn list_versions(&self, stage: Option<ModelStage>) -> Result<Vec<ModelVersion>, BrainError> {
        Ok(self
            .versions
            .iter()
            .filter(|e| stage.map_or(true, |s| e.value().stage == s))
            .map(|e| e.value().clone())
            .collect())
    }

    async fn evaluate_promotion(
        &self,
        model_id: &str,
        min_samples: usize,
        threshold: f64,
    ) -> Result<PromotionEvaluation, BrainError> {
        let candidate = self
            .versions
            .get(model_id)
            .map(|e| e.clone())
            .ok_or_else(|| BrainError::Internal(format!("model {model_id} not found")))?;

        if candidate.metrics.sample_size < min_samples {
            return Ok(PromotionEvaluation {
                should_promote: false,
                reason: format!(
                    "insufficient samples: {} < {}",
                    candidate.metrics.sample_size, min_samples
                ),
                current_accuracy: 0.0,
                candidate_accuracy: candidate.metrics.accuracy,
            });
        }

        let prod = self.production_internal();
        let (current_acc, should, reason) = match prod {
            Some(p) => {
                let delta = candidate.metrics.accuracy - p.metrics.accuracy;
                if delta >= threshold {
                    (
                        p.metrics.accuracy,
                        true,
                        format!(
                            "candidate beats production by {:.4} (≥ threshold {:.4})",
                            delta, threshold
                        ),
                    )
                } else {
                    (
                        p.metrics.accuracy,
                        false,
                        format!(
                            "candidate does not beat production (delta={:.4} < threshold {:.4})",
                            delta, threshold
                        ),
                    )
                }
            }
            None => (
                0.0,
                true,
                "no current production model — candidate eligible".into(),
            ),
        };

        Ok(PromotionEvaluation {
            should_promote: should,
            reason,
            current_accuracy: current_acc,
            candidate_accuracy: candidate.metrics.accuracy,
        })
    }
}

// ===========================================================================
// 3. Knowledge Registry
// ===========================================================================

/// A knowledge entry mapping a domain to reusable patterns.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeEntry {
    pub id: String,
    pub domain: String,
    pub patterns: Vec<String>,
    pub metadata: HashMap<String, String>,
    pub created_at: DateTime<Utc>,
}


/// `domain → patterns` knowledge registry.
pub struct KnowledgeRegistryImpl {
    entries: DashMap<String, KnowledgeEntry>,
}

impl KnowledgeRegistryImpl {
    pub fn new() -> Self {
        Self {
            entries: DashMap::new(),
        }
    }

    pub async fn list_by_domain(&self, domain: &str) -> BrainResult<Vec<KnowledgeEntry>> {
        Ok(self
            .entries
            .iter()
            .filter(|e| e.value().domain == domain)
            .map(|e| e.value().clone())
            .collect())
    }
}

impl Default for KnowledgeRegistryImpl {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Registry<KnowledgeEntry> for KnowledgeRegistryImpl {
    #[instrument(skip(self, item))]
    async fn register(&self, item: KnowledgeEntry) -> Result<(), BrainError> {
        self.entries.insert(item.id.clone(), item);
        Ok(())
    }
    #[instrument(skip(self))]
    async fn unregister(&self, id: &str) -> Result<(), BrainError> {
        self.entries.remove(id);
        Ok(())
    }
    async fn get(&self, id: &str) -> Result<Option<KnowledgeEntry>, BrainError> {
        Ok(self.entries.get(id).map(|e| e.clone()))
    }
    async fn list(&self) -> Result<Vec<KnowledgeEntry>, BrainError> {
        Ok(self.entries.iter().map(|e| e.value().clone()).collect())
    }
    async fn exists(&self, id: &str) -> Result<bool, BrainError> {
        Ok(self.entries.contains_key(id))
    }
}

// ===========================================================================
// 4. Workflow Registry
// ===========================================================================

/// A workflow definition: ordered steps with a target module each.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowDefinition {
    pub id: String,
    pub name: String,
    pub version: String,
    pub steps: Vec<WorkflowStep>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowStep {
    pub step_id: String,
    pub capability: String,
    pub input: serde_json::Value,
}


pub struct WorkflowRegistryImpl {
    workflows: DashMap<String, WorkflowDefinition>,
}

impl WorkflowRegistryImpl {
    pub fn new() -> Self {
        Self {
            workflows: DashMap::new(),
        }
    }
}

impl Default for WorkflowRegistryImpl {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Registry<WorkflowDefinition> for WorkflowRegistryImpl {
    #[instrument(skip(self, item))]
    async fn register(&self, item: WorkflowDefinition) -> Result<(), BrainError> {
        self.workflows.insert(item.id.clone(), item);
        Ok(())
    }
    #[instrument(skip(self))]
    async fn unregister(&self, id: &str) -> Result<(), BrainError> {
        self.workflows.remove(id);
        Ok(())
    }
    async fn get(&self, id: &str) -> Result<Option<WorkflowDefinition>, BrainError> {
        Ok(self.workflows.get(id).map(|e| e.clone()))
    }
    async fn list(&self) -> Result<Vec<WorkflowDefinition>, BrainError> {
        Ok(self.workflows.iter().map(|e| e.value().clone()).collect())
    }
    async fn exists(&self, id: &str) -> Result<bool, BrainError> {
        Ok(self.workflows.contains_key(id))
    }
}

// ===========================================================================
// 5. Agent Registry
// ===========================================================================


pub struct AgentRegistryImpl {
    agents: DashMap<Uuid, AgentDescriptor>,
}

impl AgentRegistryImpl {
    pub fn new() -> Self {
        Self {
            agents: DashMap::new(),
        }
    }
}

impl Default for AgentRegistryImpl {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Registry<AgentDescriptor> for AgentRegistryImpl {
    #[instrument(skip(self, item))]
    async fn register(&self, item: AgentDescriptor) -> Result<(), BrainError> {
        self.agents.insert(item.id, item);
        Ok(())
    }
    #[instrument(skip(self))]
    async fn unregister(&self, id: &str) -> Result<(), BrainError> {
        if let Ok(uuid) = Uuid::parse_str(id) {
            self.agents.remove(&uuid);
        }
        Ok(())
    }
    async fn get(&self, id: &str) -> Result<Option<AgentDescriptor>, BrainError> {
        if let Ok(uuid) = Uuid::parse_str(id) {
            return Ok(self.agents.get(&uuid).map(|e| e.clone()));
        }
        Ok(None)
    }
    async fn list(&self) -> Result<Vec<AgentDescriptor>, BrainError> {
        Ok(self.agents.iter().map(|e| e.value().clone()).collect())
    }
    async fn exists(&self, id: &str) -> Result<bool, BrainError> {
        if let Ok(uuid) = Uuid::parse_str(id) {
            return Ok(self.agents.contains_key(&uuid));
        }
        Ok(false)
    }
}

// ===========================================================================
// 6. Tool Registry
// ===========================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    pub id: String,
    pub name: String,
    pub version: String,
    pub schema: serde_json::Value,
    pub handler_module: String,
}


pub struct ToolRegistryImpl {
    tools: DashMap<String, ToolDefinition>,
}

impl ToolRegistryImpl {
    pub fn new() -> Self {
        Self {
            tools: DashMap::new(),
        }
    }
}

impl Default for ToolRegistryImpl {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Registry<ToolDefinition> for ToolRegistryImpl {
    #[instrument(skip(self, item))]
    async fn register(&self, item: ToolDefinition) -> Result<(), BrainError> {
        self.tools.insert(item.id.clone(), item);
        Ok(())
    }
    #[instrument(skip(self))]
    async fn unregister(&self, id: &str) -> Result<(), BrainError> {
        self.tools.remove(id);
        Ok(())
    }
    async fn get(&self, id: &str) -> Result<Option<ToolDefinition>, BrainError> {
        Ok(self.tools.get(id).map(|e| e.clone()))
    }
    async fn list(&self) -> Result<Vec<ToolDefinition>, BrainError> {
        Ok(self.tools.iter().map(|e| e.value().clone()).collect())
    }
    async fn exists(&self, id: &str) -> Result<bool, BrainError> {
        Ok(self.tools.contains_key(id))
    }
}

// ===========================================================================
// 7. Vector Registry
// ===========================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VectorEntry {
    pub id: String,
    pub embedding: Vec<f32>,
    pub metadata: HashMap<String, String>,
}


pub struct VectorRegistryImpl {
    vectors: DashMap<String, VectorEntry>,
    search_counter: AtomicU64,
}

impl VectorRegistryImpl {
    pub fn new() -> Self {
        Self {
            vectors: DashMap::new(),
            search_counter: AtomicU64::new(0),
        }
    }

    /// Cosine-similarity search for the top-k nearest neighbours of `query`.
    pub async fn search(
        &self,
        query: &[f32],
        top_k: usize,
    ) -> BrainResult<Vec<(String, f64)>> {
        self.search_counter.fetch_add(1, Ordering::Relaxed);
        if query.is_empty() {
            return Ok(Vec::new());
        }
        let mut scored: Vec<(String, f64)> = self
            .vectors
            .iter()
            .map(|e| (e.key().clone(), cosine(&e.value().embedding, query)))
            .collect();
        // partial sort by score desc
        let k = top_k.min(scored.len());
        scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        scored.truncate(k);
        Ok(scored)
    }
}

fn cosine(a: &[f32], b: &[f32]) -> f64 {
    let n = a.len().min(b.len());
    let mut dot = 0.0f64;
    let mut na = 0.0f64;
    let mut nb = 0.0f64;
    for i in 0..n {
        let av = a[i] as f64;
        let bv = b[i] as f64;
        dot += av * bv;
        na += av * av;
        nb += bv * bv;
    }
    if na == 0.0 || nb == 0.0 {
        return 0.0;
    }
    dot / (na.sqrt() * nb.sqrt())
}

impl Default for VectorRegistryImpl {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Registry<VectorEntry> for VectorRegistryImpl {
    #[instrument(skip(self, item))]
    async fn register(&self, item: VectorEntry) -> Result<(), BrainError> {
        self.vectors.insert(item.id.clone(), item);
        Ok(())
    }
    #[instrument(skip(self))]
    async fn unregister(&self, id: &str) -> Result<(), BrainError> {
        self.vectors.remove(id);
        Ok(())
    }
    async fn get(&self, id: &str) -> Result<Option<VectorEntry>, BrainError> {
        Ok(self.vectors.get(id).map(|e| e.clone()))
    }
    async fn list(&self) -> Result<Vec<VectorEntry>, BrainError> {
        Ok(self.vectors.iter().map(|e| e.value().clone()).collect())
    }
    async fn exists(&self, id: &str) -> Result<bool, BrainError> {
        Ok(self.vectors.contains_key(id))
    }
}

// ===========================================================================
// 8. State Registry (key → value with TTL)
// ===========================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StateEntry {
    pub key: String,
    pub value: serde_json::Value,
    pub expires_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}


pub struct StateRegistryImpl {
    state: DashMap<String, StateEntry>,
}

impl StateRegistryImpl {
    pub fn new() -> Self {
        Self {
            state: DashMap::new(),
        }
    }

    /// Returns the value for `key` if it exists and has not expired.
    pub async fn get_value(&self, key: &str) -> BrainResult<Option<serde_json::Value>> {
        let now = Utc::now();
        if let Some(e) = self.state.get(key) {
            if let Some(exp) = e.value().expires_at {
                if exp < now {
                    return Ok(None);
                }
            }
            return Ok(Some(e.value().value.clone()));
        }
        Ok(None)
    }

    /// Purge all expired entries. Returns the number of entries purged.
    pub async fn purge_expired(&self) -> BrainResult<usize> {
        let now = Utc::now();
        let mut n = 0;
        let expired: Vec<String> = self
            .state
            .iter()
            .filter_map(|e| {
                e.value()
                    .expires_at
                    .filter(|&exp| exp < now)
                    .map(|_| e.key().clone())
            })
            .collect();
        for k in expired {
            if self.state.remove(&k).is_some() {
                n += 1;
            }
        }
        Ok(n)
    }
}

impl Default for StateRegistryImpl {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Registry<StateEntry> for StateRegistryImpl {
    #[instrument(skip(self, item))]
    async fn register(&self, item: StateEntry) -> Result<(), BrainError> {
        self.state.insert(item.key.clone(), item);
        Ok(())
    }
    #[instrument(skip(self))]
    async fn unregister(&self, id: &str) -> Result<(), BrainError> {
        self.state.remove(id);
        Ok(())
    }
    async fn get(&self, id: &str) -> Result<Option<StateEntry>, BrainError> {
        Ok(self.state.get(id).map(|e| e.clone()))
    }
    async fn list(&self) -> Result<Vec<StateEntry>, BrainError> {
        Ok(self.state.iter().map(|e| e.value().clone()).collect())
    }
    async fn exists(&self, id: &str) -> Result<bool, BrainError> {
        Ok(self.state.contains_key(id))
    }
}

// ===========================================================================
// 9. Context Registry (session → context)
// ===========================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextWindow {
    pub session_id: Uuid,
    pub tokens_used: usize,
    pub max_tokens: usize,
    pub messages: Vec<ContextMessage>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextMessage {
    pub role: String,
    pub content: String,
}


pub struct ContextRegistryImpl {
    contexts: DashMap<Uuid, ContextWindow>,
}

impl ContextRegistryImpl {
    pub fn new() -> Self {
        Self {
            contexts: DashMap::new(),
        }
    }

    pub async fn append_message(
        &self,
        session_id: Uuid,
        msg: ContextMessage,
    ) -> BrainResult<()> {
        let mut entry = self
            .contexts
            .entry(session_id)
            .or_insert_with(|| ContextWindow {
                session_id,
                tokens_used: 0,
                max_tokens: 8192,
                messages: Vec::new(),
                created_at: Utc::now(),
                updated_at: Utc::now(),
            });
        entry.messages.push(msg);
        entry.updated_at = Utc::now();
        Ok(())
    }
}

impl Default for ContextRegistryImpl {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Registry<ContextWindow> for ContextRegistryImpl {
    #[instrument(skip(self, item))]
    async fn register(&self, item: ContextWindow) -> Result<(), BrainError> {
        self.contexts.insert(item.session_id, item);
        Ok(())
    }
    #[instrument(skip(self))]
    async fn unregister(&self, id: &str) -> Result<(), BrainError> {
        if let Ok(uuid) = Uuid::parse_str(id) {
            self.contexts.remove(&uuid);
        }
        Ok(())
    }
    async fn get(&self, id: &str) -> Result<Option<ContextWindow>, BrainError> {
        if let Ok(uuid) = Uuid::parse_str(id) {
            return Ok(self.contexts.get(&uuid).map(|e| e.clone()));
        }
        Ok(None)
    }
    async fn list(&self) -> Result<Vec<ContextWindow>, BrainError> {
        Ok(self.contexts.iter().map(|e| e.value().clone()).collect())
    }
    async fn exists(&self, id: &str) -> Result<bool, BrainError> {
        if let Ok(uuid) = Uuid::parse_str(id) {
            return Ok(self.contexts.contains_key(&uuid));
        }
        Ok(false)
    }
}

// ===========================================================================
// 10. Learning Registry
// ===========================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LearningRecord {
    pub id: String,
    pub decision_id: String,
    pub actual_outcome: String,
    pub expected_outcome: String,
    pub feedback_source: String,
    pub deviation_score: Option<f64>,
    pub created_at: DateTime<Utc>,
    pub metadata: HashMap<String, String>,
}


pub struct LearningRegistryImpl {
    records: DashMap<String, LearningRecord>,
}

impl LearningRegistryImpl {
    pub fn new() -> Self {
        Self {
            records: DashMap::new(),
        }
    }

    pub async fn list_by_decision(
        &self,
        decision_id: &str,
    ) -> BrainResult<Vec<LearningRecord>> {
        Ok(self
            .records
            .iter()
            .filter(|e| e.value().decision_id == decision_id)
            .map(|e| e.value().clone())
            .collect())
    }
}

impl Default for LearningRegistryImpl {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Registry<LearningRecord> for LearningRegistryImpl {
    #[instrument(skip(self, item))]
    async fn register(&self, item: LearningRecord) -> Result<(), BrainError> {
        self.records.insert(item.id.clone(), item);
        Ok(())
    }
    #[instrument(skip(self))]
    async fn unregister(&self, id: &str) -> Result<(), BrainError> {
        self.records.remove(id);
        Ok(())
    }
    async fn get(&self, id: &str) -> Result<Option<LearningRecord>, BrainError> {
        Ok(self.records.get(id).map(|e| e.clone()))
    }
    async fn list(&self) -> Result<Vec<LearningRecord>, BrainError> {
        Ok(self.records.iter().map(|e| e.value().clone()).collect())
    }
    async fn exists(&self, id: &str) -> Result<bool, BrainError> {
        Ok(self.records.contains_key(id))
    }
}

// ===========================================================================
// 11. Execution Registry (task → outcome)
// ===========================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionRecord {
    pub id: String,
    pub task_id: Uuid,
    pub outcome: ExecutionOutcome,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub error: Option<String>,
    pub metadata: HashMap<String, String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ExecutionOutcome {
    Success,
    Failure,
    Timeout,
    Cancelled,
}


pub struct ExecutionRegistryImpl {
    records: DashMap<String, ExecutionRecord>,
}

impl ExecutionRegistryImpl {
    pub fn new() -> Self {
        Self {
            records: DashMap::new(),
        }
    }

    pub async fn list_by_task(&self, task_id: Uuid) -> BrainResult<Vec<ExecutionRecord>> {
        Ok(self
            .records
            .iter()
            .filter(|e| e.value().task_id == task_id)
            .map(|e| e.value().clone())
            .collect())
    }
}

impl Default for ExecutionRegistryImpl {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Registry<ExecutionRecord> for ExecutionRegistryImpl {
    #[instrument(skip(self, item))]
    async fn register(&self, item: ExecutionRecord) -> Result<(), BrainError> {
        self.records.insert(item.id.clone(), item);
        Ok(())
    }
    #[instrument(skip(self))]
    async fn unregister(&self, id: &str) -> Result<(), BrainError> {
        self.records.remove(id);
        Ok(())
    }
    async fn get(&self, id: &str) -> Result<Option<ExecutionRecord>, BrainError> {
        Ok(self.records.get(id).map(|e| e.clone()))
    }
    async fn list(&self) -> Result<Vec<ExecutionRecord>, BrainError> {
        Ok(self.records.iter().map(|e| e.value().clone()).collect())
    }
    async fn exists(&self, id: &str) -> Result<bool, BrainError> {
        Ok(self.records.contains_key(id))
    }
}

// ===========================================================================
// 12. Policy Registry
// ===========================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyRule {
    pub id: String,
    pub name: String,
    pub action: String,
    pub effect: PolicyEffect,
    pub conditions: Vec<serde_json::Value>,
    pub priority: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PolicyEffect {
    Allow,
    Deny,
}


pub struct PolicyRegistryImpl {
    rules: DashMap<String, PolicyRule>,
}

impl PolicyRegistryImpl {
    pub fn new() -> Self {
        Self {
            rules: DashMap::new(),
        }
    }

    /// Returns rules matching `action`, sorted by descending priority.
    pub async fn rules_for_action(&self, action: &str) -> BrainResult<Vec<PolicyRule>> {
        let mut out: Vec<PolicyRule> = self
            .rules
            .iter()
            .filter(|e| e.value().action == action)
            .map(|e| e.value().clone())
            .collect();
        out.sort_by(|a, b| b.priority.cmp(&a.priority));
        Ok(out)
    }
}

impl Default for PolicyRegistryImpl {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Registry<PolicyRule> for PolicyRegistryImpl {
    #[instrument(skip(self, item))]
    async fn register(&self, item: PolicyRule) -> Result<(), BrainError> {
        self.rules.insert(item.id.clone(), item);
        Ok(())
    }
    #[instrument(skip(self))]
    async fn unregister(&self, id: &str) -> Result<(), BrainError> {
        self.rules.remove(id);
        Ok(())
    }
    async fn get(&self, id: &str) -> Result<Option<PolicyRule>, BrainError> {
        Ok(self.rules.get(id).map(|e| e.clone()))
    }
    async fn list(&self) -> Result<Vec<PolicyRule>, BrainError> {
        Ok(self.rules.iter().map(|e| e.value().clone()).collect())
    }
    async fn exists(&self, id: &str) -> Result<bool, BrainError> {
        Ok(self.rules.contains_key(id))
    }
}

// ===========================================================================
// Convenience: build a ModelVersion
// ===========================================================================

/// Helper to build a [`ModelVersion`] with sane defaults.
pub fn new_model_version(
    id: impl Into<String>,
    model_name: impl Into<String>,
    version: impl Into<String>,
    stage: ModelStage,
    accuracy: f64,
    sample_size: usize,
) -> ModelVersion {
    ModelVersion {
        id: id.into(),
        model_name: model_name.into(),
        version: version.into(),
        stage,
        deployed_at: if stage == ModelStage::Production {
            Some(Utc::now())
        } else {
            None
        },
        metrics: ModelMetrics {
            accuracy,
            latency_ms: 0.0,
            cost_per_inference: 0.0,
            sample_size,
        },
        validation_status: ValidationStatus::Pending,
    }
}

// ===========================================================================
// Tests
// ===========================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn capability_registry_round_trip() {
        let r = CapabilityRegistryImpl::new();
        r.register_capability("cap.a", "mod-1").await.unwrap();
        assert_eq!(r.resolve("cap.a").await.unwrap().as_deref(), Some("mod-1"));
        assert_eq!(r.list_by_module("mod-1").await.unwrap(), vec!["cap.a"]);
    }

    #[tokio::test]
    async fn model_registry_promote_and_evaluate() {
        let r = ModelRegistryImpl::new();
        let prod = new_model_version("m1", "glm", "1.0", ModelStage::Production, 0.80, 100);
        let cand = new_model_version("m2", "glm", "1.1", ModelStage::Candidate, 0.95, 100);
        r.register_version(prod).await.unwrap();
        r.register_version(cand.clone()).await.unwrap();

        let eval = r.evaluate_promotion("m2", 10, 0.05).await.unwrap();
        assert!(eval.should_promote);
        r.promote("m2", ModelStage::Production).await.unwrap();
        assert!(r.get_production().await.unwrap().is_some());
    }

    #[tokio::test]
    async fn vector_search_cosine() {
        let r = VectorRegistryImpl::new();
        r.register(VectorEntry {
            id: "v1".into(),
            embedding: vec![1.0, 0.0, 0.0],
            metadata: HashMap::new(),
        })
        .await
        .unwrap();
        r.register(VectorEntry {
            id: "v2".into(),
            embedding: vec![0.0, 1.0, 0.0],
            metadata: HashMap::new(),
        })
        .await
        .unwrap();
        let res = r.search(&[1.0, 0.0, 0.0], 1).await.unwrap();
        assert_eq!(res.len(), 1);
        assert_eq!(res[0].0, "v1");
    }

    #[tokio::test]
    async fn state_registry_ttl_expiry() {
        let r = StateRegistryImpl::new();
        r.register(StateEntry {
            key: "k".into(),
            value: serde_json::json!(42),
            expires_at: Some(Utc::now() - chrono::Duration::seconds(1)),
            created_at: Utc::now() - chrono::Duration::seconds(2),
        })
        .await
        .unwrap();
        assert!(r.get_value("k").await.unwrap().is_none());
    }

    #[tokio::test]
    async fn policy_priority_sort() {
        let r = PolicyRegistryImpl::new();
        r.register(PolicyRule {
            id: "p1".into(),
            name: "low".into(),
            action: "act".into(),
            effect: PolicyEffect::Allow,
            conditions: vec![],
            priority: 1,
        })
        .await
        .unwrap();
        r.register(PolicyRule {
            id: "p2".into(),
            name: "high".into(),
            action: "act".into(),
            effect: PolicyEffect::Deny,
            conditions: vec![],
            priority: 10,
        })
        .await
        .unwrap();
        let rules = r.rules_for_action("act").await.unwrap();
        assert_eq!(rules[0].id, "p2");
    }
}
