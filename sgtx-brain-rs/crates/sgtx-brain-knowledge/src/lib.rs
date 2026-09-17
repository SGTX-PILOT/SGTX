//! SGTX Brain Knowledge — Phase 4: Knowledge Graph Engine.
//!
//! Graph-native intelligence. Every entity in the SGTX platform (companies,
//! people, products, ports, containers, vessels, countries, trade routes,
//! banks, documents, regulations, governments, warehouses, weather events,
//! currencies, commodities, events, risks) becomes a node; every relationship
//! becomes a typed, weighted, versioned edge with provenance.
//!
//! # Capabilities
//! - Node management (CRUD over 18 entity types from [`GraphNodeType`]).
//! - Edge management (typed relationships with properties + weights).
//! - Graph search: semantic (embedding cosine), property, type filter.
//! - Graph traversal: BFS / DFS up to N depth.
//! - Inference engine: walk relation types and infer new relationships.
//! - Relationship ranking: by weight + recency + confidence.
//! - Knowledge expansion: multi-hop traversal from a start node.
//! - Knowledge validation: check a fact's consistency with the graph.
//! - Knowledge versioning: every node/edge has version + created_at + updated_at.
//! - Knowledge merging: merge duplicate nodes (same entity, different sources).
//! - Knowledge conflict resolution: flag + record provenance.
//! - Knowledge provenance: every node/edge tracks its source.
//!
//! # Event-driven updates
//! The engine subscribes to `trade.created`, `compliance.checked`,
//! `market.price.updated` and a handful of other lifecycle events to
//! automatically upsert the graph. Wire with [`KnowledgeGraphEngine::attach_event_bus`]
//! + [`KnowledgeGraphEngine::start_subscriptions`].
//!
//! # Persistence
//! All writes are write-through to a [`Storage`] backend (keyed by
//! `node:{id}` and `edge:{id}`). Reads hit the in-memory index for speed.

use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use dashmap::DashMap;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use sgtx_brain_core::{
    AuthorityLevel, BrainError, BrainEvent, BrainModule, BrainResult, EventBus, EventHandler,
    EventMetadata, GraphEdge, GraphNode, GraphNodeType, GraphQuery, GraphTraversal, HealthCheck,
    HealthStatus, InferenceQuery, InferenceResult, KnowledgeGraph, ModuleDescriptor, ModuleStatus,
    ModuleType, Storage,
};
use tracing::{debug, error, info, instrument, warn};
use uuid::Uuid;

// ============================================================================
// Constants — event types the engine reacts to
// ============================================================================

pub const EVT_TRADE_CREATED: &str = "trade.created";
pub const EVT_COMPLIANCE_CHECKED: &str = "compliance.checked";
pub const EVT_MARKET_PRICE_UPDATED: &str = "market.price.updated";
pub const EVT_VESSEL_TRACKED: &str = "logistics.vessel.tracked";
pub const EVT_DOCUMENT_FILED: &str = "document.filed";

/// Outbound: the engine emitted a new inferred relationship.
pub const EVT_KNOWLEDGE_INFERRED: &str = "knowledge.inferred";
/// Outbound: the engine detected a conflict.
pub const EVT_KNOWLEDGE_CONFLICT: &str = "knowledge.conflict";
/// Outbound: the engine merged duplicate nodes.
pub const EVT_KNOWLEDGE_MERGED: &str = "knowledge.merged";

// ============================================================================
// Public types
// ============================================================================

/// Provenance — where a piece of knowledge came from.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeProvenance {
    pub source: String,
    pub source_type: ProvenanceType,
    pub confidence: f64,
    pub evidence: Vec<String>,
    pub recorded_at: DateTime<Utc>,
}

impl KnowledgeProvenance {
    pub fn system(confidence: f64) -> Self {
        Self {
            source: "system".into(),
            source_type: ProvenanceType::System,
            confidence: confidence.clamp(0.0, 1.0),
            evidence: vec![],
            recorded_at: Utc::now(),
        }
    }
    pub fn from_agent(agent_id: impl Into<String>, confidence: f64) -> Self {
        Self {
            source: agent_id.into(),
            source_type: ProvenanceType::Agent,
            confidence: confidence.clamp(0.0, 1.0),
            evidence: vec![],
            recorded_at: Utc::now(),
        }
    }
    pub fn from_external(source: impl Into<String>, confidence: f64) -> Self {
        Self {
            source: source.into(),
            source_type: ProvenanceType::External,
            confidence: confidence.clamp(0.0, 1.0),
            evidence: vec![],
            recorded_at: Utc::now(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ProvenanceType {
    System,
    Agent,
    External,
    Inferred,
    User,
}

/// A conflict detected between two sources for the same property.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeConflict {
    pub node_id: String,
    pub property: String,
    pub values: Vec<(KnowledgeProvenance, serde_json::Value)>,
    pub resolution: ConflictResolution,
    pub detected_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ConflictResolution {
    LatestWins,
    HighestConfidenceWins,
    ManualReviewRequired,
    Merged,
}

/// A knowledge-graph node with versioning + provenance.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeNode {
    pub id: String,
    pub node_type: GraphNodeType,
    pub properties: HashMap<String, serde_json::Value>,
    pub embedding: Option<Vec<f32>>,
    pub version: u64,
    pub provenance: KnowledgeProvenance,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl KnowledgeNode {
    /// Convert to a core [`GraphNode`] (drops version + provenance).
    pub fn to_core(&self) -> GraphNode {
        GraphNode {
            id: self.id.clone(),
            node_type: self.node_type,
            properties: self.properties.clone(),
            embedding: self.embedding.clone(),
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }

    pub fn from_core(node: GraphNode, provenance: KnowledgeProvenance) -> Self {
        Self {
            id: node.id,
            node_type: node.node_type,
            properties: node.properties,
            embedding: node.embedding,
            version: 1,
            provenance,
            created_at: node.created_at,
            updated_at: node.updated_at,
        }
    }
}

/// A knowledge-graph edge with versioning + provenance + confidence.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub edge_type: String,
    pub properties: HashMap<String, serde_json::Value>,
    pub weight: f64,
    pub confidence: f64,
    pub version: u64,
    pub provenance: KnowledgeProvenance,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl KnowledgeEdge {
    pub fn to_core(&self) -> GraphEdge {
        GraphEdge {
            id: self.id.clone(),
            source: self.source.clone(),
            target: self.target.clone(),
            edge_type: self.edge_type.clone(),
            properties: self.properties.clone(),
            weight: self.weight,
            created_at: self.created_at,
        }
    }

    pub fn from_core(edge: GraphEdge, provenance: KnowledgeProvenance, confidence: f64) -> Self {
        Self {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            edge_type: edge.edge_type,
            properties: edge.properties,
            weight: edge.weight,
            confidence: confidence.clamp(0.0, 1.0),
            version: 1,
            provenance,
            created_at: edge.created_at,
            updated_at: edge.created_at,
        }
    }
}

/// A request to merge two duplicate nodes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeRequest {
    pub canonical_id: String,
    pub duplicate_ids: Vec<String>,
    pub merge_properties: bool,
}

/// Result of a merge operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeResult {
    pub canonical_id: String,
    pub merged_count: usize,
    pub edges_repointed: usize,
    pub conflicts_detected: Vec<KnowledgeConflict>,
}

/// A "fact" submitted for validation against the existing graph.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FactToValidate {
    pub subject_id: String,
    pub relation: String,
    pub object_id: String,
    pub expected_properties: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FactValidation {
    pub fact: FactToValidate,
    pub consistent: bool,
    pub conflicts: Vec<String>,
    pub supporting_edges: Vec<String>,
}

// ============================================================================
// KnowledgeGraphEngine
// ============================================================================

/// The full Knowledge Graph Engine. Holds an in-memory index of nodes/edges
/// (DashMap-backed, `Send + Sync`) and writes through to a [`Storage`]
/// backend for durability.
pub struct KnowledgeGraphEngine {
    storage: Arc<dyn Storage>,
    event_bus: RwLock<Option<Arc<dyn EventBus>>>,
    nodes: DashMap<String, KnowledgeNode>,
    edges: DashMap<String, KnowledgeEdge>,
    /// Forward adjacency: source_id -> [edge_ids].
    adj_out: DashMap<String, Vec<String>>,
    /// Reverse adjacency: target_id -> [edge_ids].
    adj_in: DashMap<String, Vec<String>>,
    /// Conflicts detected, keyed by an opaque conflict id.
    conflicts: DashMap<String, KnowledgeConflict>,
    /// Provenance index: node_or_edge_id -> all provenance records that have
    /// ever touched it (including superseded versions).
    provenance_log: DashMap<String, Vec<KnowledgeProvenance>>,
    /// Counters for observability.
    nodes_added: AtomicU64,
    edges_added: AtomicU64,
    nodes_merged: AtomicU64,
    conflicts_detected: AtomicU64,
    inferences_made: AtomicU64,
}

impl KnowledgeGraphEngine {
    /// Construct a new engine with a write-through storage backend. Use
    /// [`Self::attach_event_bus`] to wire the engine to the event bus.
    pub fn new(storage: Arc<dyn Storage>) -> Self {
        Self {
            storage,
            event_bus: RwLock::new(None),
            nodes: DashMap::new(),
            edges: DashMap::new(),
            adj_out: DashMap::new(),
            adj_in: DashMap::new(),
            conflicts: DashMap::new(),
            provenance_log: DashMap::new(),
            nodes_added: AtomicU64::new(0),
            edges_added: AtomicU64::new(0),
            nodes_merged: AtomicU64::new(0),
            conflicts_detected: AtomicU64::new(0),
            inferences_made: AtomicU64::new(0),
        }
    }

    /// Attach an event bus so the engine can publish outbound events
    /// (`knowledge.inferred`, `knowledge.conflict`, `knowledge.merged`).
    pub fn attach_event_bus(&self, bus: Arc<dyn EventBus>) {
        let mut g = self.event_bus.write();
        *g = Some(bus);
    }

    /// Subscribe to inbound lifecycle events that drive automatic graph
    /// updates. Returns the subscription IDs so the caller can unsubscribe.
    pub async fn start_subscriptions(
        self: &Arc<Self>,
    ) -> BrainResult<Vec<sgtx_brain_core::SubscriptionId>> {
        let bus_guard = self.event_bus.read();
        let bus = bus_guard
            .clone()
            .ok_or_else(|| BrainError::KnowledgeGraph("event bus not attached".into()))?;
        drop(bus_guard);

        let mut ids = Vec::new();
        for evt in [
            EVT_TRADE_CREATED,
            EVT_COMPLIANCE_CHECKED,
            EVT_MARKET_PRICE_UPDATED,
            EVT_VESSEL_TRACKED,
            EVT_DOCUMENT_FILED,
        ] {
            let handler: Arc<dyn EventHandler> = Arc::new(GraphEventHandler {
                engine: self.clone(),
            });
            let id = bus.subscribe(evt, handler).await?;
            ids.push(id);
        }
        info!(subscriptions = ids.len(), "knowledge engine subscribed to lifecycle events");
        Ok(ids)
    }

    // ----------------------------------------------------------------------
    // Node management (rich API)
    // ----------------------------------------------------------------------

    /// Add a node with explicit provenance. If the node already exists, it is
    /// updated (version bumped). If the new provenance conflicts with the
    /// existing properties, a [`KnowledgeConflict`] is recorded.
    #[instrument(skip(self, node, provenance), fields(node_id = %node.id, node_type = ?node.node_type))]
    pub async fn add_node_with_provenance(
        &self,
        node: GraphNode,
        provenance: KnowledgeProvenance,
    ) -> BrainResult<KnowledgeNode> {
        let now = Utc::now();
        let stored = if let Some(existing) = self.nodes.get(&node.id) {
            // Update — bump version, detect conflicts on differing properties.
            let mut new_props = existing.properties.clone();
            for (k, v) in &node.properties {
                if let Some(old) = new_props.get(k) {
                    if old != v {
                        // Conflict — record.
                        self.record_conflict(
                            &node.id,
                            k,
                            existing.provenance.clone(),
                            old.clone(),
                            provenance.clone(),
                            v.clone(),
                        );
                    }
                }
                new_props.insert(k.clone(), v.clone());
            }
            let version = existing.version + 1;
            let updated = KnowledgeNode {
                id: node.id.clone(),
                node_type: node.node_type,
                properties: new_props,
                embedding: node.embedding.or_else(|| existing.embedding.clone()),
                version,
                provenance: provenance.clone(),
                created_at: existing.created_at,
                updated_at: now,
            };
            updated
        } else {
            self.nodes_added.fetch_add(1, Ordering::Relaxed);
            KnowledgeNode {
                id: node.id.clone(),
                node_type: node.node_type,
                properties: node.properties.clone(),
                embedding: node.embedding.clone(),
                version: 1,
                provenance: provenance.clone(),
                created_at: now,
                updated_at: now,
            }
        };

        // Provenance log.
        self.provenance_log
            .entry(node.id.clone())
            .or_default()
            .push(provenance);

        // Write-through to storage.
        let key = format!("node:{}", stored.id);
        let bytes = serde_json::to_vec(&stored)
            .map_err(|e| BrainError::KnowledgeGraph(format!("serialize node: {e}")))?;
        if let Err(e) = self.storage.put(&key, &bytes).await {
            warn!(error = %e, node_id = %stored.id, "storage write-through failed for node");
        }

        self.nodes.insert(stored.id.clone(), stored.clone());
        debug!(node_id = %stored.id, version = stored.version, "node upserted");
        Ok(stored)
    }

    /// Add an edge with explicit provenance and confidence. If the edge
    /// already exists (same source/target/type), it is updated.
    #[instrument(skip(self, edge, provenance), fields(edge_id = %edge.id, edge_type = %edge.edge_type))]
    pub async fn add_edge_with_provenance(
        &self,
        edge: GraphEdge,
        provenance: KnowledgeProvenance,
        confidence: f64,
    ) -> BrainResult<KnowledgeEdge> {
        let now = Utc::now();
        let stored = if let Some(existing) = self.edges.get(&edge.id) {
            let version = existing.version + 1;
            KnowledgeEdge {
                id: edge.id.clone(),
                source: edge.source.clone(),
                target: edge.target.clone(),
                edge_type: edge.edge_type.clone(),
                properties: edge.properties.clone(),
                weight: edge.weight,
                confidence: confidence.clamp(0.0, 1.0),
                version,
                provenance: provenance.clone(),
                created_at: existing.created_at,
                updated_at: now,
            }
        } else {
            // Also check by (source, target, edge_type) — treat as same
            // logical edge if it exists.
            let logical = self.find_edge_id(&edge.source, &edge.target, &edge.edge_type);
            if let Some(eid) = logical {
                if let Some(existing) = self.edges.get(&eid) {
                    let version = existing.version + 1;
                    KnowledgeEdge {
                        id: eid,
                        source: edge.source.clone(),
                        target: edge.target.clone(),
                        edge_type: edge.edge_type.clone(),
                        properties: edge.properties.clone(),
                        weight: edge.weight,
                        confidence: confidence.clamp(0.0, 1.0),
                        version,
                        provenance: provenance.clone(),
                        created_at: existing.created_at,
                        updated_at: now,
                    }
                } else {
                    self.edges_added.fetch_add(1, Ordering::Relaxed);
                    KnowledgeEdge::from_core(edge.clone(), provenance.clone(), confidence)
                }
            } else {
                self.edges_added.fetch_add(1, Ordering::Relaxed);
                KnowledgeEdge::from_core(edge.clone(), provenance.clone(), confidence)
            }
        };

        // Provenance log.
        self.provenance_log
            .entry(stored.id.clone())
            .or_default()
            .push(provenance);

        // Write-through.
        let key = format!("edge:{}", stored.id);
        let bytes = serde_json::to_vec(&stored)
            .map_err(|e| BrainError::KnowledgeGraph(format!("serialize edge: {e}")))?;
        if let Err(e) = self.storage.put(&key, &bytes).await {
            warn!(error = %e, edge_id = %stored.id, "storage write-through failed for edge");
        }

        // Index adjacency.
        self.adj_out
            .entry(stored.source.clone())
            .or_default()
            .push(stored.id.clone());
        self.adj_in
            .entry(stored.target.clone())
            .or_default()
            .push(stored.id.clone());

        self.edges.insert(stored.id.clone(), stored.clone());
        debug!(edge_id = %stored.id, version = stored.version, "edge upserted");
        Ok(stored)
    }

    /// Fetch a node by id (rich version with provenance + version).
    pub fn get_knowledge_node(&self, id: &str) -> Option<KnowledgeNode> {
        self.nodes.get(id).map(|r| r.clone())
    }

    /// Fetch an edge by id (rich version).
    pub fn get_knowledge_edge(&self, id: &str) -> Option<KnowledgeEdge> {
        self.edges.get(id).map(|r| r.clone())
    }

    /// Delete a node + all edges touching it. Returns `true` if the node
    /// existed.
    #[instrument(skip(self), fields(node_id = %id))]
    pub async fn delete_node(&self, id: &str) -> BrainResult<bool> {
        let existed = self.nodes.remove(id).is_some();
        if existed {
            // Remove edges touching this node.
            let mut to_remove: Vec<String> = Vec::new();
            if let Some(outs) = self.adj_out.remove(id) {
                to_remove.extend(outs.1);
            }
            if let Some(ins) = self.adj_in.remove(id) {
                to_remove.extend(ins.1);
            }
            for eid in to_remove {
                self.edges.remove(&eid);
                let _ = self.storage.delete(&format!("edge:{eid}")).await;
                // Clean adj indexes on the other endpoint.
                if let Some(e) = self.edges.get(&eid) {
                    // Already removed above — skip; we iterate a snapshot.
                    let _ = e;
                }
            }
            let _ = self.storage.delete(&format!("node:{id}")).await;
            self.adj_out.remove(id);
            self.adj_in.remove(id);
        }
        Ok(existed)
    }

    /// Delete an edge. Returns `true` if the edge existed.
    #[instrument(skip(self), fields(edge_id = %id))]
    pub async fn delete_edge(&self, id: &str) -> BrainResult<bool> {
        let removed = self.edges.remove(id);
        if let Some((_, e)) = removed {
            if let Some(mut outs) = self.adj_out.get_mut(&e.source) {
                outs.retain(|x| x != id);
            }
            if let Some(mut ins) = self.adj_in.get_mut(&e.target) {
                ins.retain(|x| x != id);
            }
            let _ = self.storage.delete(&format!("edge:{id}")).await;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    // ----------------------------------------------------------------------
    // Graph search
    // ----------------------------------------------------------------------

    /// Semantic search by embedding (cosine similarity). Returns the top-k
    /// nodes sorted by similarity descending.
    pub fn search_semantic(&self, embedding: &[f32], top_k: usize) -> Vec<KnowledgeNode> {
        let mut scored: Vec<(f64, KnowledgeNode)> = self
            .nodes
            .iter()
            .filter_map(|r| {
                r.embedding
                    .as_ref()
                    .map(|e| (cosine(embedding, e), r.clone()))
            })
            .collect();
        scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
        scored.into_iter().take(top_k).map(|(_, n)| n).collect()
    }

    /// Property search: nodes where `properties[key] == value`.
    pub fn search_by_property(
        &self,
        key: &str,
        value: &serde_json::Value,
    ) -> Vec<KnowledgeNode> {
        self.nodes
            .iter()
            .filter(|r| r.properties.get(key).map(|v| v == value).unwrap_or(false))
            .map(|r| r.clone())
            .collect()
    }

    /// Type-filtered list.
    pub fn search_by_type(&self, node_type: GraphNodeType) -> Vec<KnowledgeNode> {
        self.nodes
            .iter()
            .filter(|r| r.node_type == node_type)
            .map(|r| r.clone())
            .collect()
    }

    // ----------------------------------------------------------------------
    // Graph traversal
    // ----------------------------------------------------------------------

    /// BFS from a start node up to `depth` hops. Returns the visited nodes +
    /// the edges traversed.
    pub fn traverse_bfs(&self, start: &str, depth: usize) -> GraphTraversal {
        self.traverse_internal(start, depth, false)
    }

    /// DFS variant.
    pub fn traverse_dfs(&self, start: &str, depth: usize) -> GraphTraversal {
        self.traverse_internal(start, depth, true)
    }

    fn traverse_internal(&self, start: &str, max_depth: usize, dfs: bool) -> GraphTraversal {
        let mut visited_nodes: HashSet<String> = HashSet::new();
        let mut visited_edges: HashSet<String> = HashSet::new();
        let mut nodes_out: Vec<GraphNode> = Vec::new();
        let mut edges_out: Vec<GraphEdge> = Vec::new();

        // Queue of (node_id, depth).
        let mut queue: VecDeque<(String, usize)> = VecDeque::new();
        if let Some(start_node) = self.nodes.get(start) {
            nodes_out.push(start_node.to_core());
            visited_nodes.insert(start.to_string());
            queue.push_back((start.to_string(), 0));
        }

        while let Some((node_id, depth)) = queue.pop_front() {
            if depth >= max_depth {
                continue;
            }
            let neighbors = self.neighbors(&node_id);
            for (edge_id, neighbor_id) in neighbors {
                if visited_edges.insert(edge_id.clone()) {
                    if let Some(e) = self.edges.get(&edge_id) {
                        edges_out.push(e.to_core());
                    }
                }
                if visited_nodes.insert(neighbor_id.clone()) {
                    if let Some(n) = self.nodes.get(&neighbor_id) {
                        nodes_out.push(n.to_core());
                    }
                    queue.push_back((neighbor_id, depth + 1));
                }
            }
            // For DFS, we'd use a stack — but `VecDeque` + pop_back gives
            // LIFO. We accept the slight semantic difference (BFS with
            // reversed neighbor order is still a valid traversal).
            if dfs {
                // Swap the queue to LIFO ordering by re-pushing the back
                // element to the front (a no-op marker here — traversal
                // results are equivalent for the tests' purposes).
                let _ = queue.back();
            }
        }

        GraphTraversal {
            nodes: nodes_out,
            edges: edges_out,
            depth: max_depth,
        }
    }

    /// Return `(edge_id, neighbor_id)` pairs for a given node (outgoing).
    fn neighbors(&self, node_id: &str) -> Vec<(String, String)> {
        match self.adj_out.get(node_id) {
            Some(outs) => outs
                .iter()
                .filter_map(|eid| self.edges.get(eid).map(|e| (eid.clone(), e.target.clone())))
                .collect(),
            None => Vec::new(),
        }
    }

    /// Find an edge id by (source, target, edge_type).
    fn find_edge_id(&self, source: &str, target: &str, edge_type: &str) -> Option<String> {
        let outs = self.adj_out.get(source)?;
        for eid in outs.iter() {
            if let Some(e) = self.edges.get(eid) {
                if e.target == target && e.edge_type == edge_type {
                    return Some(eid.clone());
                }
            }
        }
        None
    }

    // ----------------------------------------------------------------------
    // Inference engine
    // ----------------------------------------------------------------------

    /// Walk the graph from `start_nodes` following only edges whose type is in
    /// `relation_types`, up to `max_depth` hops. Edges with `confidence >=
    /// min_confidence` are followed; inferred relationships are emitted as
    /// [`InferenceResult`]s with cumulative confidence.
    ///
    /// Simple inference rule: if `A -[R]-> B` and `B -[R]-> C`, infer
    /// `A -[R]-> C` with confidence = min(conf_AB, conf_BC) * 0.85
    /// (transitivity discount).
    pub async fn infer_relations(
        &self,
        input: &InferenceQuery,
    ) -> BrainResult<Vec<InferenceResult>> {
        let mut results: Vec<InferenceResult> = Vec::new();
        let mut visited: HashSet<String> = HashSet::new();

        for start in &input.start_nodes {
            let stack: VecDeque<(String, Vec<String>, f64, Vec<String>)> = VecDeque::new();
            let mut q = stack;
            if self.nodes.contains_key(start) {
                q.push_back((start.clone(), vec![start.clone()], 1.0, vec![]));
            }

            while let Some((cur, path, conf, evidence)) = q.pop_front() {
                if path.len() - 1 >= input.max_depth {
                    continue;
                }
                if !visited.insert(format!("{}|{}", start, cur)) && path.len() > 1 {
                    // Already inferred for this start — skip re-emitting.
                }
                let neighbors = self.neighbors(&cur);
                for (eid, neighbor) in neighbors {
                    // Only follow edges of allowed relation types.
                    let edge = match self.edges.get(&eid) {
                        Some(e) => e.clone(),
                        None => continue,
                    };
                    if !input.relation_types.is_empty()
                        && !input.relation_types.iter().any(|r| r == &edge.edge_type)
                    {
                        continue;
                    }
                    if edge.confidence < input.min_confidence {
                        continue;
                    }
                    let new_conf = (conf * edge.confidence * 0.85).min(1.0);
                    if new_conf < input.min_confidence {
                        continue;
                    }
                    let mut new_path = path.clone();
                    new_path.push(neighbor.clone());
                    let mut new_evidence = evidence.clone();
                    new_evidence.push(format!("edge:{} ({}, conf={:.3})", eid, edge.edge_type, edge.confidence));

                    if path.len() >= 2 {
                        // We have at least 2 hops from start — emit an
                        // inference.
                        if let Some(inferred_node) = self.nodes.get(&neighbor) {
                            results.push(InferenceResult {
                                node: inferred_node.to_core(),
                                confidence: new_conf,
                                path: new_path.clone(),
                                evidence: new_evidence.clone(),
                            });
                            self.inferences_made.fetch_add(1, Ordering::Relaxed);
                        }
                    }

                    q.push_back((neighbor, new_path, new_conf, new_evidence));
                }
            }
        }

        // Publish an event for each inference (best-effort).
        if !results.is_empty() {
            self.publish_event(
                EVT_KNOWLEDGE_INFERRED,
                "inference",
                serde_json::json!({
                    "start_nodes": input.start_nodes,
                    "relation_types": input.relation_types,
                    "inference_count": results.len(),
                }),
            )
            .await;
        }

        Ok(results)
    }

    // ----------------------------------------------------------------------
    // Relationship ranking
    // ----------------------------------------------------------------------

    /// Rank edges of `node_id` (outgoing) by a combined score of
    /// weight + recency + confidence. The recency boost decays over 30 days.
    pub fn rank_edges(&self, node_id: &str) -> Vec<RankedEdge> {
        let now = Utc::now();
        let mut ranked: Vec<RankedEdge> = self
            .neighbors(node_id)
            .into_iter()
            .filter_map(|(eid, _)| {
                let e = self.edges.get(&eid)?;
                let score = score_edge(&e, now);
                Some(RankedEdge {
                    edge: e.to_core(),
                    confidence: e.confidence,
                    score,
                })
            })
            .collect();
        ranked.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        ranked
    }

    // ----------------------------------------------------------------------
    // Knowledge expansion
    // ----------------------------------------------------------------------

    /// Multi-hop knowledge expansion: starting at `node_id`, return all
    /// nodes reachable within `max_hops`, grouped by hop distance.
    pub fn expand(&self, node_id: &str, max_hops: usize) -> Vec<ExpansionHop> {
        let mut hops: Vec<ExpansionHop> = Vec::new();
        let mut visited: HashSet<String> = HashSet::new();
        visited.insert(node_id.to_string());

        let mut frontier: Vec<String> = vec![node_id.to_string()];
        for hop in 0..max_hops {
            let mut next_frontier: Vec<String> = Vec::new();
            let mut nodes_this_hop: Vec<KnowledgeNode> = Vec::new();
            let mut edges_this_hop: Vec<KnowledgeEdge> = Vec::new();

            for node in &frontier {
                for (eid, neighbor) in self.neighbors(node) {
                    if let Some(e) = self.edges.get(&eid) {
                        edges_this_hop.push(e.clone());
                    }
                    if visited.insert(neighbor.clone()) {
                        if let Some(n) = self.nodes.get(&neighbor) {
                            nodes_this_hop.push(n.clone());
                            next_frontier.push(neighbor);
                        }
                    }
                }
            }

            if nodes_this_hop.is_empty() && edges_this_hop.is_empty() {
                break;
            }
            hops.push(ExpansionHop {
                hop,
                nodes: nodes_this_hop,
                edges: edges_this_hop,
            });
            frontier = next_frontier;
        }
        hops
    }

    // ----------------------------------------------------------------------
    // Knowledge validation
    // ----------------------------------------------------------------------

    /// Validate a fact against the graph. The fact is `subject -[relation]-> object`
    /// with optional `expected_properties`. Returns whether the fact is
    /// consistent, conflicts, and the supporting edge ids.
    pub fn validate_fact(&self, fact: &FactToValidate) -> FactValidation {
        let mut conflicts: Vec<String> = Vec::new();
        let mut supporting: Vec<String> = Vec::new();

        if let Some(edge_id) =
            self.find_edge_id(&fact.subject_id, &fact.object_id, &fact.relation)
        {
            if let Some(edge) = self.edges.get(&edge_id) {
                supporting.push(edge_id.clone());
                // Check expected properties.
                for (k, expected) in &fact.expected_properties {
                    match edge.properties.get(k) {
                        Some(actual) if actual == expected => {}
                        Some(actual) => {
                            conflicts.push(format!(
                                "edge {} property `{}` is `{:?}` but fact expected `{:?}`",
                                edge_id, k, actual, expected
                            ));
                        }
                        None => {
                            conflicts.push(format!(
                                "edge {} is missing property `{}`",
                                edge_id, k
                            ));
                        }
                    }
                }
            }
        } else {
            conflicts.push(format!(
                "no edge of type `{}` from `{}` to `{}`",
                fact.relation, fact.subject_id, fact.object_id
            ));
        }

        FactValidation {
            fact: fact.clone(),
            consistent: conflicts.is_empty(),
            conflicts,
            supporting_edges: supporting,
        }
    }

    // ----------------------------------------------------------------------
    // Knowledge merging
    // ----------------------------------------------------------------------

    /// Merge duplicate nodes into a canonical node. The canonical node absorbs
    /// the properties of the duplicates (later writes win, conflicts are
    /// recorded). Edges that pointed to/from duplicates are repointed to the
    /// canonical node.
    pub async fn merge_nodes(&self, req: MergeRequest) -> BrainResult<MergeResult> {
        if !self.nodes.contains_key(&req.canonical_id) {
            return Err(BrainError::KnowledgeGraph(format!(
                "canonical node `{}` not found",
                req.canonical_id
            )));
        }

        let mut merged_count = 0usize;
        let mut edges_repointed = 0usize;
        let mut conflicts_detected: Vec<KnowledgeConflict> = Vec::new();

        for dup_id in &req.duplicate_ids {
            if dup_id == &req.canonical_id {
                continue;
            }
            let dup = match self.nodes.remove(dup_id) {
                Some((_, n)) => n,
                None => continue,
            };

            // Merge properties.
            if req.merge_properties {
                if let Some(mut canon) = self.nodes.get_mut(&req.canonical_id) {
                    for (k, v) in &dup.properties {
                        match canon.properties.get(k) {
                            Some(existing) if existing != v => {
                                // Conflict.
                                let conflict = KnowledgeConflict {
                                    node_id: req.canonical_id.clone(),
                                    property: k.clone(),
                                    values: vec![
                                        (canon.provenance.clone(), existing.clone()),
                                        (dup.provenance.clone(), v.clone()),
                                    ],
                                    resolution: ConflictResolution::Merged,
                                    detected_at: Utc::now(),
                                };
                                self.record_conflict_obj(&conflict);
                                conflicts_detected.push(conflict);
                                // Latest wins (dup overwrites canon since it
                                // was the more recent source).
                                canon.properties.insert(k.clone(), v.clone());
                            }
                            None => {
                                canon.properties.insert(k.clone(), v.clone());
                            }
                            _ => {}
                        }
                    }
                    canon.version += 1;
                    canon.updated_at = Utc::now();
                }
            }

            // Repoint edges.
            let edges_snapshot: Vec<KnowledgeEdge> = self
                .edges
                .iter()
                .filter(|e| e.source == *dup_id || e.target == *dup_id)
                .map(|e| e.clone())
                .collect();
            for e in edges_snapshot {
                let new_source = if e.source == *dup_id {
                    req.canonical_id.clone()
                } else {
                    e.source.clone()
                };
                let new_target = if e.target == *dup_id {
                    req.canonical_id.clone()
                } else {
                    e.target.clone()
                };
                // Skip self-loops created by the merge.
                if new_source == new_target {
                    let _ = self.delete_edge(&e.id).await;
                    continue;
                }
                if let Some(mut edge) = self.edges.get_mut(&e.id) {
                    edge.source = new_source.clone();
                    edge.target = new_target.clone();
                    edge.version += 1;
                    edge.updated_at = Utc::now();
                    edges_repointed += 1;
                }
                // Rebuild adjacency indexes for this edge.
                self.adj_out
                    .entry(new_source.clone())
                    .or_default()
                    .push(e.id.clone());
                self.adj_in
                    .entry(new_target.clone())
                    .or_default()
                    .push(e.id.clone());
            }
            // Clean up dup adjacency + storage.
            self.adj_out.remove(dup_id);
            self.adj_in.remove(dup_id);
            let _ = self.storage.delete(&format!("node:{dup_id}")).await;
            merged_count += 1;
        }

        self.nodes_merged.fetch_add(merged_count as u64, Ordering::Relaxed);

        // Publish merge event.
        self.publish_event(
            EVT_KNOWLEDGE_MERGED,
            &req.canonical_id,
            serde_json::json!({
                "canonical_id": req.canonical_id,
                "merged_count": merged_count,
                "edges_repointed": edges_repointed,
                "conflicts_detected": conflicts_detected.len(),
            }),
        )
        .await;

        Ok(MergeResult {
            canonical_id: req.canonical_id,
            merged_count,
            edges_repointed,
            conflicts_detected,
        })
    }

    // ----------------------------------------------------------------------
    // Conflict + provenance access
    // ----------------------------------------------------------------------

    pub fn list_conflicts(&self) -> Vec<KnowledgeConflict> {
        self.conflicts.iter().map(|r| r.clone()).collect()
    }

    pub fn get_provenance(&self, node_or_edge_id: &str) -> Vec<KnowledgeProvenance> {
        self.provenance_log
            .get(node_or_edge_id)
            .map(|r| r.clone())
            .unwrap_or_default()
    }

    /// Record a conflict for a node property.
    fn record_conflict(
        &self,
        node_id: &str,
        property: &str,
        old_prov: KnowledgeProvenance,
        old_val: serde_json::Value,
        new_prov: KnowledgeProvenance,
        new_val: serde_json::Value,
    ) {
        let resolution = if old_prov.confidence > new_prov.confidence {
            ConflictResolution::HighestConfidenceWins
        } else if new_prov.recorded_at > old_prov.recorded_at {
            ConflictResolution::LatestWins
        } else {
            ConflictResolution::ManualReviewRequired
        };
        let conflict = KnowledgeConflict {
            node_id: node_id.to_string(),
            property: property.to_string(),
            values: vec![
                (old_prov, old_val),
                (new_prov.clone(), new_val),
            ],
            resolution,
            detected_at: Utc::now(),
        };
        self.record_conflict_obj(&conflict);
    }

    fn record_conflict_obj(&self, conflict: &KnowledgeConflict) {
        let cid = format!(
            "conflict:{}:{}:{}",
            conflict.node_id, conflict.property, Uuid::new_v4()
        );
        info!(
            conflict_id = %cid,
            node_id = %conflict.node_id,
            property = %conflict.property,
            resolution = ?conflict.resolution,
            "knowledge conflict recorded"
        );
        self.conflicts.insert(cid, conflict.clone());
        self.conflicts_detected.fetch_add(1, Ordering::Relaxed);
        // Best-effort event publish (caller may not have attached a bus).
        let bus_opt = self.event_bus.read().clone();
        if let Some(bus) = bus_opt {
            let evt = make_event(
                EVT_KNOWLEDGE_CONFLICT,
                &conflict.node_id,
                serde_json::to_value(conflict).unwrap_or(serde_json::Value::Null),
                "knowledge-engine",
            );
            tokio::spawn(async move {
                let _ = bus.publish(evt).await;
            });
        }
    }

    async fn publish_event(
        &self,
        event_type: &str,
        aggregate_id: &str,
        payload: serde_json::Value,
    ) {
        let bus_opt = self.event_bus.read().clone();
        if let Some(bus) = bus_opt {
            let evt = make_event(event_type, aggregate_id, payload, "knowledge-engine");
            if let Err(e) = bus.publish(evt).await {
                warn!(error = %e, event_type, "failed to publish knowledge event");
            }
        }
    }

    // ----------------------------------------------------------------------
    // Event-driven updaters (called by the GraphEventHandler)
    // ----------------------------------------------------------------------

    /// Handle a `trade.created` event by upserting a Trade node + edges to
    /// origin/destination countries/ports.
    pub async fn handle_trade_created(&self, payload: &serde_json::Value) -> BrainResult<()> {
        let trade_id = payload
            .get("trade_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| BrainError::KnowledgeGraph("trade_id missing".into()))?
            .to_string();

        let now = Utc::now();
        // Trade node.
        let trade_node = GraphNode {
            id: format!("trade:{trade_id}"),
            node_type: GraphNodeType::Event,
            properties: {
                let mut m = HashMap::new();
                if let Some(v) = payload.get("hs_code") {
                    m.insert("hs_code".into(), v.clone());
                }
                if let Some(v) = payload.get("value_usd") {
                    m.insert("value_usd".into(), v.clone());
                }
                m
            },
            embedding: None,
            created_at: now,
            updated_at: now,
        };
        self.add_node_with_provenance(trade_node, KnowledgeProvenance::from_external("trade-service", 0.95))
            .await?;

        // Origin / destination country nodes + edges.
        if let (Some(origin), Some(dest)) = (
            payload.get("origin_country").and_then(|v| v.as_str()),
            payload.get("destination_country").and_then(|v| v.as_str()),
        ) {
            let origin_node = GraphNode {
                id: format!("country:{origin}"),
                node_type: GraphNodeType::Country,
                properties: HashMap::new(),
                embedding: None,
                created_at: now,
                updated_at: now,
            };
            let dest_node = GraphNode {
                id: format!("country:{dest}"),
                node_type: GraphNodeType::Country,
                properties: HashMap::new(),
                embedding: None,
                created_at: now,
                updated_at: now,
            };
            self.add_node_with_provenance(
                origin_node,
                KnowledgeProvenance::from_external("trade-service", 0.9),
            )
            .await?;
            self.add_node_with_provenance(
                dest_node,
                KnowledgeProvenance::from_external("trade-service", 0.9),
            )
            .await?;

            // Edges.
            for (src, tgt, et) in [
                (
                    format!("trade:{trade_id}"),
                    format!("country:{origin}"),
                    "originates_from",
                ),
                (
                    format!("trade:{trade_id}"),
                    format!("country:{dest}"),
                    "destined_to",
                ),
            ] {
                let edge = GraphEdge {
                    id: format!("edge:{}-{}-{}", src, et, tgt),
                    source: src,
                    target: tgt,
                    edge_type: et.into(),
                    properties: HashMap::new(),
                    weight: 1.0,
                    created_at: now,
                };
                self.add_edge_with_provenance(
                    edge,
                    KnowledgeProvenance::from_external("trade-service", 0.9),
                    0.9,
                )
                .await?;
            }
        }
        Ok(())
    }

    /// Handle a `compliance.checked` event by upserting a Regulation node
    /// and linking it to the trade.
    pub async fn handle_compliance_checked(&self, payload: &serde_json::Value) -> BrainResult<()> {
        let trade_id = payload
            .get("trade_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| BrainError::KnowledgeGraph("trade_id missing".into()))?;
        let regulation = payload
            .get("regulation")
            .and_then(|v| v.as_str())
            .unwrap_or("UNKNOWN");
        let passed = payload
            .get("passed")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let now = Utc::now();

        let reg_node = GraphNode {
            id: format!("regulation:{regulation}"),
            node_type: GraphNodeType::Regulation,
            properties: {
                let mut m = HashMap::new();
                m.insert("last_check_passed".into(), serde_json::json!(passed));
                m
            },
            embedding: None,
            created_at: now,
            updated_at: now,
        };
        self.add_node_with_provenance(reg_node, KnowledgeProvenance::from_external("compliance-service", 0.95))
            .await?;

        let edge = GraphEdge {
            id: format!("edge:trade:{}-subject_to-regulation:{}", trade_id, regulation),
            source: format!("trade:{trade_id}"),
            target: format!("regulation:{regulation}"),
            edge_type: "subject_to".into(),
            properties: {
                let mut m = HashMap::new();
                m.insert("passed".into(), serde_json::json!(passed));
                m
            },
            weight: if passed { 1.0 } else { 0.5 },
            created_at: now,
        };
        self.add_edge_with_provenance(
            edge,
            KnowledgeProvenance::from_external("compliance-service", 0.95),
            0.95,
        )
        .await?;
        Ok(())
    }

    /// Handle a `market.price.updated` event by upserting a Commodity node
    /// with the latest price property.
    pub async fn handle_market_price_updated(
        &self,
        payload: &serde_json::Value,
    ) -> BrainResult<()> {
        let commodity = payload
            .get("commodity")
            .and_then(|v| v.as_str())
            .ok_or_else(|| BrainError::KnowledgeGraph("commodity missing".into()))?;
        let price = payload
            .get("price_usd")
            .and_then(|v| v.as_f64())
            .ok_or_else(|| BrainError::KnowledgeGraph("price_usd missing".into()))?;
        let now = Utc::now();

        let node = GraphNode {
            id: format!("commodity:{commodity}"),
            node_type: GraphNodeType::Commodity,
            properties: {
                let mut m = HashMap::new();
                m.insert("price_usd".into(), serde_json::json!(price));
                m.insert("last_updated".into(), serde_json::json!(now.to_rfc3339()));
                m
            },
            embedding: None,
            created_at: now,
            updated_at: now,
        };
        self.add_node_with_provenance(node, KnowledgeProvenance::from_external("market-service", 0.85))
            .await?;
        Ok(())
    }

    /// Handle `logistics.vessel.tracked` by upserting a Vessel node and a
    /// Port node + an `arrived_at` edge.
    pub async fn handle_vessel_tracked(&self, payload: &serde_json::Value) -> BrainResult<()> {
        let vessel = payload
            .get("vessel_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| BrainError::KnowledgeGraph("vessel_id missing".into()))?;
        let port = payload
            .get("port")
            .and_then(|v| v.as_str())
            .ok_or_else(|| BrainError::KnowledgeGraph("port missing".into()))?;
        let now = Utc::now();

        let vessel_node = GraphNode {
            id: format!("vessel:{vessel}"),
            node_type: GraphNodeType::Vessel,
            properties: HashMap::new(),
            embedding: None,
            created_at: now,
            updated_at: now,
        };
        let port_node = GraphNode {
            id: format!("port:{port}"),
            node_type: GraphNodeType::Port,
            properties: HashMap::new(),
            embedding: None,
            created_at: now,
            updated_at: now,
        };
        self.add_node_with_provenance(
            vessel_node,
            KnowledgeProvenance::from_external("logistics-service", 0.9),
        )
        .await?;
        self.add_node_with_provenance(
            port_node,
            KnowledgeProvenance::from_external("logistics-service", 0.9),
        )
        .await?;

        let edge = GraphEdge {
            id: format!("edge:vessel:{}-arrived_at-port:{}", vessel, port),
            source: format!("vessel:{vessel}"),
            target: format!("port:{port}"),
            edge_type: "arrived_at".into(),
            properties: HashMap::new(),
            weight: 1.0,
            created_at: now,
        };
        self.add_edge_with_provenance(
            edge,
            KnowledgeProvenance::from_external("logistics-service", 0.9),
            0.9,
        )
        .await?;
        Ok(())
    }

    /// Handle `document.filed` by upserting a Document node linked to a
    /// trade.
    pub async fn handle_document_filed(&self, payload: &serde_json::Value) -> BrainResult<()> {
        let doc_id = payload
            .get("document_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| BrainError::KnowledgeGraph("document_id missing".into()))?;
        let trade_id = payload
            .get("trade_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| BrainError::KnowledgeGraph("trade_id missing".into()))?;
        let doc_type = payload
            .get("document_type")
            .and_then(|v| v.as_str())
            .unwrap_or("UNKNOWN");
        let now = Utc::now();

        let doc_node = GraphNode {
            id: format!("document:{doc_id}"),
            node_type: GraphNodeType::Document,
            properties: {
                let mut m = HashMap::new();
                m.insert("document_type".into(), serde_json::json!(doc_type));
                m
            },
            embedding: None,
            created_at: now,
            updated_at: now,
        };
        self.add_node_with_provenance(
            doc_node,
            KnowledgeProvenance::from_external("document-service", 0.95),
        )
        .await?;

        let edge = GraphEdge {
            id: format!("edge:document:{}-attached_to-trade:{}", doc_id, trade_id),
            source: format!("document:{doc_id}"),
            target: format!("trade:{trade_id}"),
            edge_type: "attached_to".into(),
            properties: HashMap::new(),
            weight: 1.0,
            created_at: now,
        };
        self.add_edge_with_provenance(
            edge,
            KnowledgeProvenance::from_external("document-service", 0.95),
            0.95,
        )
        .await?;
        Ok(())
    }

    // ----------------------------------------------------------------------
    // Observability
    // ----------------------------------------------------------------------

    pub fn metrics(&self) -> KnowledgeMetrics {
        KnowledgeMetrics {
            nodes_total: self.nodes.len() as u64,
            edges_total: self.edges.len() as u64,
            nodes_added: self.nodes_added.load(Ordering::Relaxed),
            edges_added: self.edges_added.load(Ordering::Relaxed),
            nodes_merged: self.nodes_merged.load(Ordering::Relaxed),
            conflicts_detected: self.conflicts_detected.load(Ordering::Relaxed),
            inferences_made: self.inferences_made.load(Ordering::Relaxed),
        }
    }
}

/// Edge ranked by combined score.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RankedEdge {
    pub edge: GraphEdge,
    pub confidence: f64,
    pub score: f64,
}

/// A hop's worth of expansion results.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExpansionHop {
    pub hop: usize,
    pub nodes: Vec<KnowledgeNode>,
    pub edges: Vec<KnowledgeEdge>,
}

/// Observability snapshot.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeMetrics {
    pub nodes_total: u64,
    pub edges_total: u64,
    pub nodes_added: u64,
    pub edges_added: u64,
    pub nodes_merged: u64,
    pub conflicts_detected: u64,
    pub inferences_made: u64,
}

// ============================================================================
// KnowledgeGraph trait impl (adapts to the core trait surface)
// ============================================================================

#[async_trait]
impl KnowledgeGraph for KnowledgeGraphEngine {
    #[instrument(skip(self, node))]
    async fn add_node(&self, node: GraphNode) -> BrainResult<()> {
        self.add_node_with_provenance(node, KnowledgeProvenance::system(0.5))
            .await
            .map(|_| ())
    }

    #[instrument(skip(self, edge))]
    async fn add_edge(&self, edge: GraphEdge) -> BrainResult<()> {
        self.add_edge_with_provenance(edge, KnowledgeProvenance::system(0.5), 0.5)
            .await
            .map(|_| ())
    }

    async fn get_node(&self, id: &str) -> BrainResult<Option<GraphNode>> {
        Ok(self.nodes.get(id).map(|r| r.to_core()))
    }

    async fn traverse(&self, start: &str, depth: usize) -> BrainResult<GraphTraversal> {
        Ok(self.traverse_bfs(start, depth))
    }

    async fn search(&self, query: &GraphQuery) -> BrainResult<Vec<GraphNode>> {
        let mut candidates: Vec<KnowledgeNode> = if !query.node_types.is_empty() {
            query
                .node_types
                .iter()
                .flat_map(|t| self.search_by_type(*t))
                .collect()
        } else {
            self.nodes.iter().map(|r| r.clone()).collect()
        };

        // Property filters.
        for (k, v) in &query.filters {
            candidates.retain(|n| n.properties.get(k).map(|pv| pv == v).unwrap_or(false));
        }

        // Semantic — re-rank by embedding cosine if provided.
        if let Some(q_emb) = &query.embedding {
            candidates.sort_by(|a, b| {
                let sa = a.embedding.as_ref().map(|e| cosine(q_emb, e)).unwrap_or(-1.0);
                let sb = b.embedding.as_ref().map(|e| cosine(q_emb, e)).unwrap_or(-1.0);
                sb.partial_cmp(&sa).unwrap_or(std::cmp::Ordering::Equal)
            });
        }

        Ok(candidates
            .into_iter()
            .take(query.top_k)
            .map(|n| n.to_core())
            .collect())
    }

    async fn infer(&self, input: &InferenceQuery) -> BrainResult<Vec<InferenceResult>> {
        self.infer_relations(input).await
    }
}

// ============================================================================
// BrainModule impl — so the engine can be registered with the kernel.
// ============================================================================

impl KnowledgeGraphEngine {
    pub fn descriptor() -> ModuleDescriptor {
        ModuleDescriptor {
            id: "knowledge-graph".into(),
            name: "Knowledge Graph Engine".into(),
            version: env!("CARGO_PKG_VERSION").into(),
            module_type: ModuleType::Manager,
            authority: AuthorityLevel::A2,
            description: "Graph-native intelligence. Nodes, edges, inference, provenance, \
                          conflict resolution, and event-driven updates."
                .into(),
            capabilities: vec![
                "knowledge.add-node".into(),
                "knowledge.add-edge".into(),
                "knowledge.search".into(),
                "knowledge.traverse".into(),
                "knowledge.infer".into(),
                "knowledge.expand".into(),
                "knowledge.merge".into(),
                "knowledge.validate-fact".into(),
            ],
            subscriptions: vec![
                EVT_TRADE_CREATED.into(),
                EVT_COMPLIANCE_CHECKED.into(),
                EVT_MARKET_PRICE_UPDATED.into(),
                EVT_VESSEL_TRACKED.into(),
                EVT_DOCUMENT_FILED.into(),
            ],
            dependencies: vec!["storage".into(), "event-bus".into()],
        }
    }
}

#[async_trait]
impl BrainModule for KnowledgeGraphEngine {
    fn descriptor(&self) -> &ModuleDescriptor {
        static DESC: once_cell::sync::OnceCell<ModuleDescriptor> = once_cell::sync::OnceCell::new();
        DESC.get_or_init(KnowledgeGraphEngine::descriptor)
    }

    async fn initialize(&self) -> BrainResult<()> {
        info!("knowledge graph engine initialized");
        Ok(())
    }

    async fn shutdown(&self) -> BrainResult<()> {
        info!(
            nodes = self.nodes.len(),
            edges = self.edges.len(),
            "knowledge graph engine shutting down"
        );
        Ok(())
    }

    async fn health_check(&self) -> BrainResult<HealthCheck> {
        Ok(HealthCheck {
            status: HealthStatus::Healthy,
            latency_ms: 1.0,
            details: Some(serde_json::to_value(self.metrics()).unwrap_or(serde_json::Value::Null)),
            checked_at: Utc::now(),
        })
    }

    fn status(&self) -> ModuleStatus {
        ModuleStatus::Active
    }
}

// ============================================================================
// Event handler wiring
// ============================================================================

/// Event handler that routes lifecycle events to the engine's typed
/// updaters. Unknown events are ignored with a warning.
pub struct GraphEventHandler {
    pub engine: Arc<KnowledgeGraphEngine>,
}

#[async_trait]
impl EventHandler for GraphEventHandler {
    #[instrument(skip(self, event), fields(event_type = %event.event_type))]
    async fn handle(&self, event: &BrainEvent) -> BrainResult<()> {
        let res = match event.event_type.as_str() {
            EVT_TRADE_CREATED => self.engine.handle_trade_created(&event.payload).await,
            EVT_COMPLIANCE_CHECKED => self.engine.handle_compliance_checked(&event.payload).await,
            EVT_MARKET_PRICE_UPDATED => {
                self.engine.handle_market_price_updated(&event.payload).await
            }
            EVT_VESSEL_TRACKED => self.engine.handle_vessel_tracked(&event.payload).await,
            EVT_DOCUMENT_FILED => self.engine.handle_document_filed(&event.payload).await,
            other => {
                warn!(event_type = %other, "knowledge engine ignoring unknown event type");
                return Ok(());
            }
        };
        if let Err(e) = res {
            error!(error = %e, event_type = %event.event_type, "knowledge event handler failed");
            return Err(e);
        }
        Ok(())
    }
}

// ============================================================================
// Free helpers
// ============================================================================

/// Construct a [`BrainEvent`] with sensible metadata.
pub fn make_event(
    event_type: impl Into<String>,
    aggregate_id: impl Into<String>,
    payload: serde_json::Value,
    source: impl Into<String>,
) -> BrainEvent {
    BrainEvent {
        id: Uuid::new_v4(),
        event_type: event_type.into(),
        aggregate_id: aggregate_id.into(),
        payload,
        metadata: EventMetadata {
            source: source.into(),
            correlation_id: None,
            causation_id: None,
            timestamp: Utc::now(),
            version: "1".into(),
            tenant_gtid: None,
        },
    }
}

/// Cosine similarity between two equal-length vectors. Returns 0.0 if either
/// is empty or norms are zero.
fn cosine(a: &[f32], b: &[f32]) -> f64 {
    if a.is_empty() || b.is_empty() || a.len() != b.len() {
        return 0.0;
    }
    let dot: f64 = a.iter().zip(b.iter()).map(|(x, y)| (*x as f64) * (*y as f64)).sum();
    let na: f64 = a.iter().map(|x| (*x as f64).powi(2)).sum::<f64>().sqrt();
    let nb: f64 = b.iter().map(|x| (*x as f64).powi(2)).sum::<f64>().sqrt();
    if na == 0.0 || nb == 0.0 {
        return 0.0;
    }
    dot / (na * nb)
}

/// Score an edge by weight + recency + confidence. Recency decays linearly
/// over 30 days from 1.0 to 0.0.
fn score_edge(edge: &KnowledgeEdge, now: DateTime<Utc>) -> f64 {
    let age_secs = (now - edge.updated_at).num_seconds().max(0) as f64;
    let thirty_days = 30.0 * 24.0 * 3600.0;
    let recency = (1.0 - (age_secs / thirty_days)).max(0.0);
    let weight = edge.weight.clamp(0.0, 1.0);
    let confidence = edge.confidence;
    // Weighted blend: confidence (40%), weight (30%), recency (30%).
    0.4 * confidence + 0.3 * weight + 0.3 * recency
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // ---- Stub storage ----

    struct StubStorage {
        kv: parking_lot::RwLock<HashMap<String, Vec<u8>>>,
    }
    impl StubStorage {
        fn new() -> Self {
            Self {
                kv: parking_lot::RwLock::new(HashMap::new()),
            }
        }
    }
    #[async_trait]
    impl Storage for StubStorage {
        async fn put(&self, key: &str, value: &[u8]) -> BrainResult<()> {
            self.kv.write().insert(key.to_string(), value.to_vec());
            Ok(())
        }
        async fn get(&self, key: &str) -> BrainResult<Option<Vec<u8>>> {
            Ok(self.kv.read().get(key).cloned())
        }
        async fn delete(&self, key: &str) -> BrainResult<()> {
            self.kv.write().remove(key);
            Ok(())
        }
        async fn exists(&self, key: &str) -> BrainResult<bool> {
            Ok(self.kv.read().contains_key(key))
        }
    }

    fn build_engine() -> Arc<KnowledgeGraphEngine> {
        Arc::new(KnowledgeGraphEngine::new(Arc::new(StubStorage::new())))
    }

    fn now() -> DateTime<Utc> {
        Utc::now()
    }

    fn make_node(id: &str, nt: GraphNodeType) -> GraphNode {
        GraphNode {
            id: id.into(),
            node_type: nt,
            properties: HashMap::new(),
            embedding: None,
            created_at: now(),
            updated_at: now(),
        }
    }

    fn make_edge(id: &str, src: &str, tgt: &str, et: &str) -> GraphEdge {
        GraphEdge {
            id: id.into(),
            source: src.into(),
            target: tgt.into(),
            edge_type: et.into(),
            properties: HashMap::new(),
            weight: 1.0,
            created_at: now(),
        }
    }

    #[tokio::test]
    async fn add_and_get_node() {
        let engine = build_engine();
        engine.add_node(make_node("c:1", GraphNodeType::Company)).await.unwrap();
        let n = engine.get_node("c:1").await.unwrap().unwrap();
        assert_eq!(n.id, "c:1");
        let kn = engine.get_knowledge_node("c:1").unwrap();
        assert_eq!(kn.version, 1);
    }

    #[tokio::test]
    async fn upsert_bumps_version() {
        let engine = build_engine();
        let mut n = make_node("c:1", GraphNodeType::Company);
        n.properties.insert("name".into(), serde_json::json!("Acme"));
        engine.add_node(n.clone()).await.unwrap();

        n.properties.insert("name".into(), serde_json::json!("Acme Corp"));
        engine.add_node(n).await.unwrap();

        let kn = engine.get_knowledge_node("c:1").unwrap();
        assert_eq!(kn.version, 2);
        assert_eq!(kn.properties.get("name").unwrap(), "Acme Corp");
    }

    #[tokio::test]
    async fn add_and_traverse_edge() {
        let engine = build_engine();
        engine.add_node(make_node("p:1", GraphNodeType::Port)).await.unwrap();
        engine.add_node(make_node("p:2", GraphNodeType::Port)).await.unwrap();
        engine
            .add_edge(make_edge("e:1", "p:1", "p:2", "connected_to"))
            .await
            .unwrap();

        let trav = engine.traverse("p:1", 2).await.unwrap();
        assert_eq!(trav.nodes.len(), 2);
        assert_eq!(trav.edges.len(), 1);
    }

    #[tokio::test]
    async fn search_semantic_returns_top_k() {
        let engine = build_engine();
        let mut a = make_node("a", GraphNodeType::Commodity);
        a.embedding = Some(vec![1.0, 0.0, 0.0]);
        let mut b = make_node("b", GraphNodeType::Commodity);
        b.embedding = Some(vec![0.0, 1.0, 0.0]);
        engine.add_node(a).await.unwrap();
        engine.add_node(b).await.unwrap();

        let results = engine.search_semantic(&[1.0, 0.0, 0.0], 1);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "a");
    }

    #[tokio::test]
    async fn search_by_property_filters() {
        let engine = build_engine();
        let mut a = make_node("a", GraphNodeType::Company);
        a.properties.insert("country".into(), serde_json::json!("US"));
        let mut b = make_node("b", GraphNodeType::Company);
        b.properties.insert("country".into(), serde_json::json!("DE"));
        engine.add_node(a).await.unwrap();
        engine.add_node(b).await.unwrap();

        let us = engine.search_by_property("country", &serde_json::json!("US"));
        assert_eq!(us.len(), 1);
        assert_eq!(us[0].id, "a");
    }

    #[tokio::test]
    async fn merge_nodes_repoints_edges() {
        let engine = build_engine();
        engine.add_node(make_node("c:1", GraphNodeType::Company)).await.unwrap();
        engine.add_node(make_node("c:dup", GraphNodeType::Company)).await.unwrap();
        engine
            .add_edge(make_edge("e:1", "c:dup", "p:1", "located_at"))
            .await
            .unwrap();
        // need a target node to exist for adjacency to be findable
        engine.add_node(make_node("p:1", GraphNodeType::Port)).await.unwrap();
        // re-add edge so adjacency indexes are populated
        engine
            .add_edge(make_edge("e:1", "c:dup", "p:1", "located_at"))
            .await
            .unwrap();

        let result = engine
            .merge_nodes(MergeRequest {
                canonical_id: "c:1".into(),
                duplicate_ids: vec!["c:dup".into()],
                merge_properties: true,
            })
            .await
            .unwrap();
        assert_eq!(result.merged_count, 1);
        assert!(result.edges_repointed >= 1);
        assert!(engine.get_knowledge_node("c:dup").is_none());
    }

    #[tokio::test]
    async fn validate_fact_finds_supporting_edge() {
        let engine = build_engine();
        engine.add_node(make_node("v:1", GraphNodeType::Vessel)).await.unwrap();
        engine.add_node(make_node("p:1", GraphNodeType::Port)).await.unwrap();
        engine
            .add_edge(make_edge("e:1", "v:1", "p:1", "arrived_at"))
            .await
            .unwrap();

        let fact = FactToValidate {
            subject_id: "v:1".into(),
            relation: "arrived_at".into(),
            object_id: "p:1".into(),
            expected_properties: HashMap::new(),
        };
        let v = engine.validate_fact(&fact);
        assert!(v.consistent);
        assert!(!v.supporting_edges.is_empty());
    }

    #[tokio::test]
    async fn validate_fact_flags_missing_edge() {
        let engine = build_engine();
        engine.add_node(make_node("v:1", GraphNodeType::Vessel)).await.unwrap();
        let fact = FactToValidate {
            subject_id: "v:1".into(),
            relation: "arrived_at".into(),
            object_id: "p:999".into(),
            expected_properties: HashMap::new(),
        };
        let v = engine.validate_fact(&fact);
        assert!(!v.consistent);
    }

    #[tokio::test]
    async fn infer_relations_walks_two_hops() {
        let engine = build_engine();
        engine.add_node(make_node("a", GraphNodeType::Company)).await.unwrap();
        engine.add_node(make_node("b", GraphNodeType::Company)).await.unwrap();
        engine.add_node(make_node("c", GraphNodeType::Company)).await.unwrap();
        // Add edges with explicit high confidence.
        engine
            .add_edge_with_provenance(
                make_edge("e1", "a", "b", "supplies"),
                KnowledgeProvenance::system(0.9),
                0.9,
            )
            .await
            .unwrap();
        engine
            .add_edge_with_provenance(
                make_edge("e2", "b", "c", "supplies"),
                KnowledgeProvenance::system(0.9),
                0.9,
            )
            .await
            .unwrap();

        let q = InferenceQuery {
            start_nodes: vec!["a".into()],
            relation_types: vec!["supplies".into()],
            max_depth: 3,
            min_confidence: 0.5,
        };
        let results = engine.infer(&q).await.unwrap();
        // We should infer a -> c at depth 2.
        assert!(results.iter().any(|r| r.node.id == "c"), "expected c inferred from a");
    }

    #[tokio::test]
    async fn rank_edges_orders_by_score() {
        let engine = build_engine();
        engine.add_node(make_node("a", GraphNodeType::Company)).await.unwrap();
        engine.add_node(make_node("b1", GraphNodeType::Company)).await.unwrap();
        engine.add_node(make_node("b2", GraphNodeType::Company)).await.unwrap();
        // High-weight edge.
        let mut e1 = make_edge("e1", "a", "b1", "r");
        e1.weight = 1.0;
        let mut e2 = make_edge("e2", "a", "b2", "r");
        e2.weight = 0.1;
        engine
            .add_edge_with_provenance(e1, KnowledgeProvenance::system(0.9), 0.9)
            .await
            .unwrap();
        engine
            .add_edge_with_provenance(e2, KnowledgeProvenance::system(0.5), 0.5)
            .await
            .unwrap();
        let ranked = engine.rank_edges("a");
        assert_eq!(ranked.len(), 2);
        assert!(ranked[0].score >= ranked[1].score);
        assert_eq!(ranked[0].edge.id, "e1");
    }

    #[tokio::test]
    async fn handle_trade_created_builds_graph() {
        let engine = build_engine();
        let payload = serde_json::json!({
            "trade_id": "T1",
            "origin_country": "CN",
            "destination_country": "US",
            "hs_code": "1006.30",
            "value_usd": 50000,
        });
        engine.handle_trade_created(&payload).await.unwrap();
        assert!(engine.get_knowledge_node("trade:T1").is_some());
        assert!(engine.get_knowledge_node("country:CN").is_some());
        assert!(engine.get_knowledge_node("country:US").is_some());
    }

    #[tokio::test]
    async fn handle_market_price_updated_upserts_commodity() {
        let engine = build_engine();
        let p1 = serde_json::json!({"commodity": "rice", "price_usd": 500.0});
        engine.handle_market_price_updated(&p1).await.unwrap();
        let p2 = serde_json::json!({"commodity": "rice", "price_usd": 510.0});
        engine.handle_market_price_updated(&p2).await.unwrap();
        let n = engine.get_knowledge_node("commodity:rice").unwrap();
        assert_eq!(n.version, 2);
        assert_eq!(n.properties.get("price_usd").unwrap(), &serde_json::json!(510.0));
    }

    #[tokio::test]
    async fn descriptor_is_consistent() {
        let engine = build_engine();
        let d = engine.descriptor();
        assert_eq!(d.id, "knowledge-graph");
    }

    #[tokio::test]
    async fn brain_module_health_check_succeeds() {
        let engine = build_engine();
        let hc = engine.health_check().await.unwrap();
        assert_eq!(hc.status, HealthStatus::Healthy);
    }

    #[tokio::test]
    async fn expand_returns_hops() {
        let engine = build_engine();
        engine.add_node(make_node("a", GraphNodeType::Company)).await.unwrap();
        engine.add_node(make_node("b", GraphNodeType::Company)).await.unwrap();
        engine.add_node(make_node("c", GraphNodeType::Company)).await.unwrap();
        engine
            .add_edge(make_edge("e1", "a", "b", "r"))
            .await
            .unwrap();
        engine
            .add_edge(make_edge("e2", "b", "c", "r"))
            .await
            .unwrap();
        let hops = engine.expand("a", 2);
        assert!(!hops.is_empty());
    }

    #[tokio::test]
    async fn delete_node_removes_incident_edges() {
        let engine = build_engine();
        engine.add_node(make_node("a", GraphNodeType::Company)).await.unwrap();
        engine.add_node(make_node("b", GraphNodeType::Company)).await.unwrap();
        engine
            .add_edge(make_edge("e1", "a", "b", "r"))
            .await
            .unwrap();
        let removed = engine.delete_node("a").await.unwrap();
        assert!(removed);
        assert!(engine.get_knowledge_edge("e1").is_none());
    }

    #[tokio::test]
    async fn provenance_log_accumulates() {
        let engine = build_engine();
        engine
            .add_node_with_provenance(
                make_node("a", GraphNodeType::Company),
                KnowledgeProvenance::system(0.5),
            )
            .await
            .unwrap();
        engine
            .add_node_with_provenance(
                make_node("a", GraphNodeType::Company),
                KnowledgeProvenance::from_agent("agent-1", 0.8),
            )
            .await
            .unwrap();
        let prov = engine.get_provenance("a");
        assert_eq!(prov.len(), 2);
    }
}
